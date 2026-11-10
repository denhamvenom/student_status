# Project decisions

Read this before changing parent linking, consent/PDF, finance, rooms/waitlists or retention. These are carried-forward owner decisions, not claims that every operational safeguard is complete.

## Parent linking

- Invitations are seven-day, single-use, and tied to the matching email.
- Require explicit good-faith parent/legal-guardian relationship and authority attestation. Email control does not independently prove guardianship or sign consent.
- Preserve inbox privacy, the one-hour resend guard and revocation/access checks.

## Product name

- October 25 owner decision: the app shown to people is **Venom Status** (was Student Status): page titles, sign-in, About/Privacy/Terms, emails, PDF metadata and messages. Infrastructure names (GitHub repository `student_status`, Convex project, Cloudflare Workers, domains, code identifiers and internal docs) are unchanged unless the owner asks separately. A production `PARENT_INVITE_EMAIL_FROM` value, if set, overrides the default sender name and must be updated there.

## Developer sign-in

- October 25 owner decision: the development deployment (`third-bandicoot-18`) offers a developer sign-in so the owner and Claude can test every role without Google. It signs in only to fixed fictional accounts on the reserved `developer.example.invalid` domain: Coach, Mentor, Travel Lead, Parent, Parent with staff access, and Student (a seventh, Travel Lead with Money editing access, was added November 9). It never signs in, creates, links or changes a real account.
- November 9, 2026 owner decision: a seventh fictional account, Travel Lead with Money editing access, is added for testing fees and payments. It is development only and has the same guards as the others; it has no Health export access.
- It works only when all of these hold: the backend is the hard-coded development URL, the server switch `DEVELOPER_SIGN_IN_ENABLED=true` is set, and the request carries the server-held `DEVELOPER_SIGN_IN_KEY`. Reserved-domain sessions are refused whenever those conditions stop holding. The sign-in panel exists only in local development builds; the production build fails if any of it is bundled.
- Never set the switch or key on production. Fictional accounts and their family links hold synthetic data only. Real Google and parent-email sign-in still need a human check before releases that touch authentication.

## Consent/PDF

- Require completed Student setup and a Parent-confirmed structured profile before the approved populated PDF workflow.
- Preserve the exact reviewed/signed artifacts, acknowledgment and typed verified name.
- Preserve the approved original one-page design, lossless continuation for genuine overflow and all historical receipts.
- Active OTC/Medication Choices are superseded; do not introduce a new workflow for them.
- October 25 owner decision: the permission form is not in use yet, so its PDF wording may change. Approved: "Reference code" (not "Reviewed PDF SHA-256"), "TEST SIGNATURE (FICTIONAL)" and "How it was signed" on the signature page, "Medications" (not "Prescriptions"), "Information unavailable", "PERMISSION FORM - CONTINUATION", and a footer showing only the form version (no internal IDs). The title "Field Trip Permission & Medical Release" stays.
- October 22 owner decision: real PDF signing is deferred until the owner is ready. Do not enable it without a later explicit instruction; preserve approved wording and existing evidence. This decision does not assert or change the current production flag; check that setting when signing work resumes.

## Finance

