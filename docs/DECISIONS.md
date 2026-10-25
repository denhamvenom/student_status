# Project decisions

Read this before changing parent linking, consent/PDF, finance, rooms/waitlists or retention. These are carried-forward owner decisions, not claims that every operational safeguard is complete.

## Parent linking

- Invitations are seven-day, single-use, and tied to the matching email.
- Require explicit good-faith parent/legal-guardian relationship and authority attestation. Email control does not independently prove guardianship or sign consent.
- Preserve inbox privacy, the one-hour resend guard and revocation/access checks.

## Developer sign-in

- October 25 owner decision: the development deployment (`third-bandicoot-18`) offers a developer sign-in so the owner and Claude can test every role without Google. It signs in only to fixed fictional accounts on the reserved `developer.example.invalid` domain: Coach, Mentor, Travel Lead, Parent, Parent with staff access, and Student. It never signs in, creates, links or changes a real account.
- It works only when all of these hold: the backend is the hard-coded development URL, the server switch `DEVELOPER_SIGN_IN_ENABLED=true` is set, and the request carries the server-held `DEVELOPER_SIGN_IN_KEY`. Reserved-domain sessions are refused whenever those conditions stop holding. The sign-in panel exists only in local development builds; the production build fails if any of it is bundled.
- Never set the switch or key on production. Fictional accounts and their family links hold synthetic data only. Real Google and parent-email sign-in still need a human check before releases that touch authentication.

## Consent/PDF

- Require completed Student setup and a Parent-confirmed structured profile before the approved populated PDF workflow.
- Preserve the exact reviewed/signed artifacts, acknowledgment and typed verified name.
- Preserve the approved original one-page design, lossless continuation for genuine overflow and all historical receipts.
- Active OTC/Medication Choices are superseded; do not introduce a new workflow for them.
- October 22 owner decision: real PDF signing is deferred until the owner is ready. Do not enable it without a later explicit instruction; preserve approved wording and existing evidence. This decision does not assert or change the current production flag; check that setting when signing work resumes.

## Finance

- Use integer cents, preserve personal-payment/fundraising source lineage and retain append-only evidence.
- An internal withdrawal return is not a cash payout. Cancel unpaid extras; keep unpaid main debt unless explicitly cancelled; reallocate returned funds away from the withdrawn event.
- Fundraising credits cannot be paid to a family.
- Coach-reviewed departing personal funds may move to team with explicit source, amount, reason and audit. A separate family authorization is not required; archival/season close never sweeps funds automatically.
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
- Travel Team means students selected by mentors/Coaches through an application for out-of-state and local travel. It is distinct from Travel Lead and the event's team-transport requirement.
- Canonical subteams are Build, Electrical, Machining, Programming and Business/Media. No Unassigned choice is offered; existing missing assignments stay missing. The owner deferred stored conversion: Mechanical maps to Build; Business, Outreach and superseded Business and Media map to Business/Media only through reviewed, authorized migration.

## Setup and FIRST

- Students and linked Parents share profile/birth-date values within existing role boundaries; Students gain no access to Parent medical fields. Preserve initial Student subteam selection, Coach corrections and legacy assignments.
- Completed shared information is reused for a second Parent; personal account answers remain scoped. Save/resume and multi-child selection must not overwrite another child's profile.
- FIRST verification is once per student/season and requires both team acceptance and Consent & Release to be Coach-verified. Self-report does not clear readiness; reopening needs a reason and blocks Competitions again. New seasons start unverified; legacy event completions do not silently count as season-wide verification.
- FIRST invitation/reporting follows age/birthday eligibility: do not direct minors to adult self-report. All Competitions inherit the season-wide status; Outreach/Team and historical evidence are preserved.

## Retention

- Five years runs from the latest archival after reactivation and triggers review, not automatic erasure. Automatic deletion remains unauthorized.
- Review profile/contact/health, attendance, participation, financial history and permission evidence together. Preserve shared Parent/other-student records, Coach-reasoned holds and immutable signing history. An unresolved balance, dispute, safety incident or preservation requirement pauses relevant disposal until a recorded review/release decision.
- DS Robotics Foundation operates Denham Venom Team 8044; admin@team8044.org handles verified requests.
- Keep authorized exports in organization-controlled storage; track required official copies, remove temporary device/download copies after use and include retained exports in the same review/hold process. No automatic export inventory or remote deletion is claimed. Verify requester identity before supported corrections; never rewrite signed evidence.
- Disposal and backup coverage remain unproven; see [Security/Recovery](BACKLOG.md#securityrecovery). Do not certify legal compliance from these notes.
