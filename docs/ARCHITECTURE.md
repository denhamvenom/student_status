# Student Status and Timeclock architecture

Read [HANDOFF.md](../HANDOFF.md) for current work, known risks and verification limits. This document describes code contracts, not a fresh production inspection.

## Applications and data ownership

Student Status lives in root `src/`; Timeclock lives in `apps/timeclock/`. Both are React/Vite SPAs using React Router, strict TypeScript, Tailwind and shadcn Base UI. Root `convex/` is the only domain backend; generated API/types are shared. Shared helpers implement deterministic money, attendance, time and validation rules. Cloudflare serves each frontend independently.

Convex queries own remote state. Zustand/menu/selection stores contain ephemeral UI state, not an authoritative account ledger or persisted roster/health/finance cache. Authentication uses the implemented origin-local storage namespaces; a common issuer or hostname never substitutes for server access checks. Development review fixtures are visibly synthetic and cannot authorize live writes.

## Identity and authorization

`convex/auth.ts` configures Google and the guarded `parentEmail` credentials provider. Students use verified Google identity; eligible parents and approved staff also have email-code/private-invitation paths. Stable Convex Auth user IDs map to appUsers; server helpers enforce active status, role, season and per-record ownership. Parent/staff email-auth markers are constrained to the appropriate account type and normalized email.

| Actor | Scope |
| --- | --- |
| Student | Own active-season record and permitted event/room/profile actions; no authority supplied by a persona selector |
| Parent | Exact active family links; structured health/contact confirmation, travel choice and approved consent paths |
| Coach | Account/role, roster, team, finance, season and controlled historical administration |
| Mentor | Minimized reports and authorized Timeclock operations; no implicit private finance/health access |
| Travel Lead | Mentor capability for operational access; finance editing and sensitive exports require their own explicit grants |

Public functions derive identity on the server and return minimized projections. Recheck grants when deferred/page-wise operations execute. Archived corrections use warned, scoped, expiring Coach access, reasons and immutable audit. A Timeclock PIN does not limit the broader privileges of a logged-in Coach.

## Core records and derived state

Seasons scope student profiles, events, charges, rooms, attendance and reports. Stable IDs link records; legal/preferred/structured names are presentation/matching inputs, not relationship keys. Dates use ISO calendar values or epoch milliseconds as appropriate, with America/Chicago/DST presentation.

Travel events and participants are distinct from Calendar occurrences, Timeclock sessions and intervals. App events can create or explicitly adopt/link individual Calendar occurrences. Synchronize supported schedule/location/cancellation fields and the Media Support Requested marker; do not publish student identities, fees or private consent information to Calendar. Preserve external description content outside managed markers.

Participation and readiness remain separate. Pending reservations consume capacity without confirmed debt; waitlists are chronological and manually promoted. A real reenrollment gets a new queue position. Whole Team and Travel Team rules are server-controlled, not lists invented in the client. Attendance does not gate travel readiness.

Readiness has student requirements, transportation and adult room placement categories, each ready/open/not applicable. Include every active event-tied charge in payment readiness; standalone charges do not gate an event. Family/Student room selection is distinct from adult final placement. Student groups stop at four; adult fifth-person exceptions need a reason; never mix categories or allow six. After the deadline students cannot change groups/invites; supported adult corrections remain audited. Signup/acceptance/withdrawal changes reconcile capacity and room state transactionally.

## Finance and season integrity

All money is integer cents. Preserve personal-payment versus fundraising provenance, original receipts, allocations and append-only before/after evidence. Projections/materialized sources and bounded durable workers support long histories; unavailable/unprepared/held data is not zero. Revision checks, idempotency keys and durable recovery guard multi-step financial commands.

Approved withdrawals support full return, partial return, retained payment or denial. Internal returns reverse eligible event allocations and automatically apply to other charges in priority order while excluding the withdrawn event. Cancel unpaid extras automatically; unpaid main fees remain owed unless explicitly cancelled. Approval releases participation/room places while retaining financial evidence.

Cash/check payout recording is separate and reduces held personal-payment funds; the app does not send money. Fundraising credits cannot be paid to a family. Authorized financial staff can transfer available fundraising credits to active same-season students with a reason. Team transfers and season dispositions preserve source lineage; insufficient available original credits hold a fundraiser reduction instead of silently creating debt or clawing funds back.

Departing balances are normally nonrefundable, subject to Coach review of a family exception. A Coach-reviewed personal-payment-to-team disposition does not require separate documented family authorization, but does require explicit source/amount/reason/audit review. Archival or season close never silently sweeps balances. Team bank accounting is outside this app.

Season transitions preview returning/departing records and financial dispositions, use durable guarded steps and prevent incompatible writes. Unsupported downstream-linked historical corrections remain held for explicit resolution. Archived-account retention is five years from the most recent archive date after reactivation; holds and download/backup disposal remain operational work. Automatic retention deletion is not authorized.

Fee-specific payment CSV review uses stable row/account/charge identities and revisions; new receipts target the selected fee rather than spending existing credit. Fundraiser-link CSV keeps stable identities and distinguishes blanks (clear) from omitted rows (unchanged).

## Parent linking and approved PDF consent

