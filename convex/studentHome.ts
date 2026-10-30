import { ConvexError, v, type Infer } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { StudentHomeSummary } from "../src/features/student-home/contract";
import type { ParentHomeSummary } from "../src/features/parent-home/contract";
import { activeSeason, ownStudent, studentAccess, viewer } from "./lib/access";
import { enrollmentPending } from "./lib/eventEnrollmentState";
import { coverageFor } from "./lib/permissionCoverage";
import { permissionSigningPaused } from "./lib/permissionSigningMode";
import { roomSelectionState, studentReadiness, type RoomSelectionState } from "./lib/readModels";
import { kickoffBoundaryForCompetitionYear } from "./lib/seasonCalendar";
import { feeMaintenanceProjection } from "./lib/seasonFinance";
import { age18, firstStatus } from "./firstRegistration";
import { studentSetupCompleteFor } from "./setupWizard";

const eventType = v.union(v.literal("Competition"), v.literal("Outreach"), v.literal("Team"), v.literal("Fundraiser"));
const whatsLeftItem = v.object({
  key: v.string(),
  kind: v.union(v.literal("inviteParent"), v.literal("studentSetup"), v.literal("healthProfile"), v.literal("firstRegistration"), v.literal("firstVerification"), v.literal("requiredPayment"), v.literal("permissionForm"), v.literal("permissionReview"), v.literal("roomChoice"), v.literal("requirement"), v.literal("signupApproval"), v.literal("staffReview")),
  owner: v.union(v.literal("student"), v.literal("parent"), v.literal("coach")),
  eventId: v.union(v.id("events"), v.null()),
  eventName: v.union(v.string(), v.null()),
  label: v.union(v.string(), v.null()),
  dueAt: v.union(v.number(), v.null()),
  href: v.union(v.string(), v.null()),
});
const openSignup = v.object({ eventId: v.id("events"), name: v.string(), type: eventType, startsAt: v.number(), endsAt: v.number(), signupClosesAt: v.union(v.number(), v.null()), feeCents: v.number(), signupMode: v.union(v.literal("open"), v.literal("approval")) });
const roomChoice = v.object({
  eventId: v.id("events"), eventName: v.string(), startsAt: v.number(), endsAt: v.number(), roomDeadline: v.union(v.number(), v.null()),
  status: v.union(v.literal("notChosen"), v.literal("inGroup"), v.literal("assignmentRequested"), v.literal("final")),
  groupName: v.union(v.string(), v.null()),
  memberNames: v.array(v.string()),
  invitations: v.array(v.object({ inviteId: v.id("roomInvites"), fromName: v.string(), initials: v.string() })),
});
const summaryResult = v.object({
  studentId: v.id("students"),
  greetingName: v.string(),
  displayName: v.string(),
  initials: v.string(),
  season: v.object({ name: v.string(), startsAt: v.number(), kickoffAt: v.union(v.number(), v.null()) }),
  parentLinked: v.boolean(),
  fundraiserLinked: v.boolean(),
  whatsLeft: v.array(whatsLeftItem),
  openSignups: v.array(openSignup),
  roomChoices: v.array(roomChoice),
  competitions: v.array(v.object({ eventId: v.id("events"), name: v.string(), startsAt: v.number(), endsAt: v.number() })),
});

// Compile-time guard: the return validator and the shared screen contract must stay identical.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _summaryMatchesContract: Same<Infer<typeof summaryResult>, StudentHomeSummary> = true;

type WhatsLeftItem = Infer<typeof whatsLeftItem>;
type RoomChoice = Infer<typeof roomChoice>;

const EVENT_LIMIT = 200;
const PARTICIPATION_LIMIT = 200;
const HOME_ERROR = "Home could not load. Reload the page and try again.";
/** Readiness items that wait on Coach review of records rather than on the Student or a parent. */
const STAFF_ITEMS = new Set(["Season fee maintenance is not complete", "Financial records require review or are updating", "Event financial records require review", "Event requirements require review", "Whole Team enrollment is not complete."]);

/** The browser's America/Chicago calendar day; only the 18+ check uses it, so queries never read the clock. */
function asOfFromDay(day: string) {
  const at = Date.parse(`${day}T12:00:00.000Z`); // noon UTC is the same calendar day in Chicago
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== day) throw new ConvexError(HOME_ERROR);
  return at;
}

type NameFields = Pick<Doc<"students">, "legalName" | "preferredName" | "firstName" | "lastName">;
const words = (value: string | undefined) => (value ?? "").trim().split(/\s+/).filter(Boolean);
const letter = (value: string | undefined) => (Array.from(value ?? "")[0] ?? "").toLocaleUpperCase("en-US");

