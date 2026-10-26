import { v } from 'convex/values';
import { query } from './_generated/server';
import { activeSeason, viewer, requireRole } from './lib/access';

export const waitingSignups = query({
  args: { eventId: v.id('events') }, returns: v.object({ count: v.number(), more: v.boolean() }),
  handler: async (ctx, { eventId }) => {
    const actor = await viewer(ctx); const season = await activeSeason(ctx);
    if (actor.role !== 'coach' && !actor.travelLead) throw new ConvexError('Only a Coach or Travel Lead can see this summary.');
    const event = await ctx.db.get(eventId);
    if (!event || event.archived || event.seasonId !== season._id) throw new ConvexError('This event is no longer active. Reload to see current events.');
    const rows = await ctx.db.query('participants').withIndex('by_eventId_and_status', q => q.eq('eventId', eventId).eq('status', 'pending')).take(101);
    return { count: Math.min(rows.length, 100), more: rows.length > 100 };
  },
});

export const profileCorrections = query({
  args: {}, returns: v.object({ count: v.number(), more: v.boolean() }),
  handler: async ctx => {
    requireRole(await viewer(ctx), 'coach'); const season = await activeSeason(ctx);
    const rows = await ctx.db.query('profileCorrectionRequests').withIndex('by_seasonId_and_status', q => q.eq('seasonId', season._id).eq('status', 'pending')).take(101);
    const active = await Promise.all(rows.map(async row => { const student = await ctx.db.get(row.studentId); return !!student?.active && student.seasonId === season._id; }));
    return { count: active.filter(Boolean).length, more: rows.length > 100 };
  },
});

export const healthStatus = query({
  args: { studentId: v.id('students') }, returns: v.union(v.literal('confirmed'), v.literal('entered'), v.literal('missing')),
  handler: async (ctx, { studentId }) => {
    requireRole(await viewer(ctx), 'coach'); const season = await activeSeason(ctx);
    const student = await ctx.db.get(studentId);
    if (!student || student.seasonId !== season._id) throw new ConvexError('This student is no longer in the current season. Reload to see the latest.');
    if (student.consentProfileV2 && student.consentProfileV2CompletedAt !== undefined && student.consentProfileV2ConfirmedBy !== undefined) return 'confirmed' as const;
    const draft = await ctx.db.query('setupDrafts').withIndex('by_studentId', q => q.eq('studentId', studentId)).unique();
    const draftEntered = draft?.seasonId === season._id && (draft.allergies !== undefined || draft.prescriptions !== undefined || draft.insurance !== undefined || draft.physician !== undefined);
    return draftEntered || student.consentProfileV2 !== undefined || student.allergies.state !== 'unknown' || student.medications.state !== 'unknown' ? 'entered' as const : 'missing' as const;
  },
});
import { ConvexError } from "convex/values";
