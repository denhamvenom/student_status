/// <reference types="vite/client" />
import { expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { api } from './_generated/api';
import schema from './schema';
const modules = import.meta.glob('./**/*.ts');
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const account = async (role: 'coach' | 'parent' | 'student') => {
      const email = `${role}@example.invalid`, auth = await ctx.db.insert('users', { email, emailVerificationTime: 1 });
      await ctx.db.insert('authAccounts', { userId: auth, provider: 'google', providerAccountId: role, emailVerified: email });
      const app = await ctx.db.insert('appUsers', { authUserId: auth, email, name: role, role, active: true, travelLead: false, financialEdit: false });
      return { app, auth };
    };
    const coach = await account('coach'), parent = await account('parent'), pupil = await account('student');
    const season = await ctx.db.insert('seasons', { name: 'Synthetic', year: 2026, status: 'active', startsAt: 0, permissionVersion: 'draft', createdBy: coach.app });
    const student = await ctx.db.insert('students', { seasonId: season, userId: pupil.app, legalName: 'Synthetic Student', preferredName: 'Synthetic', email: 'student@example.invalid', subteam: '', active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: 'unknown' }, medications: { state: 'unknown' } });
    await ctx.db.insert('familyLinks', { studentId: student, parentUserId: parent.app, seasonId: season, active: true, createdBy: coach.app });
    return { coach, parent, pupil, student };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coach.auth}|session` }), parent: t.withIdentity({ subject: `${ids.parent.auth}|session` }), student: t.withIdentity({ subject: `${ids.pupil.auth}|session` }) };
}
it('normalizes student setup, emergency editing and parent wizard contacts at the server', async () => {
  const f = await fixture();
  await f.student.mutation(api.profileSetup.complete, { expectedRevision: 0, shirtSize: 'M', roomCategory: 'Girls', guardianPhone: '12025550123', guardianEmail: ' Parent@Example.Invalid ' });
  expect(await f.t.run(ctx => ctx.db.get(f.ids.student))).toMatchObject({ guardianPhone: '(202) 555-0123', guardianEmail: 'parent@example.invalid' });
  await expect(f.parent.mutation(api.app.updateStudentProfile, { studentId: f.ids.student, expectedRevision: 1, emergencyPhone: 'bad' })).rejects.toThrow('10-digit');
  await f.parent.mutation(api.app.updateStudentProfile, { studentId: f.ids.student, expectedRevision: 1, emergencyPhone: '202.555.0124' });
  await f.parent.mutation(api.setupWizard.saveContacts, { studentId: f.ids.student, expectedRevision: 2, guardian: { name: 'Synthetic Parent', relationship: 'Parent', phone: '+1 202 555 0123', email: ' PARENT@EXAMPLE.INVALID ' }, emergency: { name: 'Synthetic Contact', relationship: 'Other', phone: '2025550124' } });
  expect(await f.t.run(ctx => ctx.db.get(f.ids.student))).toMatchObject({ guardianPhone: '(202) 555-0123', emergencyPhone: '(202) 555-0124', guardianEmail: 'parent@example.invalid' });
  await expect(f.parent.mutation(api.setupWizard.saveMedical, { studentId: f.ids.student, expectedRevision: 3, allergies: { state: 'none', entries: [] }, prescriptions: { state: 'none', entries: [] }, insurance: { state: 'none', provider: null, policy: null }, physician: { state: 'provided', name: 'Synthetic Doctor', phone: 'abc' } })).rejects.toThrow('10-digit');
});
it('normalizes both driver creation endpoints and rejects malformed payment lookup emails', async () => {
  const f = await fixture();
  const driverId = await f.coach.mutation(api.admin.createDriver, { name: 'Synthetic Driver', email: ' Driver@Example.Invalid ', phone: '2025550100', seats: 3, approved: false });
  expect(await f.t.run(ctx => ctx.db.get(driverId))).toMatchObject({ email: 'driver@example.invalid', phone: '(202) 555-0100' });
  await expect(f.coach.mutation(api.travel.saveDriver, { driverId, name: 'Driver', email: 'bad', phone: '2025550100', seats: 3, approved: false, vehicleName: '', towCapable: false, active: true })).rejects.toThrow('valid email');
  const result = await f.coach.query(api.paymentAdministration.previewPayments, { rows: [{ studentEmail: 'bad', amountCents: 100, method: 'cash', reference: 'Synthetic', occurredAt: 1, rowReference: '1' }] });
  expect(result[0]).toMatchObject({ studentId: null, error: 'Student email: enter a valid email address.' });
});
it('preserves unchanged legacy contact values during unrelated staff edits', async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.ids.coach.app, { phone: '555-0100', emergencyPhone: 'extension 5' }));
  await f.coach.mutation(api.adultProfile.saveBasics, { expectedProfileRevision: 0, name: 'Updated Coach', phone: '555-0100', shirtSize: null, emergencyName: '', emergencyRelationship: '', emergencyPhone: 'extension 5' });
  expect(await f.t.run(ctx => ctx.db.get(f.ids.coach.app))).toMatchObject({ name: 'Updated Coach', phone: '555-0100', emergencyPhone: 'extension 5' });
});