/** Generational suffixes end some legal names ("Jordan Avery Williams Jr.") but are never a family name. */
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v", "vi", "2nd", "3rd", "4th"]);
/** A usable family name starts with a letter and is not just a suffix; anything else gives no initial. */
function cleanFamilyName(value: string | undefined) {
  const name = value?.trim() ?? "";
  if (!/^\p{L}/u.test(name) || NAME_SUFFIXES.has(name.replace(/[.,]/g, "").toLocaleLowerCase("en-US"))) return null;
  return name;
}
/** Family name used only for an initial or for the Student's own name: the last name field (reviewed or not), then the legal name's last word. */
function familyName(student: NameFields) {
  const recorded = cleanFamilyName(student.lastName);
  if (recorded) return recorded;
  const legal = words(student.legalName);
  return legal.length > 1 ? cleanFamilyName(legal[legal.length - 1]) : null;
}
/** Preferred given name; a preferred name already ending in the family name ("Dev Student") is trimmed to "Dev". */
function givenName(student: NameFields, family: string | null) {
  const given = student.preferredName.trim() || student.firstName?.trim() || "";
  const suffix = family ? ` ${family}` : "";
  return suffix && given.length > suffix.length && given.toLocaleLowerCase("en-US").endsWith(suffix.toLocaleLowerCase("en-US")) ? given.slice(0, -suffix.length).trim() : given;
}
function initialsFor(given: string, family: string | null) {
  const parts = words(given);
  return letter(parts[0]) + (family ? letter(family) : letter(parts[1]));
}
/** Teammates appear as "Jordan W." with two initials; legal names and emails never leave the server. */
function teammate(student: NameFields | null) {
  if (!student) return { name: "Teammate", initials: "T" };
  const family = familyName(student);
  const given = givenName(student, family) || "Teammate";
  return { name: family ? `${given} ${letter(family)}.` : given, initials: initialsFor(given, family) };
}
/** The Student's own names: greeting honors a changed preferred name; the account footer shows the preferred full name. */
function ownNames(student: NameFields) {
  const preferred = student.preferredName.trim();
  const first = student.firstName?.trim();
  const startsWithFirst = !!first && (preferred.toLocaleLowerCase("en-US") === first.toLocaleLowerCase("en-US") || preferred.toLocaleLowerCase("en-US").startsWith(`${first.toLocaleLowerCase("en-US")} `));
  const greetingName = first && (!preferred || startsWithFirst) ? first : words(preferred)[0] ?? first ?? words(student.legalName)[0] ?? "";
  const family = familyName(student);
  const given = givenName(student, family) || greetingName;
  return { greetingName, displayName: family ? `${given} ${family}` : given, initials: initialsFor(given, family) };
}

/** An active link this season to an active Parent account. */
async function parentLinked(ctx: QueryCtx, student: Doc<"students">) {
  const links = await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(20);
  for (const link of links) {
    if (!link.active || link.seasonId !== undefined && link.seasonId !== student.seasonId) continue;
    const parent = await ctx.db.get(link.parentUserId);
    if (parent?.active && parent.role === "parent") return true;
  }
  return false;
}

function seasonItem(key: string, kind: WhatsLeftItem["kind"], owner: WhatsLeftItem["owner"], href: string | null): WhatsLeftItem {
  return { key, kind, owner, eventId: null, eventName: null, label: null, dueAt: null, href };
}
/** Keys stay stable while an item changes owner, e.g. permission:<event> moves from the parent to Coach review. */
function eventItem(key: string, kind: WhatsLeftItem["kind"], owner: WhatsLeftItem["owner"], event: Doc<"events">, fields: { label?: string; dueAt?: number; href?: string; keySuffix?: string } = {}): WhatsLeftItem {
  return { key: `${key}:${event._id}${fields.keySuffix ? `:${fields.keySuffix}` : ""}`, kind, owner, eventId: event._id, eventName: event.name, label: fields.label ?? null, dueAt: fields.dueAt ?? event.startsAt, href: fields.href ?? null };
}

