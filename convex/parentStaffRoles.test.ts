/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { createTest } from '../testUtils';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert('users', { email: 'coach@example.invalid' });
    const parentAuth = await ctx.db.insert('users', { email: 'parent@example.invalid' });
    const coach = await ctx.db.insert('appUsers', { authUserId: coachAuth, email: 'coach@example.invalid', name: 'Coach', role: 'coach', active: true, travelLead: false, financialEdit: true });
    const parent = await ctx.db.insert('appUsers', { authUserId: parentAuth, email: 'parent@example.invalid', name: 'Parent', role: 'parent', active: true, travelLead: false, financialEdit: false });
    await ctx.db.insert('parentEmailIdentities', { authUserId: parentAuth, email: 'parent@example.invalid', createdAt: 1 });
    const session = await ctx.db.insert('authSessions', { userId: parentAuth, expirationTime: Date.now() + 86400000 });
    const otherSession = await ctx.db.insert('authSessions', { userId: parentAuth, expirationTime: Date.now() + 86400000 });
    const season = await ctx.db.insert('seasons', { name: 'Synthetic season', year: 2026, status: 'active', startsAt: 0, permissionVersion: 'v1', createdBy: coach });
    const student = await ctx.db.insert('students', { seasonId: season, legalName: 'Synthetic Student', preferredName: 'Synthetic Student', email: 'student@example.invalid', subteam: 'Build', travelTeam: false, active: true, roomCategoryLocked: false, allergies: {state:'none'}, medications: {state:'none'} });
    const ownChild = await ctx.db.insert('students', { seasonId: season, legalName: 'Linked Child', preferredName: 'Linked Child', email: 'child@example.invalid', subteam: 'Build', travelTeam: false, active: true, roomCategoryLocked: false, allergies: {state:'none'}, medications: {state:'none'} });
    const link = await ctx.db.insert('familyLinks', {parentUserId:parent,studentId:ownChild,seasonId:season,active:true,createdBy:coach});
    return { coachAuth, parentAuth, coach, parent, session, otherSession, student, ownChild, link };
  });
  return { t, ids, coach: t.withIdentity({subject:`${ids.coachAuth}|session`}), parent: t.withIdentity({subject:`${ids.parentAuth}|${ids.session}`}), second: t.withIdentity({subject:`${ids.parentAuth}|${ids.otherSession}`}) };
}

