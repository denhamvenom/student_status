# Event audiences, Mentor invitations and recurring meetings

November 2026 sprint. This describes implemented source behavior. Production release and signed-in production checks are recorded separately in `docs/releases/`.

## Subteams

- **Primary subteam** (`students.subteam`): Build, Electrical, Machining, Programming, Business/Media (`src/lib/subteams.ts`). Legacy names are read as current ones: Mechanical → Build; Business, Outreach, Business and Media → Business/Media.
- **Secondary subteam** (`students.secondarySubteam`): only `CAD`, or none.
- **Leadership** (`students.leadership`): a yes/no flag. It behaves as an audience group.
- **Who can set them:** a Coach or a non-parent Travel Lead can change a student's secondary subteam and Leadership (`studentSubteams.setStudentSecondaryAndLeadership`, revision-checked and audited). The change also adds or removes the student from future required subteam events they now match (`syncSubteamMembership`).
- **Mentor subteams** (`appUsers.subteams`): the primary subteams plus CAD, but not Leadership. **Only a Coach** can set them (`setMentorSubteams`, edited on `/adults`). They are used only to invite Mentors by subteam.

A student matches a subteam audience through their primary subteam (canonicalized), their secondary subteam, or Leadership when Leadership is chosen (`convex/lib/eventAudienceRules.ts`).

## Who an event is for

The wizard asks "Who is this event for?" and then "Is this event required?":

| Audience | Required (Yes) | Optional (No) |
| --- | --- | --- |
| Everyone (all active students, not Mentors) | `signupMode: assigned`, `assignmentScope: wholeTeam` | `signupMode: open` (or `approval`), no scope |
| Subteams (at least one group) | `assigned`, `selected`; every matching student is enrolled by a job | `open`/`approval`, no scope; only matching students see it |
| Specific students (at least one, max 200) | `assigned`, `selected`; the listed students are assigned | `open`/`approval`; only listed students see it |
| Mentors only (at least one Mentor invite) | Not allowed | `signupMode: assigned`, no scope, no students |

`toStoredEventFields` stores `audienceKind`, `audienceSubteams` and `mandatory` together with the mapped `signupMode`/`assignmentScope`. Listed students are stored in `eventAudienceStudents`. When `audienceKind` is set, callers cannot also pass a scope or `assignedStudentIds`. Required subteam events and Whole Team events cannot have a capacity.

**Legacy events** (saved before audiences existed, no `audienceKind`) are read by `resolveAudience` like this:
- `assigned` + `wholeTeam` → Everyone, required
- `assigned` + `selected`, `travelTeam` or no scope → specific students, required
- `open`/`approval` → Everyone, optional

Their stored fields are not rewritten.

## Mentor invitations

- At creation, Coaches and Travel Leads can invite Mentors one at a time (max 200). For a Subteams audience they can also invite **Mentors of those subteams** (`inviteSubteamMentors`). Invite rows (`eventMentorInvites`) record their source as `individual` or `subteam`.
- After creation, `mentorInvites.addMentorInvites` / `removeMentorInvite` / `forEvent` are available to a Coach or a non-parent Travel Lead on any current event in the active season. Only newly added Mentors are notified.
- Mentors see their own invitations at **`/invited`** (`MentorInvitedEvents`, `mentorInvites.myInvitedEvents`). They see only title, time, place, virtual flag, cancelled flag and their own status: no rosters, fees or health data. A Mentor answers only their own invitation (accepted/declined). A declined invitation for a current event is still listed, so the Mentor can accept later. Cancelled or archived events refuse answers.

## Location type: Virtual (Discord)

`locationType` is `inPerson` (default) or `virtual`, labeled **Virtual (Discord)**. A virtual event cannot also be on-site. The server forces `permissionRequired: false`, `overnight: false`, `roomingEnabled: false`, no room deadline and `travel: "None"`, and the wizard skips those steps. Whether virtual events should ever need a permission form is still an owner decision (see KNOWN_GAPS).

## Team Calendar choice

New events offer **Create a separate Calendar entry**, **Connect an existing Calendar event**, or **Don't add to Team Calendar** (`src/features/event-setup/new-event-defaults.ts`). Team meetings and repeating meetings default to **Don't add to Team Calendar**, and other types default to Create. A repeating meeting can get its own Team Calendar series (`addToCalendar`) or stay off it. It cannot connect to a single existing entry. To manage an existing Google series, a Coach adopts it (see below).

## Recurring meetings (`eventSeries`)

- **Rule:** weekly in America/Chicago: weekdays, every N weeks, a start time, a length, and optionally an end date or a number of meetings. The series must start today or later. The rule is anchored on its first meeting.
- **Rolling window:** each meeting is an ordinary `events` row (`seriesId`, `seriesOccurrenceKey` = Chicago date). Rows are generated **56 days (8 weeks)** ahead in small batches. A **daily cron** ("extend recurring meetings", 10:15 UTC, `eventSeries.tick`) extends each active series, ends a series that has no meetings left, and reconciles series that are on Team Calendar.
- **This meeting only** (`editOccurrence`, `cancelOccurrence`): uses the single-event edit path. The meeting becomes a detached override (`seriesDetached`). On Calendar it becomes an instance exception.
- **This and following** (`editFuture`, `cancelFuture`): always a **split**. Meetings from the chosen date move to a new series (same rows and keys; detached overrides keep their changes). Meetings that no longer fit the new rule are cancelled, and the old series ends the day before. The chosen meeting must be after today, and no Timeclock attendance may exist on or after it.
- **Notifications:** creating a series sends **one** notice (for the first meeting, to the audience students and invited Mentors). Generated meetings and enrollment are silent. This-and-following and cancel-following send one representative notice (the first affected meeting). Adopting a Google series sends nothing.
- **Duplicate guard:** a new series is refused if it overlaps a series already on Team Calendar here (same start time, a shared weekday, overlapping dates), such as the adopted Tuesday meeting.

## Permissions: Coach vs Travel Lead

| Action | Coach | Travel Lead |
| --- | --- | --- |
| Optional events, any audience; required specific students | Yes | Yes |
| Required Everyone (Whole Team) or required Subteams | Yes | No |
| Create or edit recurring series | Yes | Yes, except required Everyone/Subteams series |
| Adopt an existing Team Calendar series | Yes | No |
| Set a student's secondary subteam or Leadership | Yes | Yes (non-parent Travel Lead) |
| Set Mentor subteams | Yes | No |
| Invite or remove Mentors on an event | Yes | Yes, including Coach-only required events (current policy, see KNOWN_GAPS) |