/** Shared projection; entry points authorize the student before reaching it. */
async function buildSummary(ctx: QueryCtx, student: Doc<"students">, asOfDay: string): Promise<StudentHomeSummary> {
    const asOf = asOfFromDay(asOfDay);
    const season = await activeSeason(ctx);
    const signingPaused = await permissionSigningPaused(ctx);
    const events = (await ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt", q => q.eq("seasonId", season._id).eq("archived", false)).take(EVENT_LIMIT))
      .filter(event => !event.cancelled)
      .sort((a, b) => a.startsAt - b.startsAt);
    const participations = new Map((await ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(PARTICIPATION_LIMIT)).map(row => [row.eventId, row]));

    const whatsLeft: WhatsLeftItem[] = [];
    const linked = await parentLinked(ctx, student);
    if (!linked) whatsLeft.push(seasonItem("inviteParent", "inviteParent", "student", "/parents"));
    if (!await studentSetupCompleteFor(ctx, student)) whatsLeft.push(seasonItem("studentSetup", "studentSetup", "student", "/setup"));
    if (!student.consentProfileV2CompletedAt) whatsLeft.push(seasonItem("healthProfile", "healthProfile", "parent", null));
    const first = await firstStatus(ctx, student._id);
    if (first === "awaitingVerification") whatsLeft.push(seasonItem("first", "firstVerification", "coach", null));
    else if (first !== "verified") {
      const draft = await ctx.db.query("setupDrafts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
      const adult = age18(draft?.dateOfBirth ?? student.consentProfileV2?.dateOfBirth, asOf);
      whatsLeft.push(seasonItem("first", "firstRegistration", adult ? "student" : "parent", adult ? "/setup" : null));
    }

    const confirmed = events.filter(event => participations.get(event._id)?.status === "confirmed");
    const shared = confirmed.length
      ? { financialAccount: await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique(), maintenance: await feeMaintenanceProjection(ctx, season._id) }
      : null;
    const rooms: { event: Doc<"events">; room: RoomSelectionState }[] = [];
    for (const event of events) {
      const participant = participations.get(event._id) ?? null;
      if (participant?.status === "pending") whatsLeft.push(eventItem("signupApproval", "signupApproval", "coach", event));
      if (participant?.status !== "confirmed" || !shared) continue;
      const enrolling = enrollmentPending(event);
      const room = event.overnight && event.roomingEnabled ? await roomSelectionState(ctx, event._id, student._id) : undefined;
      if (room) rooms.push({ event, room });
      const completions = enrolling ? undefined : await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(101);
      const requirements = enrolling ? undefined : await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101);
      const readiness = await studentReadiness(ctx, event, student, { participant, firstRegistrationState: first, ...shared, completions, requirements, room });
      if (readiness.state !== "open") continue;
      // Custom requirements come from the same rows readiness used, so each keeps its own key and due date.
      const customOpen = (requirements ?? []).filter(requirement => !completions?.some(done => done.key === requirement.key));
      const builtIn = [...readiness.open];
      for (const requirement of customOpen) { const at = builtIn.lastIndexOf(requirement.label); if (at >= 0) builtIn.splice(at, 1); }
      let staffReview = false;
      for (const item of builtIn) {
        if (STAFF_ITEMS.has(item)) staffReview = true;
        else if (item === "Required payment") whatsLeft.push(eventItem("payment", "requiredPayment", "parent", event));
        else if (item === "Room selection") whatsLeft.push(eventItem("room", "roomChoice", "student", event, { dueAt: event.roomDeadline ?? event.startsAt, href: `/events/${event._id}/rooming` }));
        else if (item === "Permission accepted") {
          if (signingPaused) continue;
          const coverage = await coverageFor(ctx, student._id, event._id);
          const submitted = coverage?.state === "pending" && coverage.signatureRequestedAt === undefined;
          whatsLeft.push(eventItem("permission", submitted ? "permissionReview" : "permissionForm", submitted ? "coach" : "parent", event));
        }
        // On Competitions the season-wide FIRST item above already covers FIRST registration and Consent & Release.
        else if (item !== "FIRST registration and Consent & Release") whatsLeft.push(eventItem("requirement", "requirement", "student", event, { label: item, href: `/events/${event._id}`, keySuffix: item === "FIRST registration" ? "first" : item }));
      }
      for (const requirement of customOpen) whatsLeft.push(eventItem("requirement", "requirement", "student", event, { label: requirement.label, dueAt: requirement.dueAt ?? event.startsAt, href: `/events/${event._id}`, keySuffix: requirement.key }));
      if (staffReview) whatsLeft.push(eventItem("staffReview", "staffReview", "coach", event));
    }
    const seen = new Set<string>();
    const uniqueItems = whatsLeft.filter(item => !seen.has(item.key) && !!seen.add(item.key));

    const openSignups: StudentHomeSummary["openSignups"] = [];
    for (const event of events) {
      if (event.signupMode === "assigned" || enrollmentPending(event)) continue;
      const participant = participations.get(event._id);
      if (participant && participant.status !== "withdrawn") continue;
      if (participant) {
        const withdrawals = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(100);
        if (withdrawals.some(row => row.status === "approved")) continue;
      }
      openSignups.push({ eventId: event._id, name: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt, signupClosesAt: event.signupClosesAt ?? null, feeCents: event.feeCents, signupMode: event.signupMode });
    }
    openSignups.sort((a, b) => (a.signupClosesAt ?? a.startsAt) - (b.signupClosesAt ?? b.startsAt));

    const names = new Map<Id<"students">, Promise<Doc<"students"> | null>>();
    const studentById = (id: Id<"students">) => { if (!names.has(id)) names.set(id, ctx.db.get(id)); return names.get(id)!; };
    const invites = rooms.length ? await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(100) : [];
    const roomChoices: RoomChoice[] = [];
    for (const { event, room } of rooms) {
      const status = room.membership && room.group?.finalized ? "final" : room.request ? "assignmentRequested" : room.membership ? "inGroup" : "notChosen";
      const members = await Promise.all(room.members.filter(member => member.studentId !== student._id).map(member => studentById(member.studentId)));
      const pending = invites.filter(invite => invite.eventId === event._id && invite.status === "pending");
      const invitations = (await Promise.all(pending.map(async invite => {
        // Answering fails once the inviting group is removed or final, so those invitations stay off Home.
        const group = await ctx.db.get(invite.groupId);
        if (!group || group.finalized) return [];
        const from = teammate(await studentById(invite.invitedBy));
        return [{ inviteId: invite._id, fromName: from.name, initials: from.initials }];
      }))).flat();
      roomChoices.push({ eventId: event._id, eventName: event.name, startsAt: event.startsAt, endsAt: event.endsAt, roomDeadline: event.roomDeadline ?? null, status, groupName: room.membership ? room.group?.name ?? null : null, memberNames: members.map(member => teammate(member).name), invitations });
    }

    const kickoff = (() => { try { return kickoffBoundaryForCompetitionYear(season.year); } catch { return null; } })();
    return {
      studentId: student._id,
      ...ownNames(student),
      season: { name: season.name, startsAt: season.startsAt, kickoffAt: kickoff?.state === "verified" ? kickoff.kickoffAt : null },
      parentLinked: linked,
      // Same test as the Money page's fundraiser section (fundraiserLinks.forStudent returns the link only when one is set).
      fundraiserLinked: !!student.fundraiserUrl,
      whatsLeft: uniqueItems,
      openSignups,
      roomChoices,
      // Every fetched Competition, so ones that ended but are not archived yet cannot push out the next one; the browser picks by time.
      competitions: events.filter(event => event.type === "Competition").map(event => ({ eventId: event._id, name: event.name, startsAt: event.startsAt, endsAt: event.endsAt })),
    };
}

/** The signed-in Student's own Home. */
export const summary = query({
  args: { asOfDay: v.string() }, returns: summaryResult,
  handler: async (ctx, args) => buildSummary(ctx, await ownStudent(ctx, await viewer(ctx)), args.asOfDay),
});

const nextEvent = v.union(v.null(), v.object({ eventId: v.id("events"), name: v.string(), startsAt: v.number(), location: v.union(v.string(), v.null()), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist")) }));
const parentSummaryResult = v.object({ studentId: v.id("students"), whatsLeft: v.array(whatsLeftItem), nextEvent });
const _parentSummaryMatchesContract: Same<Infer<typeof parentSummaryResult>, ParentHomeSummary> = true;

/** One linked student's Parent Home data. */
export const parentSummary = query({
  args: { studentId: v.id("students"), asOfDay: v.string(), asOf: v.number() },
  returns: parentSummaryResult,
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "parent" && user.role !== "coach" && !user.travelLead) throw new ConvexError("Parent Home requires a linked parent or staff account.");
    const student = await studentAccess(ctx, user, args.studentId);
    const home = await buildSummary(ctx, student, args.asOfDay);
    // Walk future events in start order. A fixed slice of old participations can
    // hide the next event for a student with a long participation history.
    for await (const event of ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", student.seasonId).gte("startsAt", args.asOf))) {
      if (event.archived || event.cancelled) continue;
      const participation = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
      if (!participation || participation.status === "withdrawn") continue;
      return { studentId: student._id, whatsLeft: home.whatsLeft, nextEvent: { eventId: event._id, name: event.name, startsAt: event.startsAt, location: event.destination || null, status: participation.status } };
    }
    return { studentId: student._id, whatsLeft: home.whatsLeft, nextEvent: null };
  },
});