describe('Parent staff roles', () => {
  it('requires Coach authorization, a Parent target, an explanation, and a current revision', async () => {
    const f = await fixture();
    const grant = { userId: f.ids.parent, expectedRevision: 0, staffAccess: 'travelLead' as const, reason: 'Approved travel volunteer' };
    await expect(f.parent.mutation(api.accounts.updateParentStaffAccess, grant)).rejects.toThrow('permission');
    await expect(f.coach.mutation(api.accounts.updateParentStaffAccess, {...grant, userId:f.ids.coach})).rejects.toThrow('Parent');
    await expect(f.coach.mutation(api.accounts.updateParentStaffAccess, {...grant, reason:''})).rejects.toThrow('reason');
    await f.coach.mutation(api.accounts.updateParentStaffAccess, grant);
    await expect(f.coach.mutation(api.accounts.updateParentStaffAccess, grant)).rejects.toThrow('changed');
    await expect(f.parent.mutation(api.accounts.selectOperatingRole, {role:'coach'} as never)).rejects.toThrow();
  });

  it('isolates selected session roles and immediately removes staff access when revoked', async () => {
    const f = await fixture();
    await f.coach.mutation(api.accounts.updateParentStaffAccess, {userId:f.ids.parent, expectedRevision:0, staffAccess:'travelLead', reason:'Approved travel volunteer'});
    expect(await f.parent.query(api.app.viewer, {})).toMatchObject({ roleSelectionRequired:true, availableRoles:['parent','mentor','travelLead'], user:{role:'parent',travelLead:false} });
    await expect(f.parent.query(api.app.studentProfile, {studentId:f.ids.student})).rejects.toThrow('permission');
    await f.parent.mutation(api.accounts.selectOperatingRole, {role:'travelLead'});
    expect(await f.parent.query(api.app.viewer, {})).toMatchObject({ roleSelectionRequired:false, user:{role:'mentor',travelLead:true,financialEdit:false,healthExport:false} });
    expect(await f.parent.query(api.app.studentProfile, {studentId:f.ids.student})).toMatchObject({_id:f.ids.student});
    expect(await f.second.query(api.app.viewer, {})).toMatchObject({roleSelectionRequired:true,user:{role:'parent',travelLead:false}});
    await f.parent.mutation(api.accounts.selectOperatingRole, {role:'mentor'});
    await expect(f.parent.query(api.app.studentProfile, {studentId:f.ids.student})).rejects.toThrow('permission');
    await expect(f.parent.query(api.accounts.workspace, {role:'mentor',paginationOpts:{cursor:null,numItems:10}})).rejects.toThrow('permission');
    await f.parent.mutation(api.accounts.selectOperatingRole, {role:'parent'});
    expect(await f.parent.query(api.app.studentProfile, {studentId:f.ids.ownChild})).toMatchObject({_id:f.ids.ownChild});
    await expect(f.parent.query(api.app.studentProfile, {studentId:f.ids.student})).rejects.toThrow('permission');
    await f.parent.mutation(api.accounts.selectOperatingRole, {role:'travelLead'});
    await f.coach.mutation(api.accounts.updateParentStaffAccess, {userId:f.ids.parent, expectedRevision:1, staffAccess:null, reason:'Travel assignment ended'});
    expect(await f.parent.query(api.app.viewer, {})).toMatchObject({roleSelectionRequired:false,user:{role:'parent',travelLead:false}});
    await expect(f.parent.query(api.app.studentProfile, {studentId:f.ids.student})).rejects.toThrow('permission');
    await expect(f.parent.mutation(api.accounts.selectOperatingRole, {role:'travelLead'})).rejects.toThrow('not available');
    expect(await f.t.run(ctx=>ctx.db.get(f.ids.parent))).toMatchObject({role:'parent',travelLead:false,financialEdit:false});
    expect(await f.t.run(ctx=>ctx.db.get(f.ids.link))).toMatchObject({active:true,studentId:f.ids.ownChild,parentUserId:f.ids.parent});
    expect((await f.t.run(ctx=>ctx.db.query('audit').withIndex('by_entity_and_entityId', q=>q.eq('entity','appUsers').eq('entityId',f.ids.parent)).take(10))).map(row=>row.action)).toContain('updateParentStaffAccess');
  });

  it('never offers Travel Lead to a Mentor-only Parent or staff roles to an inactive Parent', async () => {
    const f = await fixture();
    await f.coach.mutation(api.accounts.updateParentStaffAccess, {userId:f.ids.parent,expectedRevision:0,staffAccess:'mentor',reason:'Approved mentor'});
    await expect(f.parent.mutation(api.accounts.selectOperatingRole,{role:'travelLead'})).rejects.toThrow('not available');
    await f.parent.mutation(api.accounts.selectOperatingRole,{role:'mentor'});
    await f.t.run(ctx=>ctx.db.patch(f.ids.parent,{active:false}));
    await expect(f.parent.mutation(api.accounts.selectOperatingRole,{role:'mentor'})).rejects.toThrow('inactive');
    expect(await f.parent.query(api.app.viewer,{})).toMatchObject({status:'pending',user:null});
  });

  it('requires a new choice when a Coach reduces access and rejects an expired selection session', async () => {
    const f = await fixture();
    await f.coach.mutation(api.accounts.updateParentStaffAccess,{userId:f.ids.parent,expectedRevision:0,staffAccess:'travelLead',reason:'Approved lead'});
    await f.parent.mutation(api.accounts.selectOperatingRole,{role:'travelLead'});
    await f.coach.mutation(api.accounts.updateParentStaffAccess,{userId:f.ids.parent,expectedRevision:1,staffAccess:'mentor',reason:'Mentor duties only'});
    expect(await f.parent.query(api.app.viewer,{})).toMatchObject({roleSelectionRequired:true,availableRoles:['parent','mentor'],user:{role:'parent',travelLead:false}});
    await f.t.run(ctx=>ctx.db.patch(f.ids.session,{expirationTime:0}));
    await expect(f.parent.mutation(api.accounts.selectOperatingRole,{role:'mentor'})).rejects.toThrow('Sign in again');
  });
});