- Use integer cents, preserve personal-payment/fundraising source lineage and retain append-only evidence.
- An internal withdrawal return is not a cash payout. Cancel unpaid extras; keep unpaid main debt unless explicitly cancelled; reallocate returned funds away from the withdrawn event.
- Fundraising credits cannot be paid to a family.
- Coach-reviewed departing personal funds may move to team with explicit source, amount, reason and audit. A separate family authorization is not required; archival/season close never sweeps funds automatically.
- November 9, 2026 owner decisions (usability audit, branch `feat/usability-audit`, not yet released):
  - **Edit payment.** A Coach, or a Travel Lead with Money editing access (checked on the server), can edit a recorded payment's amount, method, check/receipt number or student, with a required reason. The original is never overwritten. An amount change is a recorded correction re-applied in fee order. Moving a payment to another student zeroes the original and records it on the new student. Setting the amount to $0 undoes a mistaken payment. Every edit keeps who, when, why, before and after, and shows in Recent changes. Carried-over payments and payments already moved can't be edited. A move records the payment on the new student only after the original is corrected to $0, in the same step. If an edit stops partway, the payment shows that it stopped, with Try again and Cancel this move (Cancel this edit when the student isn't changing) for a Coach or a Travel Lead with Money editing access. Cancelling needs a reason. It keeps the payment at its original amount on the original student, puts any money already released back on that student's fees in order, and unlocks the account. The cancel shows in the payment's changes and Recent changes with who, when and why. Each edit adds one line in Recent changes per student it touches.
  - **Overpayment check.** Recording a payment asks for confirmation when it would leave a student $1,000 or more over Balance due. Cash payments and cash money returned need no check/receipt number.
  - **Fee payment order.** A new fee with no payment order goes after the existing fees.
- Special family refund requests require separate review.
- Available same-season fundraising transfers require Coach authority or Travel Lead plus the finance grant.
- If original award credits are insufficient, hold a proposed reduction; do not silently create debt or claw credits back.

## Rooms/waitlists

- Waitlists are chronological and manually promoted.
- Student room groups stop at four. A fifth occupant requires an explicit adult exception and reason; never six or mixed categories.
- The deadline blocks student room/group/invitation changes; supported adult corrections remain audited.
- A genuine reenrollment receives a new waitlist position.

## Events and roster

- October 23 owner decision: past events move into a staff-only archive. Students and Parents lose event access, including old links, room/travel/withdrawal views and permission receipts covering archived events. Event-specific unfinished requirements leave their views. Preserve participation, attendance, signed evidence, charges, payments and balances; archival never cancels money owed. Coaches and Travel Leads can read archived events from current and previous seasons.

- Only a linked Parent or Coach sets independent travel; Students, including adult Students, cannot set it. A Student without a linked Parent asks the Coach. The flag alone does not prove who set it; use available audit evidence.
- Travel Leads can create events and review join requests. They may set event fees in New event without a finance-edit grant; confirmed participation triggers charges. Team codes, parent invitation control and access revocation remain Coach-only; Travel Lead roster presentation stays read-only.
- A confirmed Student may leave a Whole Team event immediately after confirmation. Release participation/room placement, preserve a durable in-app Coach notice and keep any nonzero-fee disposition in the normal review path. Coach dismisses notices; Travel Leads may read them. Re-enrollment/reactivation does not silently restore an earlier withdrawal. No email/text notification is implied.
- November 6, 2026 owner decision: a Student's event withdrawal takes effect immediately, with no Coach/Travel Lead review, when no money and no logistics commitment is involved: no event fee, no event charge owed or paid, no room membership or room request, no confirmed team-transport seat (team transport on and not independent travel), and no other request in review. Whole Team events are excluded: leaving one uses the Whole Team leave path with its Coach notice. Shift signups are cleared, not treated as commitments. The withdrawal is still recorded as an approved request (full, $0) with an `autoWithdraw` audit entry and no Coach review digest; re-enrollment still needs a Coach. Anything else keeps the normal review path.
- November 6, 2026 owner decisions (withdrawal follow-up): (A) a withdrawal from any Coach-assigned event always goes to Coach/Travel Lead review, even when free. (B) A Coach can "Put back on event" a withdrawn student from the event's Signups and capacity section (a Travel Lead too, but only for events a Coach did not assign); it needs the current season, an active event and student, finished enrollment and an open place. It is an explicit action: the approved withdrawal is kept and marked reinstated (who and when), the student returns as Signed up, money moved by a reviewed withdrawal is not reversed (the Coach is warned), rooms and shifts are not restored, and an audit entry is written. Re-enrollment checks (student signup, Whole Team and subteam auto-enrollment, Home open signups) ignore reinstated withdrawals. (C) A Student, never a Parent, can undo their own automatic withdrawal until the event starts, while the event is still current, not archived or canceled, not Coach-assigned, finished enrolling and has an open place; they return to their earlier status (a Waitlisted student rejoins at the end of the waitlist; nobody moves up), rooms and shifts are not restored, and a Coach-reviewed withdrawal can't be undone this way.
- November 7, 2026 owner decision: the automatic "Put back" fee rule is deferred. For now, Put back on event (Coach/Travel Lead) and a Student's Undo never add, restore or change a charge or ledger entry; money stays exactly as the withdrawal decision left it, and the audit entry records that no charge was changed. The Put back control and its success message tell the Coach or Travel Lead to check the student's charges for the event and add the fee by hand with the existing charge tools if the student should pay. The rule for a returning student's fee is in [BACKLOG.md](BACKLOG.md#product).
- Travel Team means students selected by mentors/Coaches through an application for out-of-state and local travel. It is distinct from Travel Lead and the event's team-transport requirement.
- Canonical subteams are Build, Electrical, Machining, Programming and Business/Media. No Unassigned choice is offered; existing missing assignments stay missing. The owner deferred stored conversion: Mechanical maps to Build; Business, Outreach and superseded Business and Media map to Business/Media only through reviewed, authorized migration.

## Setup and FIRST

- Students and linked Parents share profile/birth-date values within existing role boundaries; Students gain no access to Parent medical fields. Preserve initial Student subteam selection, Coach corrections and legacy assignments.
- Completed shared information is reused for a second Parent; personal account answers remain scoped. Save/resume and multi-child selection must not overwrite another child's profile.
- FIRST verification is once per student/season and requires both team acceptance and Consent & Release to be Coach-verified. Self-report does not clear readiness; reopening needs a reason and blocks Competitions again. New seasons start unverified; legacy event completions do not silently count as season-wide verification.
- FIRST invitation/reporting follows age/birthday eligibility: do not direct minors to adult self-report. All Competitions inherit the season-wide status; Outreach/Team and historical evidence are preserved.

## Admin contact

- Admin contact (owner decision October 25): Coach-only setup errors offer Contact admin; requests are recorded and emailed to admin@team8044.org; no student data.

## Redesign dashboards

- October 25 owner decisions for the planned redesign. Mentors keep Profile as their landing page until the redesign, which gives them a small dashboard. A Parent with staff access who has switched to Mentor or Travel Lead sees a "{Student's name} needs you" badge when Parent-side items are waiting (needs a new query). Parents see signups as view-only ("{Student's name} can sign up until…"); only the student signs up or withdraws, which keeps that responsibility with the student.
- October 26–27 owner decisions for Student Home (Claude Design "Student Home — chosen direction", October 26). The design's colors replace the old palette on Student screens first; other roles follow in their own redesigns. Phone and desktop light artboards differ and are kept as drawn; only small text that missed WCAG AA is adjusted. Brand: logo mark and "VENOM STATUS".
- Student Home tiles: Highlights (the swipeable card stack at the top), Open signups, What's left, Balance due and Participation. No Parents tile and no Your events tile.
- Highlights (named October 27) leads with the most important things to do, at most three cards, in this order: Invite a parent (while none is connected; parent-side reminders fold into it), FIRST registration (remind your parent, or finish it yourself at 18+), an overdue fee (past the event start until fee due dates exist), a permission form your parent has not completed, other event forms you complete, then Room choice. Within a type the soonest due comes first; urgent styling only when overdue or due within 7 days. Everything stays in What's left too. After the to-do cards come up to five pinned announcements from a Coach or Travel Lead (newest pin first, optional show-until date), then the countdown: Kickoff before kickoff, the next Competition after it, in days and then hours inside 48 hours.
- Signing up from Home opens a sheet with the fee, spots left (counts only, never names) and what happens next. "Fundraise" replaces "Pay now" on Home and opens the fundraiser section of Money; the Money page's fundraiser card keeps "Pay Now" (October 27: same link).
- Participation rings: Meetings counts held meetings this season (from August, excluding Outreach) and resets with a new season; Outreach is attended of held this season; Build hours is clocked time at Build meetings from kickoff, against a per-season target a Coach sets on the Season page.

## Event audiences and recurring meetings

November 2026 sprint decisions (released November 4, 2026; behavior in [EVENT_AUDIENCES_AND_SERIES.md](EVENT_AUDIENCES_AND_SERIES.md)).

- **One native Google series per app series.** An app series on Team Calendar is one Google recurring master (RRULE), not one Google event per meeting. Single-meeting edits become instance exceptions.
- **"This and all future" always splits.** Editing or cancelling from a meeting onward ends the old series the day before and moves later meetings into a new series; it never rewrites earlier meetings. It is refused if Timeclock attendance exists on or after the chosen meeting.
- **Tuesday meetings adopt the existing Google series.** A Coach imports the existing Tuesday "Team Meeting" Google series instead of creating an app-owned one; meetings link to the existing Google instance IDs that Timeclock already uses, so Tuesday attendance history stays attached. Import makes no Google write and sends no notifications. The duplicate guard refuses an overlapping app series. The empty `attendanceMeetings` table stays unused.
- **Virtual events never need permission forms.** Virtual events also have no overnight, rooming or travel (server-enforced).
- **Mandatory group events are Coach-only.** Only a Coach can create or edit a required Everyone (Whole Team) or required Subteams event or series; Travel Leads can create optional events and required events for specific students.
- **Location wording stays "Virtual (Discord)".**
- **Season end is May 31.** The `+ Team meeting` fast path defaults a repeating meeting to end on the next May 31 (`seasonEndDate`).
- **Family event projection.** Students and Parents receive events only through the minimized family projection (`familyEvent` in `convex/lib/eventProjection.ts`); fields not meant for families are never returned to them.
- **Travel Lead canonical rule.** Travel Lead authority means `role === "coach"` or (`role === "mentor"` and `travelLead`), evaluated on the session-resolved viewer (a Parent acts as a Travel Lead only in a session where that granted staff role is selected). A `travelLead` flag on any other account grants nothing. New code uses this rule; older loose checks are listed for tightening in HANDOFF.md.
- **Mentor invitations on Coach-only events (current policy).** A Travel Lead can add or remove Mentor invitations on any current event, including Coach-only required events; revisit only if the owner asks (KNOWN_GAPS).

## Mentor Home and Mentor meetings

November 6–7, 2026 owner decisions (release candidate `feat/mentor-home`, not yet released; behavior in [EVENT_AUDIENCES_AND_SERIES.md](EVENT_AUDIENCES_AND_SERIES.md)).

- **All Mentors can create Team meetings** (November 6). Every Mentor, not only Travel Leads, can create one-time or repeating Team meetings, always optional: Everyone (open signup), Subteams, specific students or Mentors only. No required audiences, fees, travel, overnight, rooms, permission forms, Team Calendar or other event types; at most 12 hours long. Only the creator edits or cancels a Mentor meeting; Mentors cannot change events a Coach or Travel Lead created.
- **Mentor self sign-up** (November 6). A Mentor can sign up for any upcoming current-season event of any type, except an event for specific subteams that include none of the Mentor's subteams. Fees, travel, overnight, rooming and permission forms do not make an event invite-only. The only questions are "Can you drive students?" (events with travel) and "Do you need a hotel room?" (overnight events). For a repeating series the Mentor chooses every meeting, just this one, or the next N meetings, and can skip one meeting or leave the series.
- **Parents with a Mentor or Travel Lead grant are Mentors first, Parents second** (November 6). They get Mentor Home, meetings, sign-up and Mentor notifications whatever role their session selected; their Parent data access does not widen. A Parent acting as Travel Lead may see Mentors' sign-up answers and counts (supersedes the earlier non-parent-Travel-Lead-only rule for these reads).
- **Separate "Meetings and events" notification category** (November 6). New events a Mentor can sign up for (M4) and activity on meetings a Mentor created (M5) use their own Mentor-only category, on by default, in the 5 PM summary; the Staff setting no longer controls them.
- **Competitions & trips** (November 7). On the Mentor Join list this group holds competitions and overnight trips only; Fundraisers, Outreach and Team meetings stay under Meetings & events even when they involve travel. Competitions and trips are for the whole team, never marked "for your subteam".
- **Team meetings default to one-time and optional** (November 7). `+ Team meeting` starts as a one-time, optional meeting; a Coach can still choose Required or Repeat (a repeating meeting still defaults to end May 31).
- **The `+ Team meeting` sheet stays a single screen** (November 9). Owner decision: it is an approved exception to the step-by-step wizard rule because it is a fast path, and More options opens the full New event wizard.
- **Simplified Mentor Home** (November 7), per the approved mockup: the next event, Who's here now (students of the Mentor's subteams clocked in now) and what needs an answer. Full lists live on the Schedule page (Going, Join, Created by me). Coaches and Travel Leads see who created an event and a "Mentor meeting" tag.

