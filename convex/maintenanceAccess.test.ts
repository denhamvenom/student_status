/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTest as convexTest } from '../testUtils';
import { api } from './_generated/api';
import { tokenHash } from './lib/invitationIdentity';
import { requireMaintenanceAccess } from './lib/maintenanceAccess';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const closedMessage = 'Sign-in is temporarily closed for maintenance';

afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert('users', { email: 'coach@example.invalid', name: 'Coach' });
    const mentorAuth = await ctx.db.insert('users', { email: 'mentor@example.invalid', name: 'Mentor' });
    const newStudentAuth = await ctx.db.insert('users', { email: 'student@example.invalid', name: 'New Student' });
    const coach = await ctx.db.insert('appUsers', { authUserId: coachAuth, email: 'coach@example.invalid', name: 'Coach', role: 'coach', travelLead: false, financialEdit: true, active: true });
    await ctx.db.insert('appUsers', { authUserId: mentorAuth, email: 'mentor@example.invalid', name: 'Mentor', role: 'mentor', travelLead: false, financialEdit: false, active: true });
    const season = await ctx.db.insert('seasons', { name: 'Synthetic season', year: 2026, status: 'active', startsAt: 0, permissionVersion: 'SYNTHETIC', createdBy: coach });
    const event = await ctx.db.insert('events', { seasonId: season, name: 'Synthetic event', type: 'Outreach', startsAt: 1000, endsAt: 2000, destination: 'Synthetic venue', travel: 'Team', overnight: false, roomingEnabled: false, feeCents: 0, signupMode: 'open', allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    return { coachAuth, mentorAuth, newStudentAuth, event };
  });
  return {
    t, ids,
    coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }),
    mentor: t.withIdentity({ subject: `${ids.mentorAuth}|session` }),
    newStudent: t.withIdentity({ subject: `${ids.newStudentAuth}|session` }),
  };
}

