import { makeFunctionReference } from "convex/server";
import { v, type Infer } from "convex/values";
import { env, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { scheduleEventArchive } from "./eventArchive";
import { audit } from "./lib/access";
import { correctionSnapshot } from "./lib/chargeCorrection";
import { developerEmail, developerSignInEnabled, type DeveloperPersona } from "./lib/developerSignIn";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { calculateStudentFinance } from "./lib/financeSummaries";
import { ensureFinancialAccount, financialAccount, saveFinancialAccount } from "./lib/financialSources";
import { tokenHash } from "./lib/invitationIdentity";
import { addCharge } from "./lib/money";
import { roomSelectionComplete, roomSelectionState } from "./lib/readModels";
import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import { teamTransportEnabled } from "./lib/transportation";

/*
 * Owner-approved (October 27, 2026) development-only Student Home scenarios for the fictional Dev Student.
 * Run on the development deployment only, for example:
 *   bunx convex run developerScenarios:apply '{"scenario":"busyWeek"}'
 * Every write goes through the same steps the app uses (fees through addCharge and the Coach's fee
 * cancellation worker, rooms, requirements, announcements and family links as their mutations write them).
 * It touches only the Dev Student, the two Dev Parent family links, the Dev Coach's SCENARIO announcements
 * and records it creates itself, all named with SCENARIO_PREFIX.
 */

/** Same hard binding as developmentRehearsal.ts, kept separate so loosening another guard never loosens this one. */
const EXPECTED_DEV_URL = "https://third-bandicoot-18.convex.cloud";
export const SCENARIO_PREFIX = "SCENARIO — ";
export const SCENARIO_TEAMMATE_EMAIL = "scenario.jordan.writer@example.invalid";
const MARKER_ENTITY = "developerScenarios";
const REASON = "Owner-authorized fictional developer scenario on the development deployment; no real person, money or signature.";
const PIN_LIMIT = 5;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const processFinancialOperation = makeFunctionReference<"mutation">("financialOperationsWorker:processPage");

const PERSONAS_MISSING = "The fictional developer accounts are missing or changed. Run developerSignIn:ensurePersonas first. Nothing was changed.";
const CHANGED = "SCENARIO records were changed outside this tool, so it stopped. Review them by hand. Nothing was changed.";
const PIN_NOTE = "Five other announcements are pinned, so a SCENARIO announcement stayed unpinned.";
const PAST_FEE_NOTE = "A SCENARIO fee belongs to an event in Past events, so it can't be canceled and stays on the account.";
const ROOM_TYPE_NOTE = "Dev Student has no Room type, so allDone asked to be assigned instead of accepting Jordan's invitation.";
const OTHER_FEES_NOTE = "Balance due includes fees outside the SCENARIO events; this tool left them unchanged.";
const NOT_UNDONE = [
  "Money history stays: SCENARIO fees and their cancellations remain on the Dev Student's and the teammate's accounts, because money records are append-only.",
  "Audit entries for every scenario run stay.",
  "Canceled SCENARIO events stay listed as canceled until they end, then move to Past events with their signups, requirements and room groups.",
  "The fictional teammate stays on the roster as inactive.",
];

const REQUIREMENTS = [
  { key: "scenario-packet", label: `${SCENARIO_PREFIX}Travel packet`, dueInDays: -2 },
  { key: "scenario-packing", label: `${SCENARIO_PREFIX}Packing list`, dueInDays: 3 },
] as const;
const ANNOUNCEMENTS = {
  roomNotice: { title: `${SCENARIO_PREFIX}Choose your room`, body: "Choose your room for the Regional Competition before the room deadline, or ask to be assigned." },
  reminder: { title: `${SCENARIO_PREFIX}Safety glasses`, body: "Bring safety glasses and wear closed-toe shoes to every build meeting." },
} as const;

const scenarioValidator = v.union(v.literal("busyWeek"), v.literal("allDone"), v.literal("newStudent"), v.literal("reset"));
const summaryValidator = v.object({
  scenario: scenarioValidator,
  /** The live SCENARIO events after this run; empty after reset and newStudent. */
  eventIds: v.array(v.id("events")),
  created: v.object({ events: v.number(), requirements: v.number(), teammates: v.number(), roomGroups: v.number(), roomInvitations: v.number(), announcements: v.number(), fees: v.number() }),
  changed: v.object({
    eventsCanceled: v.number(), feesCanceled: v.number(), canceledCents: v.number(), requirementsCompleted: v.number(), signupsClosed: v.number(),
    announcementsPinned: v.number(), announcementsUnpinned: v.number(), announcementsArchived: v.number(),
    parentLinksRestored: v.number(), parentLinksRemoved: v.number(), teammateRestored: v.number(), teammateDeactivated: v.number(),
  }),
  roomChoice: v.union(v.literal("invitationAccepted"), v.literal("assignmentRequested"), v.null()),
  /** The Dev Student's Balance due after this run; null while money records are updating. */
  balanceDueCents: v.union(v.number(), v.null()),
  notes: v.array(v.string()),
});
type Scenario = Infer<typeof scenarioValidator>;
type Summary = Infer<typeof summaryValidator>;
type Phase = "busyWeek" | "allDone";
type People = { coach: Doc<"appUsers">; studentAccount: Doc<"appUsers">; parents: Doc<"appUsers">[]; student: Doc<"students"> };
type ScenarioIds = { competitionId: Id<"events">; outreachId: Id<"events">; teamId: Id<"events">; groupId: Id<"roomGroups">; inviteId: Id<"roomInvites">; roomNoticeId: Id<"teamAnnouncements">; reminderId: Id<"teamAnnouncements"> };
type StoredSet = { ids: ScenarioIds; competition: Doc<"events"> | null; outreach: Doc<"events"> | null; team: Doc<"events"> | null; group: Doc<"roomGroups"> | null; invite: Doc<"roomInvites"> | null; roomNotice: Doc<"teamAnnouncements"> | null; reminder: Doc<"teamAnnouncements"> | null };
type LiveSet = { ids: ScenarioIds; competition: Doc<"events">; outreach: Doc<"events">; team: Doc<"events">; group: Doc<"roomGroups">; invite: Doc<"roomInvites">; roomNotice: Doc<"teamAnnouncements">; reminder: Doc<"teamAnnouncements"> };
type EventFields = Pick<Doc<"events">, "name" | "type" | "startsAt" | "endsAt" | "destination" | "travel" | "overnight" | "roomingEnabled" | "feeCents" | "signupMode" | "allowWithdrawal" | "permissionRequired" | "firstRequired">
  & Partial<Pick<Doc<"events">, "roomDeadline" | "assignmentScope" | "capacity" | "signupClosesAt">>;

function present<T>(value: T | null): T {
  if (value === null) throw new Error("A SCENARIO record disappeared while it was being written. Nothing was changed.");
  return value;
}
function note(out: Summary, text: string) { if (!out.notes.includes(text)) out.notes.push(text); }
const isScenario = (name: string | undefined) => !!name?.startsWith(SCENARIO_PREFIX);

/** All three guards must pass before anything is read for writing: the development URL, the developer sign-in switch and key, and an active season. */
async function guard(ctx: MutationCtx) {
  if (env.CONVEX_CLOUD_URL !== EXPECTED_DEV_URL) throw new Error("Developer scenarios are development-only. Nothing was changed.");
  if (!developerSignInEnabled()) throw new Error("Developer sign-in is disabled on this deployment, so developer scenarios are too. Nothing was changed.");
  const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
  if (!season) throw new Error("An active season is required. Nothing was changed.");
  const plan = await ctx.db.query("seasonTransitionPlans").withIndex("by_sourceSeasonId_and_open", q => q.eq("sourceSeasonId", season._id).eq("open", true)).unique();
  if (plan) throw new Error("A season change is open. Finish or cancel it before running developer scenarios. Nothing was changed.");
  await requireSeasonFinanceReady(ctx, season._id);
  return season;
}

async function persona(ctx: MutationCtx, id: DeveloperPersona["id"], role: Doc<"appUsers">["role"]) {
  const rows = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", developerEmail(id))).take(2);
  if (rows.length !== 1 || !rows[0].active || rows[0].role !== role) throw new Error(PERSONAS_MISSING);
  return rows[0];
}

async function loadPeople(ctx: MutationCtx, season: Doc<"seasons">): Promise<People> {
  const coach = await persona(ctx, "coach", "coach");
  const studentAccount = await persona(ctx, "student", "student");
  const parents = [await persona(ctx, "parent", "parent"), await persona(ctx, "parentStaff", "parent")];
  const matches = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", developerEmail("student"))).take(2);
  if (matches.length !== 1 || !matches[0].active || matches[0].userId !== studentAccount._id) throw new Error(PERSONAS_MISSING);
  return { coach, studentAccount, parents, student: matches[0] };
}

/** The fictional teammate is found by its reserved example.invalid email and is never a sign-in account. */
async function findTeammate(ctx: MutationCtx, season: Doc<"seasons">) {
  const rows = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", SCENARIO_TEAMMATE_EMAIL)).take(2);
  if (rows.length > 1 || rows.some(row => row.userId !== undefined || !isScenario(row.legalName))) throw new Error(CHANGED);
  return rows[0] ?? null;
}

/** The latest run's audit entry records which SCENARIO records are current. */
async function loadMarker(ctx: MutationCtx, season: Doc<"seasons">, people: People): Promise<{ phase: Phase | null; set: StoredSet | null }> {
  const latest = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", MARKER_ENTITY).eq("entityId", season._id)).order("desc").first();
  if (!latest) return { phase: null, set: null };
  let data: unknown;
  try { data = JSON.parse(latest.afterJson ?? "null"); } catch { throw new Error(CHANGED); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(CHANGED);
  const record = data as Record<string, unknown>;
  if (record.set === null || record.set === undefined) return { phase: null, set: null };
  if (typeof record.set !== "object" || Array.isArray(record.set)) throw new Error(CHANGED);
  const raw = record.set as Record<string, unknown>;
  const id = <T extends "events" | "roomGroups" | "roomInvites" | "teamAnnouncements">(table: T, key: keyof ScenarioIds) => {
    const value = raw[key];
    const normalized = typeof value === "string" ? ctx.db.normalizeId(table, value) : null;
    if (!normalized) throw new Error(CHANGED);
    return normalized;
  };
  const ids: ScenarioIds = { competitionId: id("events", "competitionId"), outreachId: id("events", "outreachId"), teamId: id("events", "teamId"), groupId: id("roomGroups", "groupId"), inviteId: id("roomInvites", "inviteId"), roomNoticeId: id("teamAnnouncements", "roomNoticeId"), reminderId: id("teamAnnouncements", "reminderId") };
  const set: StoredSet = {
    ids,
    competition: await ctx.db.get("events", ids.competitionId), outreach: await ctx.db.get("events", ids.outreachId), team: await ctx.db.get("events", ids.teamId),
    group: await ctx.db.get("roomGroups", ids.groupId), invite: await ctx.db.get("roomInvites", ids.inviteId),
    roomNotice: await ctx.db.get("teamAnnouncements", ids.roomNoticeId), reminder: await ctx.db.get("teamAnnouncements", ids.reminderId),
  };
  // Never act on a record that no longer looks like this tool's own; a missing record only means that part is gone.
  for (const event of [set.competition, set.outreach, set.team]) if (event && (event.seasonId !== season._id || !isScenario(event.name))) throw new Error(CHANGED);
  if (set.group && (set.group.eventId !== ids.competitionId || !isScenario(set.group.name))) throw new Error(CHANGED);
  if (set.invite && (set.invite.groupId !== ids.groupId || set.invite.studentId !== people.student._id)) throw new Error(CHANGED);
  for (const row of [set.roomNotice, set.reminder]) if (row && (row.seasonId !== season._id || row.authorId !== people.coach._id || !isScenario(row.title))) throw new Error(CHANGED);
  return { phase: record.phase === "busyWeek" || record.phase === "allDone" ? record.phase : null, set };
}

function liveSet(set: StoredSet | null): LiveSet | null {
  if (!set) return null;
  const { ids, competition, outreach, team, group, invite, roomNotice, reminder } = set;
  if (!competition || !outreach || !team || !group || !invite || !roomNotice || !reminder) return null;
  if ([competition, outreach, team].some(event => event.archived || event.cancelled) || roomNotice.archivedAt !== undefined || reminder.archivedAt !== undefined) return null;
  return { ids, competition, outreach, team, group, invite, roomNotice, reminder };
}

const participation = (ctx: MutationCtx, eventId: Id<"events">, studentId: Id<"students">) =>
  ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();

/** busyWeek reuses its records only while nobody has acted on them; any change (a signup, a room choice, a finished requirement, a fee change) gets a fresh set. */
async function untouchedBusyWeek(ctx: MutationCtx, set: LiveSet, people: People, teammate: Doc<"students"> | null, now: number) {
  const { competition, outreach, team, group, invite } = set;
  const studentId = people.student._id;
  if (!teammate?.active || group.finalized || invite.status !== "pending") return false;
  if (competition.roomDeadline === undefined || competition.roomDeadline <= now) return false;
  if ([outreach, team].some(event => event.signupClosesAt === undefined || event.signupClosesAt <= now)) return false;
  if ((await participation(ctx, competition._id, studentId))?.status !== "confirmed") return false;
  for (const event of [outreach, team]) if (await participation(ctx, event._id, studentId)) return false;
  const requirements = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", competition._id)).take(REQUIREMENTS.length + 1);
  if (requirements.length !== REQUIREMENTS.length) return false;
  const completions = await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId", q => q.eq("eventId", competition._id).eq("studentId", studentId)).take(1);
  if (completions.length) return false;
  const room = await roomSelectionState(ctx, competition._id, studentId);
  if (room.membership || room.request) return false;
  const teammateRoom = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", competition._id).eq("studentId", teammate._id)).unique();
  if (teammateRoom?.groupId !== group._id) return false;
  const fees = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", competition._id).eq("studentId", studentId)).take(5);
  return fees.length > 0 && fees.every(fee => (fee.cancelledCents ?? 0) === 0 && (fee.adjustedCents ?? 0) === 0);
}

/** Cancels the unpaid part of one fee the way chargeAdmin.correct does for a Coach: a cancellation job processed by the shared worker. */
async function cancelUnpaidFee(ctx: MutationCtx, coach: Doc<"appUsers">, chargeId: Id<"charges">, out: Summary) {
  const charge = present(await ctx.db.get("charges", chargeId));
  const before = correctionSnapshot(charge);
  if (before.appliedCents >= before.effectiveCents) return;
  const event = charge.eventId ? await ctx.db.get("events", charge.eventId) : null;
  if (event?.archived) { note(out, PAST_FEE_NOTE); return; }
  if (event) requireEnrollmentComplete(event);
  const account = await ensureFinancialAccount(ctx, charge.studentId);
  const target = before.appliedCents; // paid parts stay paid, so nothing has to be released
  const idempotencyKey = `developer-scenario:cancel:${charge._id}:${before.revision}`;
  const existing = await ctx.db.query("financialOperationJobs").withIndex("by_originalActorId_and_idempotencyKey", q => q.eq("originalActorId", coach._id).eq("idempotencyKey", idempotencyKey)).unique();
  if (existing) throw new Error("An earlier SCENARIO fee cancellation for this fee did not finish. Review it in Money as a Coach. Nothing was changed.");
  const operationHash = await tokenHash(JSON.stringify(["chargeCorrection", charge._id, "cancellation", target, before.revision, account.revision, REASON]));
  const jobId = await ctx.db.insert("financialOperationJobs", { requiredFinancialProjectionVersion: 4, kind: "chargeCorrection", studentId: charge.studentId, actorId: coach._id, originalActorId: coach._id, generation: account.generation, state: "running", step: 0, amountCents: 0, committedCents: 0, idempotencyKey, operationHash, eventId: charge.eventId, chargeId: charge._id, correctionKind: "cancellation", targetEffectiveCents: target, originalEffectiveCents: before.effectiveCents, originalAppliedCents: before.appliedCents, releaseRequiredCents: 0, chargeBeforeJson: JSON.stringify(before), chargeCursor: null, reason: REASON, updatedAt: Date.now() });
  account.state = "posting"; account.operationJobId = jobId;
  await saveFinancialAccount(ctx, account);
  await audit(ctx, coach, "charges", charge._id, "startCorrection", before, { jobId, targetEffectiveCents: target, releaseRequiredCents: 0, state: "running" }, REASON);
  await ctx.runMutation(processFinancialOperation, { jobId, step: 0 });
  if ((await ctx.db.get("financialOperationJobs", jobId))?.state !== "complete") throw new Error("A SCENARIO fee cancellation did not finish. Nothing was changed.");
  out.changed.feesCanceled++;
  out.changed.canceledCents += before.effectiveCents - target;
}

async function cancelEventFees(ctx: MutationCtx, coach: Doc<"appUsers">, event: Doc<"events">, studentId: Id<"students">, out: Summary) {
  const fees = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", studentId)).take(20);
  for (const fee of fees) await cancelUnpaidFee(ctx, coach, fee._id, out);
}

/** The Coach's Cancel event (eventCalendar.update). SCENARIO events never use permission forms, Whole Team enrollment or Team Calendar, so only the flag changes. */
async function cancelScenarioEvent(ctx: MutationCtx, coach: Doc<"appUsers">, event: Doc<"events">, out: Summary) {
  if (event.archived || event.cancelled) return;
  await ctx.db.patch("events", event._id, { cancelled: true });
  await audit(ctx, coach, "events", event._id, "updateCalendarDetails", { cancelled: false }, { cancelled: true }, REASON);
  out.changed.eventsCanceled++;
}

const announcementView = (row: Pick<Doc<"teamAnnouncements">, "title" | "body" | "pinned" | "showUntil">) => ({ title: row.title ?? null, body: row.body, pinned: row.pinned, showUntil: row.showUntil ?? null });

/** announcements.archive: hides the message everywhere and unpins it. */
async function archiveAnnouncement(ctx: MutationCtx, coach: Doc<"appUsers">, row: Doc<"teamAnnouncements">, out: Summary) {
  if (row.archivedAt !== undefined) return;
  const now = Date.now();
  await ctx.db.patch("teamAnnouncements", row._id, { archivedAt: now, pinned: false, pinnedAt: undefined, updatedAt: now });
  await audit(ctx, coach, "teamAnnouncements", row._id, "archiveAnnouncement", announcementView(row), { ...announcementView({ ...row, pinned: false }), archived: true }, REASON);
  out.changed.announcementsArchived++;
}

/** announcements.pin and announcements.unpin. */
async function setPinned(ctx: MutationCtx, coach: Doc<"appUsers">, row: Doc<"teamAnnouncements">, pinned: boolean, out: Summary) {
  const now = Date.now();
  await ctx.db.patch("teamAnnouncements", row._id, { pinned, pinnedAt: pinned ? now : undefined, updatedAt: now });
  await audit(ctx, coach, "teamAnnouncements", row._id, pinned ? "pinAnnouncement" : "unpinAnnouncement", announcementView(row), announcementView({ ...row, pinned }), REASON);
  if (pinned) out.changed.announcementsPinned++; else out.changed.announcementsUnpinned++;
}

/** Keeps the five-pin limit: only another SCENARIO message from the Dev Coach is ever unpinned to make room. */
async function syncPins(ctx: MutationCtx, season: Doc<"seasons">, coach: Doc<"appUsers">, pin: Doc<"teamAnnouncements">[], unpin: Doc<"teamAnnouncements">[], out: Summary) {
  for (const row of unpin) if (row.pinned) await setPinned(ctx, coach, row, false, out);
  const wanted = new Set(pin.map(row => row._id));
  for (const row of pin) {
    if (row.pinned) continue;
    const pinned = await ctx.db.query("teamAnnouncements").withIndex("by_seasonId_and_pinned_and_pinnedAt", q => q.eq("seasonId", season._id).eq("pinned", true)).take(PIN_LIMIT);
    if (pinned.length >= PIN_LIMIT) {
      const spare = pinned.find(other => !wanted.has(other._id) && other.authorId === coach._id && isScenario(other.title));
      if (!spare) { note(out, PIN_NOTE); continue; }
      await setPinned(ctx, coach, spare, false, out);
    }
    await setPinned(ctx, coach, row, true, out);
  }
}

/** Fees first (the cancellation worker needs an active student and a current event), then events, then announcements. */
async function retireSet(ctx: MutationCtx, set: StoredSet, people: People, teammate: Doc<"students"> | null, out: Summary) {
  const events = [set.competition, set.outreach, set.team].filter((event): event is Doc<"events"> => event !== null);
  for (const event of events) {
    await cancelEventFees(ctx, people.coach, event, people.student._id, out);
    if (teammate?.active) await cancelEventFees(ctx, people.coach, event, teammate._id, out);
  }
  for (const event of events) await cancelScenarioEvent(ctx, people.coach, event, out);
  for (const row of [set.roomNotice, set.reminder]) if (row) await archiveAnnouncement(ctx, people.coach, row, out);
}

/** The fictional teammate shares the Dev Student's Room type so the invitation is one the app could send. */
async function ensureTeammate(ctx: MutationCtx, season: Doc<"seasons">, people: People, existing: Doc<"students"> | null, out: Summary) {
  const roomCategory = people.student.roomCategory ?? "Boys";
  if (!existing) {
    const id = await ctx.db.insert("students", { seasonId: season._id, legalName: `${SCENARIO_PREFIX}Jordan Writer`, preferredName: "Jordan", firstName: "Jordan", lastName: "Writer", structuredNameReviewed: true, email: SCENARIO_TEAMMATE_EMAIL, subteam: "Build", active: true, travelTeam: true, roomCategory, roomCategoryLocked: true, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    await audit(ctx, people.coach, "students", id, "createScenarioTeammate", null, { active: true, roomCategory }, REASON);
    out.created.teammates++;
    return present(await ctx.db.get("students", id));
  }
  if (existing.active && existing.archivedAt === undefined && existing.roomCategory === roomCategory) return existing;
  // Unlike the Coach's roster reactivation, this does not add the teammate to Whole Team events: those are not SCENARIO records.
  await ctx.db.patch("students", existing._id, { active: true, archivedAt: undefined, roomCategory, roomCategoryLocked: true, profileRevision: (existing.profileRevision ?? 0) + 1 });
  await audit(ctx, people.coach, "students", existing._id, "updateRoster", { active: existing.active, roomCategory: existing.roomCategory ?? null }, { active: true, roomCategory }, REASON);
  if (!existing.active) out.changed.teammateRestored++;
  return present(await ctx.db.get("students", existing._id));
}

/** admin.updateRoster with active false. Runs after the teammate's SCENARIO fees are canceled. */
async function deactivateTeammate(ctx: MutationCtx, coach: Doc<"appUsers">, teammate: Doc<"students"> | null, out: Summary) {
  if (!teammate?.active) return;
  const now = Date.now();
  await ctx.db.patch("students", teammate._id, { active: false, archivedAt: now, profileRevision: (teammate.profileRevision ?? 0) + 1 });
  await audit(ctx, coach, "students", teammate._id, "updateRoster", { active: true }, { active: false, archivedAt: now }, REASON);
  out.changed.teammateDeactivated++;
}

/** admin.createEvent for an event without Team Calendar: assigned students are confirmed and charged through addCharge. */
async function createScenarioEvent(ctx: MutationCtx, coach: Doc<"appUsers">, season: Doc<"seasons">, fields: EventFields, requirements: { key: string; label: string; dueAt: number }[], assigned: Id<"students">[], out: Summary) {
  const id = await ctx.db.insert("events", { ...fields, transportEnabled: teamTransportEnabled(fields), seasonId: season._id, archived: false });
  for (const requirement of requirements) await ctx.db.insert("requirements", { ...requirement, eventId: id });
  for (const studentId of assigned) {
    const now = Date.now();
    await ctx.db.insert("participants", { eventId: id, studentId, status: "confirmed", createdAt: now, updatedAt: now });
    if (fields.feeCents > 0) { await addCharge(ctx, coach, studentId, fields.name, fields.feeCents, fields.startsAt, `eventFee:${id}:${studentId}`, id); out.created.fees++; }
  }
  await scheduleEventArchive(ctx, id);
  await audit(ctx, coach, "events", id, "create", null, fields, REASON);
  out.created.events++;
  out.created.requirements += requirements.length;
  return present(await ctx.db.get("events", id));
}

/** announcements.create, saved unpinned; syncPins pins it within the limit. */
async function createAnnouncement(ctx: MutationCtx, season: Doc<"seasons">, coach: Doc<"appUsers">, content: { title: string; body: string }, out: Summary) {
  const now = Date.now();
  const row = { seasonId: season._id, title: content.title, body: content.body, authorId: coach._id, authorRole: "coach" as const, pinned: false, createdAt: now, updatedAt: now };
  const id = await ctx.db.insert("teamAnnouncements", row);
  await audit(ctx, coach, "teamAnnouncements", id, "createAnnouncement", null, announcementView(row), REASON);
  out.created.announcements++;
  return present(await ctx.db.get("teamAnnouncements", id));
}

/** A fresh busy week: an overnight Competition four weeks out, two open signups and two messages. Times are whole hours from now. */
async function createSet(ctx: MutationCtx, season: Doc<"seasons">, people: People, teammate: Doc<"students">, out: Summary): Promise<LiveSet> {
  const now = Date.now();
  const base = Math.ceil(now / HOUR) * HOUR;
  const competition = await createScenarioEvent(ctx, people.coach, season, {
    name: `${SCENARIO_PREFIX}Regional Competition`, type: "Competition", startsAt: base + 28 * DAY, endsAt: base + 30 * DAY,
    destination: "Fictional arena", travel: "Charter Bus", overnight: true, roomingEnabled: true, roomDeadline: base + 4 * DAY,
    feeCents: 12_500, signupMode: "assigned", assignmentScope: "selected", allowWithdrawal: true, permissionRequired: false, firstRequired: false,
  }, REQUIREMENTS.map(({ key, label, dueInDays }) => ({ key, label, dueAt: base + dueInDays * DAY })), [people.student._id, teammate._id], out);
  const outreach = await createScenarioEvent(ctx, people.coach, season, {
    name: `${SCENARIO_PREFIX}Library STEM Night`, type: "Outreach", startsAt: base + 8 * DAY, endsAt: base + 8 * DAY + 3 * HOUR,
    destination: "Fictional library", travel: "Provide your Own", overnight: false, roomingEnabled: false,
    feeCents: 1_000, signupMode: "open", capacity: 10, signupClosesAt: base + 5 * DAY, allowWithdrawal: true, permissionRequired: false, firstRequired: false,
  }, [], [], out);
  const team = await createScenarioEvent(ctx, people.coach, season, {
    name: `${SCENARIO_PREFIX}Team Build Day`, type: "Team", startsAt: base + 20 * DAY, endsAt: base + 20 * DAY + 6 * HOUR,
    destination: "Fictional build space", travel: "Provide your Own", overnight: false, roomingEnabled: false,
    feeCents: 0, signupMode: "open", signupClosesAt: base + 17 * DAY, allowWithdrawal: true, permissionRequired: false, firstRequired: false,
  }, [], [], out);

  // rooms.createGroup and rooms.invite as the teammate would use them. The teammate has no account, so the Dev Coach is recorded as creator.
  const category = teammate.roomCategory ?? "Boys";
  const groupName = `${SCENARIO_PREFIX}Jordan's room`;
  const groupId = await ctx.db.insert("roomGroups", { eventId: competition._id, category, name: groupName, finalized: false, adultFifthException: false, needsReview: false, createdBy: people.coach._id });
  await ctx.db.insert("roomMemberships", { eventId: competition._id, groupId, studentId: teammate._id, joinedAt: now });
  await audit(ctx, people.coach, "roomGroups", groupId, "create", null, { name: groupName, category }, REASON);
  const inviteId = await ctx.db.insert("roomInvites", { eventId: competition._id, groupId, studentId: people.student._id, invitedBy: teammate._id, status: "pending", createdAt: now });
  await audit(ctx, people.coach, "roomInvites", inviteId, "invite", null, "pending", REASON);
  out.created.roomGroups++;
  out.created.roomInvitations++;

  const roomNotice = await createAnnouncement(ctx, season, people.coach, ANNOUNCEMENTS.roomNotice, out);
  const reminder = await createAnnouncement(ctx, season, people.coach, ANNOUNCEMENTS.reminder, out);
  return {
    ids: { competitionId: competition._id, outreachId: outreach._id, teamId: team._id, groupId, inviteId, roomNoticeId: roomNotice._id, reminderId: reminder._id },
    competition, outreach, team, group: present(await ctx.db.get("roomGroups", groupId)), invite: present(await ctx.db.get("roomInvites", inviteId)), roomNotice, reminder,
  };
}

/** Room choice as the Dev Student would make it: accept Jordan's invitation (rooms.respond), or ask to be assigned (rooms.requestAssignment) when the Room type differs. */
async function resolveRoom(ctx: MutationCtx, set: LiveSet, people: People, out: Summary) {
  const { competition, group } = set;
  const student = people.student;
  let room = await roomSelectionState(ctx, competition._id, student._id);
  if (roomSelectionComplete(room)) return;
  const now = Date.now();
  const own = room.membership;
  if (own) {
    // rooms.leave: alone in an unfinished group the Dev Student started during a demo.
    await ctx.db.delete("roomMemberships", own._id);
    await ctx.db.patch("roomGroups", own.groupId, { needsReview: true });
    const remaining = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", own.groupId)).take(1);
    if (!remaining.length) {
      const sent = await ctx.db.query("roomInvites").withIndex("by_groupId", q => q.eq("groupId", own.groupId)).take(101);
      for (const invite of sent) if (invite.status === "pending") await ctx.db.patch("roomInvites", invite._id, { status: "cancelled" });
    }
    await audit(ctx, people.studentAccount, "roomGroups", own.groupId, "leave", { studentId: student._id }, null, REASON);
    room = await roomSelectionState(ctx, competition._id, student._id);
  }
  const invite = await ctx.db.get("roomInvites", set.invite._id);
  const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(6);
  if (invite?.status === "pending" && !group.finalized && student.roomCategory === group.category && members.length < 4) {
    await ctx.db.insert("roomMemberships", { eventId: competition._id, groupId: group._id, studentId: student._id, joinedAt: now });
    const received = await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(100);
    for (const other of received) if (other.eventId === competition._id && other.status === "pending") await ctx.db.patch("roomInvites", other._id, { status: other._id === invite._id ? "accepted" : "declined" });
    await audit(ctx, people.studentAccount, "roomGroups", group._id, "join", null, { studentId: student._id }, REASON);
    out.roomChoice = "invitationAccepted";
    return;
  }
  if (!room.request) {
    await ctx.db.insert("roomRequests", { eventId: competition._id, studentId: student._id, requestedAt: now });
    await audit(ctx, people.studentAccount, "roomRequests", `${competition._id}:${student._id}`, "requestAssignment", null, true, REASON);
  }
  if (invite?.status === "pending") {
    await ctx.db.patch("roomInvites", invite._id, { status: "declined" });
    await audit(ctx, people.studentAccount, "roomInvites", invite._id, "decline", "pending", "declined", REASON);
  }
  out.roomChoice = "assignmentRequested";
  if (!student.roomCategory) note(out, ROOM_TYPE_NOTE);
}

/** allDone: a Coach records the requirements, the room is chosen, unpaid SCENARIO fees are canceled and the two signups close (eventOperations.updateSettings). */
async function completeSet(ctx: MutationCtx, set: LiveSet, people: People, out: Summary) {
  const studentId = people.student._id;
  let roomApplies = false;
  for (const event of [set.competition, set.outreach, set.team]) {
    if ((await participation(ctx, event._id, studentId))?.status !== "confirmed") continue;
    if (event._id === set.competition._id) roomApplies = true;
    const requirements = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
    for (const requirement of requirements) {
      const prior = await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId_and_key", q => q.eq("eventId", event._id).eq("studentId", studentId).eq("key", requirement.key)).unique();
      if (prior) continue;
      await ctx.db.insert("requirementCompletions", { eventId: event._id, studentId, key: requirement.key, completedBy: people.coach._id, completedAt: Date.now() });
      await audit(ctx, people.coach, "requirements", `${event._id}:${studentId}:${requirement.key}`, "setCompletion", false, true, REASON);
      out.changed.requirementsCompleted++;
    }
  }
  // Room choice applies only while the Dev Student is confirmed for the Competition, as in rooms.ts.
  if (roomApplies) await resolveRoom(ctx, set, people, out);
  // A signup the Dev Student made during a demo keeps its participation; only the unpaid fee is canceled.
  for (const event of [set.competition, set.outreach, set.team]) await cancelEventFees(ctx, people.coach, event, studentId, out);
  const now = Date.now();
  for (const event of [set.outreach, set.team]) {
    if (event.signupClosesAt !== undefined && event.signupClosesAt <= now) continue;
    const signupClosesAt = Math.min(now, event.startsAt);
    await ctx.db.patch("events", event._id, { signupClosesAt });
    await audit(ctx, people.coach, "events", event._id, "updateSettings", { signupClosesAt: event.signupClosesAt ?? null }, { signupClosesAt }, REASON);
    out.changed.signupsClosed++;
  }
}

/** parentInvites.restoreFamilyLink and revokeFamilyLink for the two Dev Parent links only. */
async function setParentLinks(ctx: MutationCtx, season: Doc<"seasons">, people: People, linked: boolean, out: Summary) {
  for (const parent of people.parents) {
    const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", parent._id).eq("studentId", people.student._id)).unique();
    if (linked && !link) {
      const id = await ctx.db.insert("familyLinks", { parentUserId: parent._id, studentId: people.student._id, seasonId: season._id, active: true, createdBy: people.coach._id });
      await audit(ctx, people.coach, "familyLinks", id, "restore", false, true, REASON);
      out.changed.parentLinksRestored++;
    } else if (linked && link && (!link.active || link.seasonId !== season._id)) {
      await ctx.db.patch("familyLinks", link._id, { active: true, seasonId: season._id, revokedAt: undefined, revokedBy: undefined });
      await audit(ctx, people.coach, "familyLinks", link._id, "restore", false, true, REASON);
      out.changed.parentLinksRestored++;
    } else if (!linked && link?.active) {
      await ctx.db.patch("familyLinks", link._id, { active: false, revokedAt: Date.now(), revokedBy: people.coach._id });
      await audit(ctx, people.coach, "familyLinks", link._id, "revoke", true, false, REASON);
      out.changed.parentLinksRemoved++;
    }
  }
}

async function balanceDue(ctx: MutationCtx, studentId: Id<"students">) {
  const account = await financialAccount(ctx, studentId);
  if (account?.state !== "ready" || account.allocationSourceVersion !== 1) return null;
  return (await calculateStudentFinance(ctx, studentId)).dueCents;
}

function emptySummary(scenario: Scenario): Summary {
  return {
    scenario, eventIds: [],
    created: { events: 0, requirements: 0, teammates: 0, roomGroups: 0, roomInvitations: 0, announcements: 0, fees: 0 },
    changed: { eventsCanceled: 0, feesCanceled: 0, canceledCents: 0, requirementsCompleted: 0, signupsClosed: 0, announcementsPinned: 0, announcementsUnpinned: 0, announcementsArchived: 0, parentLinksRestored: 0, parentLinksRemoved: 0, teammateRestored: 0, teammateDeactivated: 0 },
    roomChoice: null, balanceDueCents: null, notes: [],
  };
}

/**
 * busyWeek: what's left, two open signups, a room invitation from "Jordan W." and Balance due.
 * allDone: the same records finished; Balance due from SCENARIO fees is $0 and one message stays pinned.
 * newStudent: like reset, and both Dev Parent links removed, so Home asks to invite a parent.
 * reset: SCENARIO events canceled, messages removed, teammate inactive, Dev Parent links restored.
 * Each run is one transaction; running the same scenario again leaves the same state.
 */
export const apply = internalMutation({
  args: { scenario: scenarioValidator },
  returns: summaryValidator,
  handler: async (ctx, args): Promise<Summary> => {
    const season = await guard(ctx);
    const people = await loadPeople(ctx, season);
    const out = emptySummary(args.scenario);
    const marker = await loadMarker(ctx, season, people);
    let teammate = await findTeammate(ctx, season);
    let current: LiveSet | null = null;
    if (args.scenario === "busyWeek" || args.scenario === "allDone") {
      const live = liveSet(marker.set);
      const reuse = live !== null && (args.scenario === "allDone" || (marker.phase === "busyWeek" && await untouchedBusyWeek(ctx, live, people, teammate, Date.now())));
      if (reuse) current = live;
      else {
        if (marker.set) await retireSet(ctx, marker.set, people, teammate, out);
        teammate = await ensureTeammate(ctx, season, people, teammate, out);
        current = await createSet(ctx, season, people, teammate, out);
      }
      if (args.scenario === "allDone") await completeSet(ctx, current, people, out);
      if (args.scenario === "busyWeek") await syncPins(ctx, season, people.coach, [current.roomNotice, current.reminder], [], out);
      else await syncPins(ctx, season, people.coach, [current.reminder], [current.roomNotice], out);
      await setParentLinks(ctx, season, people, true, out);
    } else {
      if (marker.set) await retireSet(ctx, marker.set, people, teammate, out);
      await deactivateTeammate(ctx, people.coach, teammate, out);
      await setParentLinks(ctx, season, people, args.scenario === "reset", out);
      for (const text of NOT_UNDONE) note(out, text);
    }
    out.eventIds = current ? [current.competition._id, current.outreach._id, current.team._id] : [];
    out.balanceDueCents = await balanceDue(ctx, people.student._id);
    if (args.scenario === "allDone" && out.balanceDueCents) note(out, OTHER_FEES_NOTE);
    await audit(ctx, people.coach, MARKER_ENTITY, season._id, `apply:${args.scenario}`, null, { phase: current ? args.scenario : null, set: current?.ids ?? null, created: out.created, changed: out.changed }, REASON);
    return out;
  },
});