## Usability audit (November 9, 2026)

November 9, 2026 owner decisions from the usability audit (branch `feat/usability-audit`, not merged or released).

- **Ask a Coach.** Signed-in Parents, Students and Mentors can send a short message (topic and message) to coach@team8044.org. The recipient is fixed on the server and Reply-To is the sender. The email includes the sender's name, role, sign-in email and the names of students they already have access to, never health or money data. Limits: 3 per hour and 10 per day per account. Messages are emailed and not kept in app tables; Convex keeps the send record (with the message) for about a week. Coaches and Travel Leads don't see it.
- **Event Readiness** lists only events with requirements to complete (or team transport). Columns that don't apply are hidden. Permission form status shows only while signing is open. Shifts are information only: the page shows each student's signed-up count against the minimum and links to the shift list, and shifts never count toward ready or open. While signing is paused, an unsigned required form still keeps a student from being ready and keeps the event listed; the response carries only an event-level count for the "not marked ready" note, not a per-student reason. The list reads at most 100 events (25 requirements and 25 charges each), about 5,100 documents against Convex's 32,000 limit.
- **Ask a Coach delivery failures.** The sender sees "Sent" once the message is queued. If the email service later rejects it, or retries run out, the failure is logged (account id and attempt only, never the message or contact details) and the message is not retried further. No status is shown to the sender. Surfacing failures in the app is a possible later change.
- **Sign-in email code step.** It keeps the sign-in email in this browser for up to 15 minutes, never the code. It is cleared on success or Back.
- **Team roster.** Requirements chips: Needs attention, FIRST registration, Permission form (while open), Balance due, Missing profile information. Needs attention means an open item for the next event, or an unsigned permission form while signing is open. Bulk select offers Copy reminder (text only, nothing is sent) and Export list.
- **Mentor scope.** Who's here now lists names and clock-in times for the Mentor's subteams only. Join defaults to the Mentor's subteams plus whole-team items, with Show all subteams. Team report defaults to the Mentor's subteams and shows no health, money or contact data. The Mentor Team report shows up to 40 students and says so when the list is cut off. Mentor "New meeting" notices go only for whole-team or the Mentor's-subteam meetings, not specific-students audiences.
- **Google sign-in** always shows the account chooser, and wrong-account screens offer "Use a different Google account".