Parent invitations are seven-day single-use private inbox links with explicit relationship attestation; issuance/replacement is Coach-controllable and resend has a one-hour guard. Existing valid invitations and links survive pausing new issuance. Matching email control is not independent proof of guardianship. See [parent invitations](PARENT_INVITATIONS.md).

New consent uses the approved original field-trip PDF template, populated from completed Student setup and Parent-confirmed structured health/contact information. Preserve the original logo, ordinary one-page layout and signature slots; genuine overflow continues losslessly. The Parent reviews the exact server-prepared PDF, checks acknowledgment and types the verified signer name. Store immutable reviewed/signed PDF bytes/hashes, covered-event/signer/profile evidence and version; later events or profile changes cannot alter a signed receipt.

Active Medication Choices/seasonal OTC authorization are superseded; legacy evidence remains intact. Review/correction/re-sign and paper acceptance preserve original submissions rather than editing signatures. Sensitive PDF/export access is checked server-side, including between export pages.

Signing mode is synthetic only for registered development subjects, real only when the explicit enable flag and matching approved cloud URL both pass, otherwise closed. Source support does not prove production enablement (VERIFY actual settings). Bootstrap and maintenance tools retain exact-target/opt-in safeguards; do not rerun them from old launch instructions.

### PDF evidence and legacy compatibility

Generate prepared/reviewed artifacts on the server from an authoritative bounded snapshot, with pinned template identity, exact bytes and SHA-256. A client-provided hash/PDF is not authority. Recheck Parent link, setup/profile completion, profile/event/wording/coverage revisions, expiry, acknowledgment, signer identity and signing mode on submission. Retries are idempotent; changed mode requires fresh valid preparation, not silent reuse. Disabling signing must preserve readable historical evidence.

Keep structured guardian, emergency, insurance and physician information plus explicit none/unavailable states, bounded allergy entries (allergen/severity/reaction/response) and prescription entries (name/dose/timing/reason/carried-by). Never infer structured medical answers from old free text. Parent confirmation and revisions protect concurrent changes.

Electronic account signer, named paper signer and Coach recorder remain distinct; paper and electronic paths use the same signing gate. Per-retrieval authorization, memory-only PDF bytes/object URLs with cleanup and per-page export grant rechecks prevent public/persistent health-file exposure. Version-1 validators/hashes/receipts remain readable; new format-2 workflows do not mutate legacy evidence. Existing detailed legacy-consent contracts remain separately retained until their unique compatibility detail is consolidated.

## Timeclock and attendance

Active authorized Coaches/Mentors operate a minimized reviewed roster; normal shared-device use should use an ordinary Mentor. Server clock commands own session revisions, atomic group/transfer behavior, PIN checks, throttling and idempotent retries. Close/extension settlement is server-owned; stale scheduled jobs cannot close a later extension.

The selected event uses a memory-only roster snapshot, retained across Chicago midnight; live IN/OUT status remains subscribed. Leaving/reselecting follows the snapshot scope contract. Stable day arguments and local visible clocks avoid frequent query churn. Console profile identity coordinates same-profile tabs without sharing domain data across origins.

Qualification requires a single uninterrupted scheduled-hour overlap; separate visits do not combine to qualify. Early/extended time and total time remain distinct. Corrections append evidence; reports use durable summaries/aggregates, with explicit provisional/unknown/rebuild states and minimized paginated cards. Legacy checkmarks never invent clock intervals.

Historical import has its own approved interpretation: current roster matching by first/preferred name plus last initial; Calendar start through final valid OUT continuously for selected Team Meetings, full scheduled windows for the two approved outreach occurrences, Central time. Ambiguity/overlap/stale schedules fail; exact replay is a no-op. Do not apply that historical exception to normal live qualification rules.

Calendar scheduled refresh is 6 AM/3 PM Central plus authorized manual refresh, using DST-aware slot guards; the earlier minute-polling contract is historical. See [Timeclock contracts](TIMECLOCK_BACKEND_HANDOFF.md), [attendance reporting](ATTENDANCE_REPORT_IMPLEMENTATION.md), [linked Calendar](EVENT_CALENDAR_SYNC.md) and [historical import](TIMECLOCK_HISTORY_IMPORT.md); their older status paragraphs require the cleanup listed in HANDOFF.md.

## Zeffy and operational boundaries

Zeffy matches supported USD peer-to-peer donations through saved fundraiser campaign links, not donor email/name. Saved campaign/student/season ownership and provider payment IDs prevent double credit and silent reassignment. Preseason donations are allowed; ambiguous, changed, refunded/disputed and historical-season cases require review. Credit through the existing source ledger/allocation/report paths; retain unused surplus. Provider/preview safety bounds fail explicitly rather than truncating silently.

Automatic checks default off for a new deployment and use 7 AM/7 PM Central slot guards when enabled. Repository evidence records an approved activation and idempotent live import, but an actual scheduled execution remains unobserved (VERIFY). See [Zeffy](ZEFFY_SYNC.md).

Auth redirect origins, signing gates, Calendar credentials/PIN, email and Zeffy secrets are server deployment configuration. Frontend VITE variables are public build-time inputs. Main-connected frontend publication and backend deployment are separate; follow [deployment](DEPLOYMENT.md). Backup/restore, security inventory, mounted UI regression and physical-device evidence gaps remain in HANDOFF.md; passing source tests do not close them.