async function invitationFixture() {
  const f = await fixture();
  const adultToken = 'a'.repeat(64);
  const parentToken = 'b'.repeat(64);
  const ids = await f.t.run(async ctx => {
    const adultAuth = await ctx.db.insert('users', { email: 'adult@example.invalid', name: 'Invited Adult', emailVerificationTime: 1 });
    const parentAuth = await ctx.db.insert('users', { email: 'parent@example.invalid', name: 'Invited Parent', emailVerificationTime: 1 });
    const studentAuth = await ctx.db.insert('users', { email: 'own-student@example.invalid', name: 'Own Student' });
    for (const [userId, email] of [[adultAuth, 'adult@example.invalid'], [parentAuth, 'parent@example.invalid']] as const) {
      await ctx.db.insert('authAccounts', { userId, provider: 'google', providerAccountId: email, emailVerified: email });
    }
    const coach = await ctx.db.query('appUsers').withIndex('by_authUserId', q => q.eq('authUserId', f.ids.coachAuth)).unique();
    const season = await ctx.db.query('seasons').withIndex('by_status', q => q.eq('status', 'active')).unique();
    if (!coach || !season) throw new Error('Synthetic fixture is incomplete.');
    const studentUser = await ctx.db.insert('appUsers', { authUserId: studentAuth, email: 'own-student@example.invalid', name: 'Own Student', role: 'student', travelLead: false, financialEdit: false, active: true });
    const student = await ctx.db.insert('students', { seasonId: season._id, userId: studentUser, legalName: 'Synthetic Student', preferredName: 'Student', email: 'own-student@example.invalid', subteam: 'Build', active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: 'unknown' }, medications: { state: 'unknown' } });
    const adultInvitation = await ctx.db.insert('adultInvitations', { email: 'adult@example.invalid', role: 'mentor', travelLead: false, financialEdit: false, healthExport: false, tokenHash: await tokenHash(adultToken), status: 'pending', createdBy: coach._id, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
    const parentInvitation = await ctx.db.insert('parentInvitations', { studentId: student, parentEmail: 'parent@example.invalid', tokenHash: await tokenHash(parentToken), status: 'pending', createdBy: studentUser, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
    return { adultAuth, parentAuth, adultInvitation, parentInvitation, student };
  });
  return { ...f, ids: { ...f.ids, ...ids }, adultToken, parentToken, adult: f.t.withIdentity({ subject: `${ids.adultAuth}|session` }), parent: f.t.withIdentity({ subject: `${ids.parentAuth}|session` }) };
}

describe('temporary sign-in maintenance access', () => {
  it('lets the designated existing Coach read the viewer and events while the gate is enabled', async () => {
    const f = await fixture();
    vi.stubEnv('SIGN_IN_MAINTENANCE_COACH_EMAIL', ' COACH@EXAMPLE.INVALID ');
    expect(await f.coach.query(api.app.viewer, {})).toMatchObject({ status: 'active', user: { role: 'coach' } });
    expect((await f.coach.query(api.app.listEvents, {})).map(row => row.event._id)).toEqual([f.ids.event]);
  });

  it('blocks other existing users and unprovisioned join requests before normal lookup', async () => {
    const f = await fixture();
    vi.stubEnv('SIGN_IN_MAINTENANCE_COACH_EMAIL', 'coach@example.invalid');
    await expect(f.mentor.query(api.app.viewer, {})).rejects.toThrow(closedMessage);
    await expect(f.mentor.query(api.app.listEvents, {})).rejects.toThrow(closedMessage);
    await expect(f.newStudent.query(api.app.joinStatus, {})).rejects.toThrow(closedMessage);
    await expect(f.newStudent.mutation(api.app.requestJoin, { code: 'INVALID', firstName: 'New', lastName: 'Student' })).rejects.toThrow(closedMessage);
  });

  it('restores normal viewer and join behavior when the setting is removed', async () => {
    const f = await fixture();
    vi.stubEnv('SIGN_IN_MAINTENANCE_COACH_EMAIL', 'coach@example.invalid');
    await expect(f.mentor.query(api.app.viewer, {})).rejects.toThrow(closedMessage);
    vi.stubEnv('SIGN_IN_MAINTENANCE_COACH_EMAIL', undefined);
    expect(await f.mentor.query(api.app.viewer, {})).toMatchObject({ status: 'active', user: { role: 'mentor' } });
    expect((await f.mentor.query(api.app.listEvents, {})).map(row => row.event._id)).toEqual([f.ids.event]);
    expect(await f.newStudent.query(api.app.joinStatus, {})).toEqual({ status: 'none' });
    const code = await f.coach.mutation(api.admin.createJoinCode, { duration: '1w' });
    expect(await f.newStudent.mutation(api.app.requestJoin, { code: code.code, firstName: 'New', lastName: 'Student' })).not.toBeNull();
  });

  it('uses the same email rule at the Google profile gate', () => {
    vi.stubEnv('SIGN_IN_MAINTENANCE_COACH_EMAIL', 'coach@example.invalid');
    expect(() => requireMaintenanceAccess(' COACH@EXAMPLE.INVALID ')).not.toThrow();
    expect(() => requireMaintenanceAccess('mentor@example.invalid')).toThrow(closedMessage);
    vi.stubEnv('SIGN_IN_MAINTENANCE_COACH_EMAIL', undefined);
    expect(() => requireMaintenanceAccess('mentor@example.invalid')).not.toThrow();
  });

  it('rejects valid adult and Parent invitation acceptance for other verified Google accounts without changing either invitation', async () => {
    const f = await invitationFixture();
    vi.stubEnv('SIGN_IN_MAINTENANCE_COACH_EMAIL', 'coach@example.invalid');
    expect(await f.coach.query(api.app.viewer, {})).toMatchObject({ status: 'active', user: { role: 'coach' } });
    await expect(f.adult.mutation(api.accounts.accept, { token: f.adultToken })).rejects.toThrow(closedMessage);
    await expect(f.parent.mutation(api.parentInvites.acceptParentInvite, { token: f.parentToken, relationship: 'Parent', authorityAttested: true, attestationVersion: 'parent-relationship-1' })).rejects.toThrow(closedMessage);
    expect(await f.t.run(ctx => ctx.db.get(f.ids.adultInvitation))).toMatchObject({ status: 'pending' });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.parentInvitation))).toMatchObject({ status: 'pending' });
    expect(await f.t.run(ctx => ctx.db.query('appUsers').withIndex('by_authUserId', q => q.eq('authUserId', f.ids.adultAuth)).unique())).toBeNull();
    expect(await f.t.run(ctx => ctx.db.query('appUsers').withIndex('by_authUserId', q => q.eq('authUserId', f.ids.parentAuth)).unique())).toBeNull();
    expect(await f.t.run(ctx => ctx.db.query('familyLinks').withIndex('by_studentId', q => q.eq('studentId', f.ids.student)).first())).toBeNull();
  });
});