## Attendance breakdown

- October 27–28 owner decisions. Required meetings are non-Outreach sessions on Tuesdays before Build Season kickoff and Mondays from kickoff (America/Chicago); they drive Home's ring and are worded "Required meetings". Other meetings are the remaining non-Outreach sessions, listed by date and title when provided.
- Outreach is a calendar title match or the Outreach event flag; Coach and Travel Lead can set it, and an explicit unmark wins over the title. Stored flags let a Coach change what counts later (no UI yet).
- Build hours show on Attendance like Home once Build Season starts, listing every Build day (Attended/Missed, minutes). A Weekday vs Weekend split is kept for Travel Team decisions (Weekend = Saturday + Sunday, Build Season only).
- The earlier-records tables were empty and unused; the earlier records page is removed.

## Retention

- Five years runs from the latest archival after reactivation and triggers review, not automatic erasure. Automatic deletion remains unauthorized.
- Review profile/contact/health, attendance, participation, financial history and permission evidence together. Preserve shared Parent/other-student records, Coach-reasoned holds and immutable signing history. An unresolved balance, dispute, safety incident or preservation requirement pauses relevant disposal until a recorded review/release decision.
- DS Robotics Foundation operates Denham Venom Team 8044; admin@team8044.org handles verified requests.
- Keep authorized exports in organization-controlled storage; track required official copies, remove temporary device/download copies after use and include retained exports in the same review/hold process. No automatic export inventory or remote deletion is claimed. Verify requester identity before supported corrections; never rewrite signed evidence.
- Disposal and backup coverage remain unproven; see [Security/Recovery](BACKLOG.md#securityrecovery). Do not certify legal compliance from these notes.
