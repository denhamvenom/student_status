# Visual review closed — October 16, 2026

## October 19 fee payment CSV

Actual component with isolated synthetic backend: CSV upload reached Review, showing server-provided name/balances, selected fee and total. Desktop 1440px light and phone 390px dark layouts inspected with no horizontal overflow. Existing shared cards, controls, typography and colors reused. Backend saves, authenticated browser operation and remaining viewport/theme combinations are not claimed. See [workflow evidence](FEE_PAYMENT_CSV.md).

## October 19 charge workflow current checks

| Check | Evidence / remaining work |
|---|---|
| Automatic full-list review, original reason, explicit confirmation | Source reviewed and focused tests passed; live browser interaction unobserved |
| Close details and collapsed cancellation on phone/desktop/light/dark | Source reviewed; fresh authenticated visual comparison remains pending |

## October 19 parent invitation resend

Actual StudentParents component with mocked Convex passed countdown, resend rejection/success, refreshed Share/Copy link and busy controls at 1440px light and 390px dark. Screenshots inspected: no overflow. Uses existing card/button styles. Local synthetic evidence only; real Google redemption and physical device share remain unverified. Screenshots remain ignored under .test-temp/parent-email-ui. Other audit-screen visual checks below remain separate.

## October 19 parent email/share candidate

| Check | Evidence / remaining work |
|---|---|
| Student Parents email/share controls | Actual component with mocked backend, 1440px light and 390px dark inspected; wrapping and controls readable, no overflow |
| Status and fallback behavior | Synthetic browser check passed queued/sent/failed/not_sent, configuration message, native-share mock, cancellation/failure and copy fallback |
| Integrated delivery and device sharing | Real email/OAuth link and physical phone share sheet remain unverified; requires sender configuration and authorized test recipient |

See [current evidence](PARENT_INVITATION_EMAIL.md) and [conformance detail](FRONTEND_CONFORMANCE_LOG.md). No production changes.

## October 18 Batch 4 current checks

| Check | Evidence / remaining work |
|---|---|
| Coach waiting counts, Money tools, Revoke access | Dark phone: observed; confirmation opened and Cancel preserved access |
| Travel Lead New event, Costs, Money tools | Dark desktop: draft reached fee input and Cancel; no financial editing grant, no bulk payment or matching tools |
| Five-subteam filter | Travel Lead roster shows exact final list; legacy Mechanical displays as Build; no stored conversion |
| Parent family workflows | Dark desktop Money definitions, positive Available funds on Home and signup guidance observed; no eligible travel checkbox exercised |
| Student family workflows | Dark desktop Home available funds, read-only independent travel, Whole Team leave confirmation and Cancel observed; participation remained confirmed |
| Light theme and other state combinations | Not freshly observed; source review and tests remain distinct from live evidence |

See [Batch 4 report](audit-2026-10-18/batch-4-report.md). Earlier tables below are historical.

## October 18 Batch 3 current checks

| Check | Evidence / remaining work |
|---|---|
| Travel Lead grouped navigation and Join requests | Observed at 390px and 1440px in dark theme; no Coach-only tools shown |
| Coach New event draft preservation | Observed at 1440px dark: group opens Events; backdrop click preserves draft after fix; Cancel closes without saving |
| Parent/Student Edit profile and awaiting FIRST | Source-reviewed; fresh role browser checks remain unobserved |
| Light-theme comparison | Unobserved; saved user theme unchanged |

See [Batch 3 report](audit-2026-10-18/batch-3-report.md). Historical accepted visual checks below remain historical.

## October 18 footer follow-up

Footer-only navigation implementation and representative local evidence are recorded in [FRONTEND_CONFORMANCE_LOG.md](FRONTEND_CONFORMANCE_LOG.md). Public/signed-out phone and desktop checks passed; authenticated Timeclock footer remains to observe during the authorized Mentor production rehearsal. Do not reopen completed October 16 visual acceptance or repeat unrelated captures.

Owner closed the development visual cycle at1f20ca8. Fresh independent Astra review found no blocking findings. Prior accepted evidence and explicitly unobserved states remain below; they are not a new visual queue. Item5 reopened explanation is implemented. Next phase and production gates: [ONLINE_READINESS_HANDOFF.md](ONLINE_READINESS_HANDOFF.md). No production approval implied.

## FIRST reopened explanation — October 16 follow-up

Item5 is now implemented after explicit authorization for the minimal response addition. The existing authorized FIRST getter returns a boolean derived from needsCompletion plus saved reopenedAt; no reason, actor identity, schema, state-write or verification-rule change. Parent/adult Student see: Your Coach reopened this. Check both in FIRST, then report again. It appears above Needs completion; initial, awaiting and verified states omit it. Minors are not directed to report.

Focused existing setupWizardFirst suite passed: initial versus reopened, direct Coach verify-before-report then reopen, adult re-report/re-verify clears the indicator, unrelated Parent access remains denied, correction reason/actor stay private. Typecheck/build/scoped lint passed. Astra narrow review: no blocking findings. Synced successfully to development third-bandicoot-18 only; no live domain records altered. Owner visual approval remains separate.
## Bounded review corrections after 5210585 — October 16

External bounded review: ready for owner visual approval, no blockers. This requested polish pass preserves that evidence; application wording/style changes only.

| Item | Outcome | Files |
|---|---|---|
| 1 | Mentor desktop Thursday sessions; phone count precedes Thursday sessions. Coach/Travel Lead table headings and phone labels use Tuesday attendance / Thursday sessions. | src/LiveApp.tsx, src/lib/live-copy.ts, src/TeamReports.tsx |
| 2 | FIRST review link is on a separate line with 6px top spacing, shared across Awaiting, Verified and Needs completion. | src/features/design-review/ReadinessReview.tsx, ReadinessReview.module.css |
| 3 | Parent final step shows the exact earlier-complete orientation only when details, contacts and medical are complete. | src/SetupWizard.tsx, src/lib/setup-wizard-copy.ts |
| 4 | Parent summary reads Saved. FIRST registration: [current status]. Existing read endpoint supplies status; checking/unavailable remain honest. | src/SetupWizard.tsx, src/lib/setup-wizard-copy.ts |
| 5 | Deferred. Current FIRST client result has no explicit reopened marker; revision/timestamps cannot reliably identify all reopened records. No inferred message or backend contract change introduced. | No change |
| 6 | Verified FIRST uses existing success colors and a check mark. | src/SetupWizard.tsx, src/SetupWizard.module.css |
| 7 | FIRST invitation link is secondary; reporting completion remains primary. | src/SetupWizard.tsx |
| 8 | Held-row explanation replaced as requested; Fundraising user-facing committed terminology changed to recorded. Internal fields/states and financial semantics unchanged. | src/Fundraising.tsx, src/lib/fundraising-copy.ts |
| 9 | Hide open-requirements helper when none are open; Permission form display heading preserves the original domain key and missing-item highlighting. | src/features/design-review/ReadinessReview.tsx |
| 10 | Reports counts use student/students correctly, including filtered and partially loaded counts. | src/TeamReports.tsx |

Validation: typecheck and build passed, scoped ESLint passed. Existing bundle-size advisory remains. No backend/schema/Timeclock/PDF/signature/account/financial changes or production deployment. CSV cents, development labels and synthetic-signing explanation retained. Only item5 deferred from this request. Rehearsal preview refreshed separately under ignored private-data; static controls remain nonfunctional.
## Final targeted pass — October 16

Supersedes only the remaining-state limitations below; earlier evidence is retained. Existing Mentor session signed out to the application login page, selected the same existing account in Google, and returned to the authenticated Report. No credentials, accounts, roles, Parent links, domain records, FIRST evidence, money or signatures were changed. This exercises normal app sign-out and Google return, not live Join/Waiting sign-out or the production origin.

The ignored read-only preview now targets a second Parent viewing a previously completed shared student profile, Parent completion summary, adult Student FIRST, awaiting/verified/reopened FIRST, populated Competition FIRST and post-kickoff Mentor attendance. These are synthetic component snapshots with mocked query results, not authenticated role sessions or live transitions. Existing isolated behavioral checks remain valid. Private fixture render validation only; no app-source change and no repeated integrated build.

Remaining boundaries: no live Join/Waiting account was manufactured; no real processing failure was forced; production-domain OAuth is a launch check. Reviewer should inspect only the new preview sections and any still-unaccepted final-polish items. Static controls intentionally do nothing. Actual FIRST invitation is still not supplied; a configured-link example is hypothetical, not a configured live invitation. CSV cents headings and production-only development-copy removal remain deferred. Approved PDF/signing remain untouched.
| ID | Targeted evidence | Reviewer action / remaining limit |
|---|---|---|
| F1 | Existing Mentor signed out and returned through Google to Report | Live Join/Waiting sign-out still not exercised; do not manufacture an account state |
| F2 | Second Parent same completed student and completion summary rendered; desktop screenshot inspected | Check wording; link authorization established by prior isolated tests, not snapshot |
| F3 | Adult FIRST, awaiting, verified and reopened rendered; adult phone390 inspected | Check role wording and waiting/next-step clarity; configured invitation is fictional |
| F4 | Competition awaiting/verified/reopened rendered as 0/1, 1/1, 0/1 ready; verified desktop inspected | Status and Review season verification link sit tightly together on desktop; assess as optional spacing polish |
| F5 | Post-kickoff Mentor phone390 screenshot inspected with compact Tuesday/Thursday row | Reviewer checks desktop table as well; no actual date change |
| F6 | Preview document client/scroll widths agree:375/375 at390 and1425/1425 at1440 | Isolated preview wrapper, not full application shell |

Private screenshots: private-data/visual-checks/final-targeted. Preview corrections fixed a mislabeled second-student fixture and built CSS suffix mapping before capture. Scoped fixture render assertions passed after correction. No new full-suite/typecheck/build run because application source is unchanged. Reader should review these states once, retaining earlier accepted results. Development signing explanation/banners and CSV headings stay deferred as stated above.

## Bounded rehearsal without additional Google accounts — October 15

Application baseline a3a2b03 preserved. No live mutations, account creation, role changes, Parent-link changes, financial records, FIRST verification or signatures. All behavioral rehearsal below uses isolated convex-test identities or server-rendered synthetic props.

| State | Fresh evidence | Limit |
|---|---|---|
| Second linked Parent | setupWizardFirst confirms shared completed contacts/medical answers, shared revisions, no repeated completed setup, stale edits rejected | Simulated identity; no new Google login |
| Adult Student | Added direct invitation-access and completion-report assertions; adult can report but remains awaiting Coach verification | Actual FIRST site not contacted; no live age edit |
| Unrelated Parent | Added empty-family summary and denial of setup read, medical write, FIRST read/report | Simulated unauthorized identity |
| Competition FIRST | Existing setupWizardFirst rehearsal checks confirmed participants across two Competitions; legacy event completion does not bypass season FIRST; verify clears both, reopen blocks again | In-memory records only |
| Wrong-account invitation | accounts and parentInvites suites passed identity, expiry/revocation and access checks | No new OAuth round trip; earlier live evidence retained |
| Processing/retry | ReviewStates renders partial/failed/held views; targeted financeOperations retry preserves locks and committed source money without duplication | Rendered controls and backend retry tested separately, not a live failed job |
| Join/Waiting sign-out | ReviewStates verifies sign-out controls in both states without form submission; existing handler calls auth signOut with recoverable error display | Fresh real-session sign-out not performed |
| Kickoff boundary | Existing seasonCalendar boundary tests passed | Post-kickoff Mentor appearance remains a visual gap unless a real-component fixture is supplied |

Only two missing authorization scenarios were added to the existing setupWizardFirst suite. Selected suites passed; no full-suite/build repetition because application source is unchanged. Account-specific screenshots remain private. Fresh Google identity flow per scenario is intentionally not required for this development rehearsal; owner launch gates remain separate.

Read-only reviewer preview: http://localhost:5173/private-data/rehearsal-preview/index.html (local, ignored private-data/rehearsal-preview/index.html). Actual components rendered with fictional props and current built CSS: Join, Waiting, partial financial failure/retry, withdrawal failure/retry, held fundraiser and unknown gross raised. Opened in browser; representative Join view visually inspected. Controls intentionally do nothing; no live data or authentication bypass. Wrapper spacing is not evidence for the complete app shell.

Reviewer checklist: inspect Join/Waiting wording and Sign out placement; distinguish completed versus remaining work and next steps in failed/held/retry views; confirm unknown gross reads Not recorded; check readability at desktop and 390px. Do not rerun all previously approved pages. Second Parent, adult Student and FIRST lifecycle have automated behavioral evidence, not newly observed authenticated screens. Post-kickoff Mentor appearance remains unobserved. Fresh real Google round trips and live sign-out were not repeated.
## Final polish after external recheck 7fcd965 — October 15

The external recheck passed the required corrections and identified these final presentation changes. Prior evidence remains retained below.

| Item | File changed | Result / evidence |
|---|---|---|
| 1 | src/TeamReports.module.css | Raised heading selector specificity above the shared heading reset. Actual margin and preceding gap are 32px for Attendance and Selected event at desktop1440 and phone390; both screenshots inspected. Shared Coach/Travel Lead component; live Coach verified. |
| 2 | src/LiveApp.tsx | Each waiting item names who and what; preferred student name used for Parent context and you/your for Student context. Hide To do heading when count is zero; keep caught-up text. Student Home observed live with separate health-profile and FIRST waiting sentences. |
| 3 | src/features/design-review/ReadinessReview.tsx | Empty participant state uses one message instead of three cards/repeated badges/counts; event header and Manage event retained. Enrollment processing/failure and printable output preserved. Empty Competition observed live with one message. |
| 4 | src/LiveApp.tsx | /enroll now names Coaches; known restricted route mappings checked. Generic wording remains only for unknown paths. No access change. |
| 5 | src/lib/adult-profile-copy.ts | Page heading is Profile. |
| 6 | src/lib/report-copy.ts | Gross raised is the total before the team and student split. |
| 7 | docs/DEVELOPMENT_CHECKLIST.md | Launch-only cleanup: remove the synthetic-signing explanation together with the development banner from the production user experience. Retain both in development; do not remove signing safeguards or enable real signing without separate authorization. |

Validation: typecheck and build passed; scoped lint and diff checks passed. No new tests added for this presentation-only pass. Standard build bundle-size advisory remains unchanged.

Private spacing captures: private-data/visual-checks/wizard-corrections/final-polish/report-desktop.png and report-phone390.png. Temporary viewport reset. No role/link/financial/FIRST/signature/access changes; approved permission PDF and workflow unchanged. CSV cents remain deferred. Production/main merge not authorized.

## October 15 recheck and first Mentor review corrections

Current batch builds on 3739315, preserving both sign-in repairs after the review's 6e66ca8 baseline. Source review is clear. This table supersedes the older claim that the Fundraising footer was already removed.

| ID | Change / confirmation | Evidence and remaining visual scope |
|---|---|---|
| R1 | Removed technical gross-proceeds footer; unknown gross cells say Not recorded; Leftover cents go to the team | Fundraising.tsx, fundraising-copy.ts, TeamReports.tsx. Coach footer observed live; unknown-value branch source checked. |
| M1 | Ordinary Mentor event list/detail routes show Page unavailable before rendering event content; Travel Lead preserved | LiveApp.tsx. Both routes rejected live. |
| M2 | Attendance heading includes Tuesday and Thursday after verified kickoff; before/unknown kickoff hides column and uses one kickoff line | LiveApp.tsx and existing seasonCalendar helper. Current season observed; post-kickoff source reviewed. |
| M3 | Mentor bottom nav is Report, Profile, Settings; no More | AppShell.tsx. Phone390 observed. |
| M4 | Known restricted routes name permitted roles; unknown routes retain generic fallback | LiveApp.tsx. Mentor event message observed; remaining mappings source reviewed. |
| S3-nav | Profile and Forms labels aligned between phone and desktop; Mentor Report/Profile also aligned | navigation-copy.ts. Mentor both sizes live; family source checked. |
| S3-date | One-day permission events already render one date | Existing PermissionWorkflow date formatter and focused tests pass; no new permission change. Travel Lead live recheck not performed. |
| S3-receipt | sealed to this record already absent | Permission presentation source checked; no new receipt/PDF change. Parent live receipt not reopened. |
| S3-transport | Student ownProfile uses you; Parent heading now Student transportation | LiveApp.tsx, operations-copy.ts, existing Travel implementation. Source reviewed. |
| S3-withdrawal | Original event fee label distinguishes historical fee; existing canceled/no-fee-owed/retained calculation preserved | LiveApp.tsx, WithdrawnEventFee.tsx and withdrawn-fee-label.ts source checked; Student withdrawn event observed Original event fee $1.00 canceled. No money edits. |
| P-a | Awaiting FIRST shows only status and Your Coach will confirm it | SetupWizard.tsx, setup-wizard-copy.ts. Source reviewed; current Parent session unavailable. |
| P-b | Home counts reader-actionable items only; waiting appears separately | LiveApp.tsx. Student Home observed To do 0 with separate Waiting on parent or guardian; Parent live recheck remains. |
| P-c | Collapsed child list names selected student followed by Change | SetupWizard.tsx. Source reviewed; Parent phone recheck remains. |
| P-d | Disabled shared gold buttons use muted colors, not opacity | components/ui/button.tsx. Source/typecheck; visual disabled states remain owner recheck. |
| P-e | Available funds definition uses keyboard/touch disclosure above table, visible on phone too | TeamReports.tsx/CSS. Native disclosure replaces hover-only tooltip; live Enter opens explanation. |
| P-f | Removed bulk row-mechanics sentence; useful retry sentence retained | payment-admin-copy.ts. Source checked. |
| P-g | Added individual report section spacing | TeamReports.module.css. Source checked; owner visual recheck. |
| P-h | Empty-event transport/rooming show No students yet, not Ready/open | ReadinessReview.tsx. Empty Competition observed live. Printable/PDF path unchanged. |
| P-i | Correcting end date clears its stale validation immediately | LiveApp.tsx. Source/typecheck; no event created. |
| P-j | Mentor phone uses compact student rows; event detail uses same date range as list | MentorReport.module.css, LiveApp.tsx. Phone390 observed without horizontal overflow; Student event date range observed live. |

Fresh checks: scoped regressions for Fundraising and permission dates; Reports/DashboardReports/ReviewStates render regressions; full lint, TypeScript and production build passed. Reports test initially hit the known sandbox temporary-file failure; the bounded outside-sandbox run passed. Astra consolidated source review clear. No backend/schema/Timeclock/PDF changes or deployment. Existing packaging evidence reused.

Live captures are private under private-data/visual-checks/wizard-corrections/recheck-mentor: Mentor phone light390 (client/scroll390) and desktop dark1440, event denial, Coach Fundraising, empty Competition, and accessible Reports help. Hosted prototype Mentor report/profile inspected for typography, colors, tables and navigation. Temporary Mentor theme and viewport restored.

Requested special states: processing/retry and Join/Waiting sign-out retain synthetic-render evidence, not fresh live rehearsal; wrong-account invitation/sign-out was observed in the earlier sign-in repair. Second linked Parent, adult Student, populated Competition FIRST remain unavailable live. Verified/Reopen were observed in the earlier October15 fictional rehearsal and were not repeated. No roles, links or financial participation altered to create fixtures. Current former Parent Chrome session is Mentor; Parent-only live comparisons are parked once.

Intentional deferrals unchanged: CSV cents headings, free-text grade, existing Mechanical assignments, Google-email Parent invitations and missing real FIRST invitation link. No requested correction is intentionally deferred; native disclosure is the only implementation variation from the requested tooltip. Owner visual approval remains open.

## October 15 wizard review corrections

Verification: focused setup/Home/travel regressions passed, as did full lint/typecheck/build and packaging dry-run. Astra's saved-but-unconfirmed summary finding is closed. Development synchronized at 10:20 America/Chicago. Student Home, under-18 FIRST, secondary Invite another parent and completion summary observed live. Coach Verified and Reopen rehearsed on an existing fictional record; Settings short copy and completed-zero-unresolved maintenance hiding observed. Parent access restored: FIRST width390/client375/scroll375 and width360/client345/scroll345; button white-space normal; single report action moved list to Waiting on Coach. Fictional FIRST now awaits verification for owner review. One duplicate post-report status sentence removed after this observation. Screenshots inspected and retained privately in private-data/visual-checks/wizard-corrections.

Live evidence limitations: second linked Parent, adult Student and Competition-with-participants FIRST retain focused in-memory/source evidence; no suitable live fixture altered to create those states. These are not claimed live passes. Owner visual approval is still pending.

Final Parent confirmation: completion summary observed after the final copy cleanup; Home uses Finish setup on unfinished family tasks. Phone viewport overrides reset. Final typecheck/build passed after removing the duplicate confirmation. Parent/Student completion did not sign a permission form.


Reconciled the updated 30 KB wizard report once. Row numbers below follow each cutting-pass table in order. Source implementation is complete; live verification and publication are recorded separately. Prior PDF, finance, attendance and download evidence remains valid.

| Review item | Change / disposition | Location (src unless convex named) |
| --- | --- | --- |
| B1 | FIRST controls wrap within constrained grids | SetupWizard.module.css |
| B2 | Child list names next missing section, Finish setup, Waiting on Coach or Done | setupWizard.ts; SetupWizard.tsx |
| B3 | One reporting button: I've done both in FIRST | SetupWizard.tsx |
| W1 | Correct locked-assignment note | setup-wizard-copy.ts |
| W2 | Removed unconditional unsaved-step footer | SetupWizard.tsx |
| W3 | Parent Finish setup; no minor Student action for Parent-only FIRST | app.ts; LiveApp.tsx |
| W4 | Secondary Invite another parent when already linked | SetupWizard.tsx |
| Parent 1 | Your answers save after each step | SetupWizard.tsx |
| Parent 2 | Removed footer | SetupWizard.tsx |
| Parent 3 | Actual next item (B2), including saved-but-unconfirmed Finish setup | setupWizard.ts; SetupWizard.tsx |
| Parent 4 | Removed selected-child/Coach assignments explanation | SetupWizard.tsx |
| Parent 5 | Who should we call about [preferred name]? | SetupWizard.tsx |
| Parent 6 | Choose None reported if there are none | setup-wizard-copy.ts |
| Parent 7 | Short personalized FIRST instruction | SetupWizard.tsx |
| Parent 8 | Single FIRST completion button | SetupWizard.tsx |
| Parent 9 | Removed reporting explanation | SetupWizard.tsx |
| Parent 10 | You can finish now. Field trip forms are signed separately | SetupWizard.tsx |
| Parent 11 | Kept Contact your Coach missing-link recovery | setup-wizard-copy.ts |
| Student 1 | Removed footer | SetupWizard.tsx |
| Student 2 | Legal name wrong? Request a correction links to Profile | SetupWizard.tsx |
| Student 3 | Ask a Coach to change your subteam, rooming or Travel Team | setup-wizard-copy.ts |
| Student 4 | Your parents heading; removed connection explainer | SetupWizard.tsx |
| Student 5 | Secondary Invite another parent | SetupWizard.tsx |
| Student 6 | Minor Students do not see FIRST adult instructions/link | SetupWizard.tsx |
| Student 7 | Your parent completes FIRST registration | setup-wizard-copy.ts |
| Student 8 | Removed duplicate finish sentence | SetupWizard.tsx |
| Home 1 | Minor/adult FIRST wording follows age; server authorization unchanged | app.ts |
| Home 2 | No action for Parent-only Student items | app.ts; LiveApp.tsx |
| Home 3 | Finish setup action | LiveApp.tsx |
| Home 4 | Edit setup link | LiveApp.tsx |
| Home 5 | Attendance totals start at kickoff | report-copy.ts |
| Coach 1 | Paste the team invitation link from FIRST. Families see it during setup | FirstRegistration.tsx |
| Coach 2 | Removed repeated invitation explanation | FirstRegistration.tsx |
| Coach 3 | Not set. Families are told to contact you | FirstRegistration.tsx |
| Coach 4 | Hide completed Family link maintenance with zero unresolved links | FamilyLinkMaintenance.tsx; family-link-maintenance-copy.ts |
| Coach 5 | Removed student-record explanation | CoachStudentRecord.tsx |
| Coach 6 | Removed health explanation; retained correction-request link | CoachStudentRecord.tsx |
| Coach 7 | Open permission forms link only | CoachStudentRecord.tsx |
| Coach 8 | Covers every Competition this season | FirstRegistration.tsx |
| Coach 9 | Look up both in FIRST. Then check both boxes and press Verify. | FirstRegistration.tsx |
| Coach 10 | One Attendance heading | CoachStudentRecord.tsx; DashboardReports.tsx |
| Coach 11 | Attendance totals start at kickoff | report-copy.ts |
| Coach 12 | Removed roster explanation | CoachRosterManagement.tsx |
| Coach 13 | Omit redundant Profile setup from displayed missing-information list | CoachRosterManagement.tsx |
| Coach 14 | Student sign-in heading | CoachRosterManagement.tsx |
| Coach 15 | Removed Refresh event status button; timed refresh retained | CoachRosterManagement.tsx |
| Coach 16 | Permission form label | event-copy.ts |
| Coach 17 | FIRST registration is required automatically | LiveApp.tsx |
| Coach 18 | Require FIRST registration for this event; existing Outreach default preserved | event-copy.ts |
| Coach 19 | Print permission forms from [Permission forms] | readinessCopy.ts |
| Reports 1 | As of [date] header | TeamReports.tsx |
| Reports 2 | Draft badge beside export when applicable | TeamReports.tsx |
| Reports 3 | Available funds definition in column-heading tooltip | TeamReports.tsx |
| Reports 4 | Attendance totals start at kickoff | TeamReports.tsx |
| Reports 5 | Attendance totals start at kickoff | TeamReports.tsx |
| Reports 6 | One Choose an event to see readiness message | TeamReports.tsx |
| All 1 | Removed Appearance paragraph | LiveApp.tsx |
| All 2 | Setup is for students and parents | LiveApp.tsx |
| 14 Oct 1 | A dash does not verify completion absent | src source search |
| 14 Oct 2 | Records are collected in pages explanation absent | src source search |
| 14 Oct 3 | Events this form covers retained; removed sealed-to-record phrase from receipt UI | PermissionWorkflow.tsx |
| 14 Oct 4 | Standalone Fundraising footer and duplicate bulk retry footer absent; actionable posting/retry safeguards retained | Fundraising.tsx; PaymentAdministration.tsx; payment-admin-copy.ts |

Optional polish: phone student list starts collapsed; Travel Team is plain text; Coach verification checkboxes are 24px with clickable rows; disabled FIRST buttons are visibly subdued; QR file input styled; empty Readiness reports No students yet. Uniform locked-field icon/style and smaller remove controls are deferred as cosmetic. Grade remains free text to preserve supported grades; existing Mechanical assignments and Parent Google-email sign-in remain compatible. No account/link/access/financial records changed by implementation.


Implementation is complete in development; owner visual approval is pending. Earlier correction evidence below remains valid for unchanged surfaces.

| Surface | Completed evidence | Owner review / limit |
| --- | --- | --- |
| Student setup | Live fictional first-step save, exact five subteam choices, locked category, initial assignment, Finish later, resume to step3 and completion. Minor sees Parent guidance without invitation/report controls. | Review wording and ease of use at /setup. |
| Parent setup | Live linked-child selection; completed sections skipped; existing contacts, allergy/prescription and insurance/physician values prefilled; contacts/medical save and finish succeed without FIRST completion. | Review four steps and switching children. |
| FIRST and Coach | Settings link/optional QR controls, missing-link guidance, roster season status and both-condition verification controls inspected live. | Actual invitation link/QR not supplied. Coach must provide the real season invitation. |
| Shared correctness | Focused tests cover revisions, second-Parent shared completion, Student medical minimization, Chicago birthday, initial subteam protection, Parent report versus Coach verification, multiple Competitions, reopen, next season and legacy Team evidence. Astra review closed all blockers. | Adult UI, QR upload and a full live FIRST report/verify cycle were not rehearsed; no real FIRST integration or verification claimed. |
| Visual style | Existing hosted-prototype tokens/components retained. Representative desktop dark and phone390 light inspected; no phone document overflow (scrollWidth375). Private parent-phone-medical.png and student-complete.png. | Representative scope, not every step/theme/device screenshot. |
| Preserved work | Approved PDF/generator and signed history unchanged. Existing PDF/CSV download/open evidence reused. | CSV cents headings remain deferred by user. Final owner approval and production launch remain separate. |

Validation: integrated lint/types passed. Full tests ran outside sandbox after the documented Windows temporary-file error; three old expectations were updated for the intended /setup and automatic Competition FIRST behavior, and both affected files passed focused reruns. The new Parent lifecycle test passed separately. Final typecheck/build passed after the Home label/selector changes. Packaging dry-run completed successfully; only the external Wrangler log-file write was blocked by sandbox permissions. No deployment. No repeated whole-app review. Dev sync: third-bandicoot-18, October15 08:44:23. Temporary Parent phone viewport reset and original dark theme restored.

## Preserved second-round evidence

## Second-round corrections — October 14, 2026

All 13 requested corrections are implemented. Ready for the owner's next visual review; this is not visual approval or launch approval. Original G1–G7, approved PDF, prior receipts and completed evidence remain preserved.

| Item | Change | Main files (under src unless noted) | Verification |
| --- | --- | --- | --- |
| 1 | Exact scheduled/longest-visit time; one uninterrupted hour remains the rule. | DashboardReports.tsx; lib/attendance-display.ts | Live Student/Parent; boundary tests |
| 2 | Header measured on resize; account/report heading scroll margin follows its height. | AppShell.tsx; LiveApp.tsx; TeamReports.tsx; lib/sticky-header.ts; styles.css | Live desktop/phone focus; observer test; Astra |
| 3 | Preserved Coach OR Mentor with Travel Lead permission for signature requests, per later saved decision. | convex/permissions.test.ts | Server source; allow/deny regression; live Travel Lead; Astra |
| 4 | Home Money shows Balance due first. | DashboardReports.tsx | Live family pages; render test |
| 5 | Earned from fundraisers and Available fundraising credit name distinct values. | DashboardReports.tsx; lib/report-copy.ts; lib/family-copy.ts | Live; distinct-value render test |
| 6 | Event name appears once; canceled amount stays distinct from an actual return. | LiveApp.tsx | Live canceled fixture; Astra |
| 7 | Empty event heading omitted; charge details button has spacing. | LiveApp.tsx; FamilyDashboard.module.css | Live/source |
| 8 | Earlier signed form labeled by current coverage; Events this form covers heading. | PermissionWorkflow.tsx; lib/permission-workflow-copy.ts | Live earlier/current receipts; render tests; Astra |
| 9 | Field error directly below field, linked by aria-describedby; focus retained. | LiveApp.tsx; NewEvent.module.css | Live empty Basics; settled phone screenshot |
| 10 | No-event cells use dash; accurate complete/filtered/partial counts; Search students. | TeamReports.tsx; CoachRosterManagement.tsx | Live no-event report; pagination/filter tests |
| 11 | Disabled actions reference visible explanatory hints. | PermissionWorkflow.tsx | Live DOM association; source |
| 12 | Requested readiness, export, fundraising, bulk-payment and charge-matching copy. | features/design-review/readinessCopy.ts; lib/*copy.ts | Live/source; relevant render tests |
| 13 | Consistent Profile/Forms labels, single-day dates, Coach-only explanation, own-profile/travel wording, actual withdrawn fee outcome. | LiveApp.tsx; ProfileCorrections.tsx; Travel.tsx; WithdrawnEventFee.tsx; lib/*copy.ts; lib/withdrawn-fee-label.ts | Live canceled fee/nav/date; source pronouns; fee helper tests; Astra |

Validation: final `bun run check` passed lint, types, full tests and build. `bun run cloudflare:check` passed packaging dry-run; no deployment. Existing large-bundle advisory remains nonblocking. Astra reviewed consequential changes; its replacement-character finding was corrected and the changed source scanned clean. No backend production source, schema, PDF generator/template, financial calculation or Timeclock contract changed. No backend sync needed.

Synthetic render tests cover finance failure/partial commitment/retry, withdrawal processing/failure/reason-gated retry, attendance recalculation failure, held/failed fundraising, and Join/Waiting wrong-account Sign out. These prove rendered wording/control states, not live job transitions or click execution. Existing workflow and sign-out evidence remains valid.

### Current remaining review

| ID | Surface/state | Evidence retained | Remaining comparison / dependency |
| --- | --- | --- | --- |
| R2-owner | Corrected pages, all roles | Live desktop 1440 CSS px and phone 390 CSS px in light/dark: Student/Parent Home, Money, Attendance; Parent receipts; Coach account, report, empty Basics, Readiness; Travel permissions. DOM observations saved privately. Representative settled screenshots inspected. | Owner visual review. Capture timing/scaling made some matrix images stale or distorted; those are rejected, not full screenshot proof for every combination. Use the live app for the remaining visual comparison, especially lower receipt/export sections. No application failure observed in these checks. |
| R2-deferred | CSV column units | Owner confirmed opened CSV; source unchanged this round. | Friendlier cents headings deferred by user until post-launch. |
| R2-launch | Production | Existing gate list retained. | Separate ownership/domain/sign-in, retention/privacy, backup/restore, monitoring/rollback, onboarding/demo transition and explicit deployment approval. |

Private evidence remains in private-data/visual-checks/round2 (not Git). Reliable representative captures include student-attendance-exact-time.jpg, coach-empty-basics-settled.jpg, coach-390-dark-account.jpg and parent-home-settled.jpg. Earlier full-page/incorrect-theme captures are not acceptance evidence. Temporary browser sizes reset; all four test windows restored to dark theme. No records, permissions, links or signatures changed.


## Earlier first-round checkpoint (historical)

> October 14 correction checkpoint: required corrections implemented; ready for another owner visual review. Parent presentation checked live after sign-in. Approved PDF and completed work preserved. See VISUAL_CHECKS.md for evidence and deferrals.

## Correction checkpoint - October 14

Required findings implemented; owner visual approval remains open. Sol implemented and Astra reviewed consequential privacy/status/interaction changes. Its three narrow follow-up findings are closed. No approved PDF generator/template, schema, financial calculation or Timeclock contract changed.

Validation: integrated lint/types passed. The full suite loaded outside the Windows sandbox after temporary-module ENOENT failures; behavior checks passed. Four files had stale finance-copy assertions; updated affected tests passed. Production build and packaging dry-run passed without deployment. Final display-only lint/type/build and focused presentation checks passed.

Live: Student Home leads with the incomplete parent profile task; Student Money shows safe history and Balance due first. Readiness shows Accepted for the existing signed fictional form. Empty New Event stays on Basics and focuses Name. Coach account and Travel report opening focus their headings. Report close falls back to page heading if a refreshed row replaced its trigger. Mentor report/profile inspected. Actual 390px Student Home inspected, then viewport reset. Prototype typography/navigation/card styling retained; earlier complementary light/desktop evidence reused.

Private images: correction-event-validation.jpg, correction-student-home-phone.jpg, correction-coach-account.jpg. Parent follow-up completed live after owner sign-in: incomplete setup/profile tasks appear first; profile required-field, insurance/physician and draft-versus-receipt wording inspected; Money shows Balance due first and safe history; existing accepted receipt and embedded PDF loaded, with hashes behind collapsed Verification details. Private evidence: correction-parent-receipt.jpg. No edits, relinking, grants or signing.

### External report disposition

Every report ID is listed. Corrected does not mean every optional redesign suggestion was adopted.

| Finding | Disposition | Detail |
| --- | --- | --- |
| A1 | Corrected | Home/Money consistent; short mobile Profile/Forms labels intentional. |
| A2 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| A3 | Corrected | Addressed in this bounded pass. |
| A4 | Corrected | Addressed in this bounded pass. |
| A5 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| A6 | Corrected | Addressed in this bounded pass. |
| A7 | Corrected | Addressed in this bounded pass. |
| A8 | Corrected | Open and cancelled sessions explained separately; no calculation change. |
| A9 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| A10 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| A11 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| A12 | Corrected | Addressed in this bounded pass. |
| A13 | Corrected | Addressed in this bounded pass. |
| A14 | Corrected | Addressed in this bounded pass. |
| S1 | Corrected | Addressed in this bounded pass. |
| S2 | Corrected | Addressed in this bounded pass. |
| S3 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| S4 | Corrected | Addressed in this bounded pass. |
| S5 | Corrected | Addressed in this bounded pass. |
| S6 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| S7 | Corrected | Addressed in this bounded pass. |
| S8 | Corrected | Addressed in this bounded pass. |
| S9 | Retained/reconciled | Seven-day expiry matches later requirements and server. |
| S10 | Retained/reconciled | Existing clear invitation instructions retained. |
| P1 | Corrected | Addressed in this bounded pass. |
| P2 | Corrected | Addressed in this bounded pass. |
| P3 | Corrected | Selected-child aria-pressed added; layout redesign deferred. |
| P4 | Corrected | Prepared drafts distinguished from immutable signed receipts. |
| P5 | Corrected | Addressed in this bounded pass. |
| P6 | Corrected | Availability meaning preserved; unavailable is not refusal. |
| P7 | Corrected | Addressed in this bounded pass. |
| P8 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| P9 | Corrected | Addressed in this bounded pass. |
| P10 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| P11 | Corrected | Addressed in this bounded pass. |
| P12 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| P13 | Corrected | Addressed in this bounded pass. |
| P14 | Corrected | Addressed in this bounded pass. |
| P15 | Corrected | Addressed in this bounded pass. |
| P16 | Retained/reconciled | Known verbose fixture overflows; ordinary approved form remains one page. |
| P17 | Corrected | Balance first; safe history. No unconfirmed payment instructions added. |
| C1 | Corrected | Addressed in this bounded pass. |
| C2 | Corrected | Addressed in this bounded pass. |
| C3 | Corrected | Addressed in this bounded pass. |
| C4 | Corrected | Addressed in this bounded pass. |
| C5 | Corrected | Addressed in this bounded pass. |
| C6 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C7 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C8 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C9 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C10 | Corrected | Addressed in this bounded pass. |
| C11 | Corrected | Addressed in this bounded pass. |
| C12 | Corrected | Addressed in this bounded pass. |
| C13 | Corrected | Addressed in this bounded pass. |
| C14 | Corrected | Addressed in this bounded pass. |
| C15 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C16 | Corrected | Accessible checkbox names added; optional layout unchanged. |
| C17 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C18 | Optional follow-up | Profile completion clarified; optional note simplification deferred. |
| C19 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C20 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C21 | Optional follow-up | Event permission context clarified; further record redesign deferred. |
| C22 | Corrected | Addressed in this bounded pass. |
| C23 | Corrected | Addressed in this bounded pass. |
| C24 | Corrected | Addressed in this bounded pass. |
| C25 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C26 | Corrected | Short name plus stable-identifier help; historical keys unchanged. |
| C27 | Optional follow-up | No-students room empty state fixed; other optional layout changes deferred. |
| C28 | Corrected | Authoritative Accepted/Missing/Not required status; general unknown-dash caution retained. |
| C29 | Corrected | Addressed in this bounded pass. |
| C30 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C31 | Corrected | Purpose and JSON format explicit; existing PDF preserved. New export format deferred. |
| C32 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C33 | Corrected | Addressed in this bounded pass. |
| C34 | Corrected | Addressed in this bounded pass. |
| C35 | Corrected | Addressed in this bounded pass. |
| C36 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C37 | Corrected | Addressed in this bounded pass. |
| C38 | Corrected | Addressed in this bounded pass. |
| C39 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| C40 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| T1 | Corrected | Addressed in this bounded pass. |
| T2 | Corrected | Addressed in this bounded pass. |
| T3 | Corrected | Prerequisite hints; later contract permits Coach and Travel Lead re-sign requests. |
| T4 | Optional follow-up | Existing read-only access retained; no student-record access expansion. |
| T5 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| T6 | Optional follow-up | Optional polish deferred; preserve current functionality and scope. |
| T7 | Retained/reconciled | Existing clear own-profile wording retained. |

### Source-only findings

- Charge, finance, fundraiser, withdrawal and season processing codes mapped; partial/held/failed states remain distinct from completion.
- Attendance correction kinds labeled; internal recorder IDs removed from ordinary presentation.
- Fee, charge and historical-finance help simplified without changing safeguards.
- Medication Choices remains in explicitly earlier-version receipt rendering and unused historical helpers/copy, not active V2 signing/correction choices. Obsolete season reset wording removed; approved first aid preserved.
- Invitation ellipses and Parent access error fixed. Payment method labels capitalized. Touched retry forms explain eight-character minimum.
- Waitlist/withdrawal actions clarified. Development-only review-shell money format retained outside production UI.

CSV cents headings remain owner-deferred. Production launch and visual approval are separate open gates.


# Current visual review disposition — October 14, 2026

This section supersedes the dated queue below. VC-001–021 are sufficiently reviewed for the representative visual-review candidate under the user's focused-verification policy and consolidated Astra review. VC-022, actual Coach visual approval, remains open. This is not a claim of pixel parity or every conditional state/device combination.

## Page-by-page production-language review

| Pages / roles | Review outcome and evidence scope |
| --- | --- |
| Entry, Google sign-in, join, invitation and access states | Source copy reviewed; previous setup/invitation/error evidence retained. Production-built sign-in inspected; review query cannot open development fixtures. Conditional access states were not artificially forced. |
| Shared shell, navigation, global recovery | Retained responsive/theme/keyboard observations; unavailable route and service copy reviewed. Development banner is conditional and remains truthful in development. |
| Student setup, Profile & health, Parents | Live required setup/correction and lower-page controls reviewed; profile and linking copy reviewed. Locked room correction behavior preserved. |
| Parent child selection, Status, profile | Live child context and incomplete-profile gate reviewed; prior switching/attendance evidence retained. No-linked Parent source and link-isolation tests reused, not live observed. |
| Student Status and Mentor report/profile | Live current-season views, ordinary Mentor navigation/profile and limited report reviewed. No richer unsupported fields added. |
| Events list/detail and six-step creation | Current-season fictional creation inspected across all six steps; loaded detail, lower requirements/transport/settings and signup evidence retained. |
| Readiness overview/detail/print | Accurate coverage and Draft copy reviewed. Actual Chrome print inspected: white pages, 14mm margins and no app controls. |
| Rooming Student/adult | Live group/deadline, withdrawn scoped recovery and adult empty-group review inspected. Recipient invitation/acceptance relies on existing tests/source. |
| Drivers and transportation | Live ownership/unavailable driver presentation plus retained assignment evidence reviewed. |
| Parent Forms and Coach Permissions | Approved PDF review/signature/receipt/acceptance completed; historical receipt retained. Prior correction, re-sign, paper and restricted-export evidence reused. PDF opened by user. |
| Family/Coach finance and fee administration | Live account/payment/history/withdrawal consequence reviewed plus retained imports/transfers/corrections/exports. Raw priority rank replaced with display position; sorting/money unchanged. |
| Fundraising | Live empty/create controls reviewed; prior allocation/transfer evidence retained. |
| Family/Coach attendance | Live unavailable kickoff, legacy/session and Coach controls reviewed; prior loaded totals/child switch/correction evidence retained. |
| Reports and individual report/CSV | Live Travel and retained Coach phone/desktop views reviewed. Internal state codes replaced; combined balance correctly labeled Available funds. User confirmed CSV downloads and opens. |
| Coach roster and student record | Live linked status, profile, finance and attendance summary reviewed; retained phone/desktop filter/recovery/lifecycle evidence. |
| Users & Roles | Ordinary Mentor invitation/profile and separate finance/health grant/revocation reviewed; original permissions restored. |
| Season/history/retention | Live transition/history list and retention/hold summary reviewed; retained complete transition and supported correction/hold/release evidence. Destructive deletion stays gated. |
| Settings | Coach family-link preparation and Mentor settings reviewed; appearance/account copy preserved. |
| Timeclock | Corresponding editorial pass coordinated with its owner; frontend-only follow-up remains on its separate branch. No shared contract change. |

## Final delivery and differences

User confirmed PDF opened and CSV opened with readable rows/columns. User explicitly deferred friendlier CSV money headings/units (Charged cents, Paid cents) until after launch; existing cents contract remains accurate. Record this as a follow-up, not a release blocker.

Normal reviewed/signed PDF examples retain original logo and one-page layout. The verbose live fictional fixture legitimately uses a continuation; signature/date remain in original first-page fields. Approved wording is settled.

Unknown future kickoff and incomplete summaries retain truthful unavailable/Draft states. No convenience account creation, unlinking or extra grants were used to fill screenshots. Existing recipient-invitation and Parent-isolation test coverage is reused; these two live-state limits are explicit.

Integrated lint/types/tests/build passed at the completion milestone. Final label-only follow-up passed scoped lint/CSV tests and type/build; packaging dry-run completed with no upload (external log write restricted by sandbox). Consolidated Astra review found no blockers. Final publication is verified separately by the integration owner.

## Historical queue and dated evidence

The following entries retain what was known at their date. Older pending/paused claims do not reopen completed work; use the disposition above and CURRENT_STATE.md.

# Current visual checks

Updated October 13, 2026. This is the single outstanding visual queue. Keep stable IDs and retain the dated evidence in [FRONTEND_CONFORMANCE_LOG.md](FRONTEND_CONFORMANCE_LOG.md). [CURRENT_STATE.md](CURRENT_STATE.md) and [DEVELOPMENT_CHECKLIST.md](DEVELOPMENT_CHECKLIST.md) describe current implementation and live acceptance; the [design drift report](../design-drift-report.md) is a historical baseline.

**Current Coach policy:** use representative phone/desktop and light/dark comparisons across changed workflows. Do not multiply every state by all four combinations. Expand for an observed layout, accessibility or functional risk; preserve essential privacy, financial and record checks. Existing valid comparisons remain evidence and do not need recapture merely to fill a matrix.

Reference sizes are phone390×844 and desktop1440×1000; recorded document widths can differ because of scrollbars. Record actual dimensions and inspect the image. Scaled, stale, blank, distorted or wrong-theme captures do not establish acceptance. In historical follow-up captures, only individually reviewed verified images count. Screenshots, account identities and record-specific evidence stay outside Git; all rehearsal data is synthetic.

VC-006 is complete for representative Coach Finance presentation after Astra reconciliation. Other rows are partial/open as stated; completed substeps retain their evidence. Implementation, live behavior, source review and prototype comparison are separate claims. The October13 published checkpoints through `e62b3ef` supersede older assertions that payment, reporting, season or supported historical corrections await implementation. Missing authorized role states remain access prerequisites, not evidence of a missing backend.

| ID | Role / surface / state | Existing evidence | Representative remaining check | Dependency / current status |
| --- | --- | --- | --- | --- |
| VC-001 | Coach / Readiness / populated projections | Representative four-combination Readiness review and Coach approval; shared shell retained. Requirements, transport/rooms and supported permission/financial projections are implemented. | Compare materially new populated detail/export presentation and a representative conditional state with the reference. | Preserve approved Readiness evidence. New detail presentation remains open; no blanket missing-projection blocker. |
| VC-002 | COMPLETE — Coach / New Event / six steps | Prior desktop/Basics and successful WholeTeam creation plus all-step navigation and newer phone Costs/Requirements/Travel/Review validation retained. | Representative scope complete per Astra milestone audit. | No repeat creation or full theme matrix required. |
| VC-003 | Coach / New Event / Whole Team | Published durable Whole Team creation verified with all active fictional members. Later reactivation restored active count4→5 and added the member exactly once to an upcoming zero-fee Whole Team event. Astra closed G3 functional acceptance using this live evidence and existing coverage. | Compare enabled choice/explanation and representative provisioning/retry presentation on supported event/readiness/room surfaces. | Visual scope remains in G1/G2; do not reopen the completed G3 functional rehearsal or repeat the same reactivation. |
| VC-004 | COMPLETE — Coach / Event workspace / lower sections | Existing desktop sections and newer phone requirements/transport/lower controls, seat shortage and disabled assignment inspected. | Representative scope complete per Astra milestone audit. | Do not manufacture every conditional state. Distinct room/withdrawal journeys stay VC-015/016. |
| VC-005 | COMPLETE — Coach / Drivers / Add/Edit | Prior list/form/Save/Cancel size/theme evidence retained. October13 empty name submission focused the invalid required field; a clearly synthetic unapproved driver saved and its phone-dark result was compared with hosted Drivers. It remained unavailable and absent from event approved-driver choices. | Representative validation/save-result scope complete; see dated conformance evidence. | Synthetic unapproved record retained in development, unassigned. No driver approval or real transport action. |
| VC-006 | COMPLETE — Coach / Finance / payment, payout, transfer and import | Source-separated primary table/actions restored and connected. Live payment, charge reduction/cancellation, team transfer, CSV cent import and zero-effective receipt correction reconcile; held fundraising preview blocks posting. Wide-dark payment/import presentation inspected. | Complete: phone-light payment/import/totals/export/history and desktop-light account/payout/transfer controls supplement existing desktop-dark and live result evidence. | Astra closed this representative presentation scope October13. Independent Travel grants/revocation remain VC-018/G5; no repeat financial submissions needed. |
| VC-007 | COMPLETE — Coach / Finance and Team roster / overview | Complementary roster/record/archive, Finance overview/account/history and lower-control evidence retained. | Representative scope complete per Astra milestone audit. | Account-permission behavior remains separate; no layout recapture needed. |
| VC-008 | Student / Status / conditional states | Loaded cards/navigation/type reviewed at both sizes/themes. Genuine financial and attendance projections are implemented and synchronized. | Compare representative empty/setup/loading/error presentation and current-source financial metadata, avoiding repeat captures of unchanged loaded cards. | Supported projections exist; conditional visual/role evidence remains open. |
| VC-009 | Student / Finances and Parents / lower rows | Loaded themes reviewed after wrong-theme replacements; valid Parents desktop light recorded. Earlier malformed desktop captures remain rejected. | Inspect remaining lower/conditional content and obtain a valid complementary desktop Parents comparison where prior evidence is insufficient. | Capture limitations remain; they do not prove a current layout defect. |
| VC-010 | Student / Profile and health / setup and correction | Existing profile desktop/phone presentation reviewed, including lower Save. Required setup, room-category lock, guardian/contact fields and scoped correction flows are implemented. | Compare representative required/setup, locked-category correction, ordinary edit and Parent medication/contact states with their actual allowed fields. | Relevant synthetic account/profile journeys and visual states remain open. Real medication consent still requires approved wording/products/policy. |
| VC-011 | Student and Parent / Events / participation and deadlines | Withdrawn labels/details and list projection correction recorded; prior family reference deep link was blank. | Compare representative participation/deadline/disabled states not already evidenced; use reference source if its deep link remains inaccessible. | Visual state coverage remains open; historical label defect is corrected. |
| VC-012 | Parent / child context / multiple or no children | Shared header/context and loaded pages reviewed at both sizes/themes. Root switched two fictional children and observed corresponding session totals; both relationships survived season activation. | Compare representative child-switcher/lower-page layout and the no-linked-child state. | Multiple-child behavior is verified within the recorded scope; no-linked Parent still needs an authorized state. Do not repeat successful switching solely for a matrix. |
| VC-013 | Student, Parent and Coach / invitations / variants and sharing | Parent Google invitation/linking has prior live evidence; sharing/accepted-confirmation copy implemented/source-reviewed; missing-token entry observed. | Compare representative valid/share/success and one meaningful expired/mismatch/conflict state; include adult invitation presentation with an authorized account. | Remaining current visual/access states open. Real QR rendering remains a separate dependency question; reference placeholder is not an encoder. |
| VC-014 | Parent and Coach / permission forms / receipt and exports | Synthetic signing, acceptance, correction/resubmission, preserved original receipt, re-sign request, paper recording/acceptance and manifest versus health export are live-verified. Existing unsigned/context comparisons retained. | October14 V2 gate, structured profile, populated PDF, checkbox/typed signature, saved receipt and Coach acceptance live-verified. Desktop PDF and phone light receipt layout inspected without horizontal overflow. Manual blob download/device PDF check and Coach visual approval remain. Prior v1 evidence remains historical. | Do not repeat accepted signing/paper/export happy paths. Real signing remains gated by approved field-trip/first-aid wording and district medication policy; active Medication Choices is removed. |
| VC-015 | Coach / Attendance and withdrawals / corrections and decisions | Empty/unselected presentation retained. Historical attendance replacement saved live under timed Coach access: original/earlier correction visible, duplicate submission disabled, then returned to read-only. | Compare representative loaded evidence/correction layout and paid-withdrawal fee-return/cancellation presentation against the reference. | Supported correction workflow exists and live rehearsal is complete; remaining visual and paid-withdrawal scope stay open. |
| VC-016 | Student and authorized adults / rooming / invitations and deadlines | Scoped room retry boundary implemented; occupied/finalized adult slice reviewed. Historical withdrawn route caused a whole-app error. | No-room-selection event now shows scoped recovery and Return to event works. Still reobserve the distinct withdrawn-student case and compare active invitation/deadline/adult review states. | Authorized conditional states still needed. Diagnose the old failure only if it persists; do not treat it as a newly observed defect. |
| VC-017 | Student and Parent / Attendance / phases, totals and sessions | Family metric/context hierarchy compared with rendered phone light/dark and desktop dark references; live desktop light and lower dark slice inspected. Kickoff/Build/Outreach reporting is published and synchronized. After four-session rebuild, Parent cards loaded at2:56PM without updating/retry; switching children changed session totals. New empty season shows truthful unverified2028kickoff unavailable after readiness repair. | Compare representative new phase/weekday/Saturday/Outreach and unknown-kickoff/empty presentation with the reference; inspect remaining lower/error content. | Reporting contracts are implemented. A stale desktop-light reference and clipped/scaled captures remain rejected. No full G4 or visual closure follows from scoped readiness evidence. |
| VC-018 | Travel Lead / role-specific routes / grants and operations | Existing session confirmed limited navigation, read-only finance and selected transport operation; phone Readiness behavior observed. Screenshot timed out; top/bottom slices omit intermediate content. | Representative authorized Travel Lead route/lower-control pass, including independent finance/health grant and revocation presentation where authorized. | Retain existing role behavior evidence; remaining role/grant and visual scope open. |
| VC-019 | Ordinary Mentor / navigation, report and own profile | Historical ordinary-Mentor navigation before that account gained Travel Lead; current own-profile and report surfaces implemented. | With the authorized Mentor-only Google session, compare restricted navigation, own profile and available report/empty states on representative sizes/themes. | Mentor-only sign-in/identity/role evidence remains the prerequisite. Do not grant privileges merely for screenshots or claim unsupported richer fields. |
| VC-020 | All roles / entry, access, shell and query states | Shared shell/tokens/copy and historical limited keyboard observations retained. Setup/room lock, correction and archive/reactivate controls now implemented. | Representative pending/rejected/archived/setup and query-error states; observe More/menu focus/dismissal and key dialog recovery separately from full accessibility acceptance. | Remaining conditional/keyboard evidence open. Preserve corrected overflow/navigation/control evidence; no exhaustive state×viewport requirement. |
| VC-021 | Coach and permitted roles / administration and history | Accounts/profile, Fundraising, fees/retention, payments/import/export, six-step Season and supported historical roster/attendance/charge corrections are implemented and reviewed. Synthetic season activated with preserved IDs/balances/Parent links; roster archive/reactivate and historical roster/attendance edits exercised live. | Representative complete admin/history, reason/conflict/recovery and retention hold/release comparisons; inspect role restrictions and remaining supported charge-correction result. | Missing implementation/sync is no longer the blanket blocker. Remaining live/visual scope and account lifecycle are separate; linked historical finance stays deliberately held. |
| VC-022 | Coach / final broader visual acceptance | Representative Readiness approved; later source reviews and scoped live/visual evidence retained. | Review the completed representative queue, intentional differences and unresolved access/evidence limits with Coach. | Final user visual acceptance remains pending. This reconciliation does not close unverified rows or claim whole-app pixel parity. |

Historical matrices in the conformance log describe the sizes/themes actually inspected, not current exhaustive requirements. New live/source evidence through `e62b3ef` supersedes old missing-backend and pending-activation claims only within its verified scope. Representative phone/prototype checks remain for roster lifecycle and new administrative views; retention hold/release and other unobserved journeys remain open. Keep functional proof, screenshots, DOM observations and final user approval distinct.

October13 representative adult-management update: valid phone dark and desktop light observations, lower controls and disabled access dialog/Escape focus return recorded in FRONTEND_CONFORMANCE_LOG. Hosted prototype is accessible but version reconciliation against immutable reference remains pending. This narrows the adult-management presentation gap without closing acceptance/grant/revocation or broad VC-018/021. No new backend requirement identified.

October13 user clarification: https://denhamvenom.github.io/student_status/ is the selected visual reference. Preserve all later-added functionality and decisions; adapt their presentation to its design language. Hosted/preserved version differences do not block visual work and must not trigger feature removal. This supersedes the provisional-reference dependency above.

VC-006/007 narrowed: valid phone-light Finance card and payment-dialog evidence now exists; mobile payment CTA mismatch corrected and reobserved, Astra cleared. Other lower import/account/sidebar states remain within the existing queue. No backend change required.

VC-006/007 lower-phone evidence: CSV entry/review controls, source totals, export scope and stacked history now visually inspected at390 light with valid screenshots; prior distorted captures are not used. Remaining work is account-detail/fee-sidebar presentation and relevant role boundaries, not repeating completed import/correction/export transactions.

October13 Coach roster milestone: VC-007 roster/student-record representative desktop-dark and phone-light presentation is verified after correcting mobile column collision, desktop select width and dark event-text contrast. Record/filter/back/error recovery and archive disabled/Escape focus were observed without repeating mutations. See FRONTEND_CONFORMANCE_LOG milestone; retain historical finance evidence. VC-007 broader finance/sidebar scope and remaining visual queue are not implicitly closed.

October13 Reports milestone: Coach desktop-dark and phone-light report/filter/individual presentation now inspected; desktop metric wrapping fixed and reobserved. Truthful unknown attendance/Draft states retained. CSV file-delivery and live Travel presentation remain open. See conformance log for exact evidence/limitations. VC-002 remaining step content now has phone-dark Travel/room deadline and final Review validation evidence, supplementing prior desktop/Basics/navigation/create evidence; no creation repeated.

October13 Parent batch narrows VC-010/012/014/017/020: current-season permission disabled/empty presentation desktop-dark; unknown-kickoff and empty attendance lower content phone-light; lower profile/correction controls; More keyboard dismissal with focus return. Retained prior loaded/signing evidence is not repeated. Current Parent cannot access prior-season receipts by explicit policy, not an implementation defect. See conformance log. Student/Mentor/grant and no-linked Parent states remain open.

## October 14 - production-language acceptance

Required before final Coach visual approval: complete the page-by-page checklist in DEVELOPMENT_CHECKLIST.md against the actual route/menu inventory. Record page/role, visible-copy changes, relevant dialog/state/download coverage, and unresolved items here. Review each page once, reuse existing behavior evidence, and do not expand to a full device/theme matrix. Production UI and documents must contain no development/demo/synthetic/fake-data/rehearsal placeholders or internal notes. Preserve honest labels on development records and retained test evidence; never relabel synthetic data as real. The goal remains paused; this entry adds the requirement, not implementation or deployment authorization.

## October 14 pause checkpoint

Original-layout PDF source/backend integration and focused/integrated validation are complete; source/blank-template review cleared. Live selection and Parent signature on the new template remain next. Prior approved one-page form/language approval is settled and must not be requested again. Readiness browser PDF verified white margins and Draft/missing-seat content. Ordinary Mentor acceptance/profile/report, Student setup/locked correction, Travel Reports, and independent temporary grants/revocation completed; both grants restored off. Screenshots and generated PDFs remain private. Page-by-page production-language pass remains open; raw enum labels and missing-backend wording were identified for the next finite copy batch. User paused at this safe checkpoint; source remains local and uncommitted.

## October 14 live approved-template workflow

Approved template selected. Existing complete fictional profile prepared the original-layout PDF; initially unchecked acknowledgment and typed synthetic signature submitted, Coach accepted, and Parent event coverage updated. Earlier receipt remained present. Signature/date visually occupy original first-page fields. Long explicit rehearsal labels overflowed three small health cells into a lossless continuation; this is distinct from retained passing one-page ordinary-length renders. Private screenshot: approved-pdf-signed-live.jpg. No real consent, profile alteration or data truncation. Manual download remains pending. Reuse prior focused/integrated/Astra evidence; no repeat full consent suite.

October16 polish evidence supplement: refreshed preview render checks pass; Mentor phone390 and verified Competition desktop1440 inspected. FIRST links are block with6px top margin for all three states. Parent summary/orientation and verified check confirmed in DOM. See FRONTEND_CONFORMANCE_LOG and private-data/visual-checks/final-targeted/polish-*.png.

FIRST followup visual evidence: refreshed preview includes Parent and adult reopened examples, initial state absence assertions pass. Parent phone390 capture inspected; see FRONTEND_CONFORMANCE_LOG. Item5 no longer deferred.


### FEE-REVIEW-2026-10-19 — Coach charge details

Frontend wording and rendered-markup regression checks complete. Pending: authenticated new-charge, held and partial-release layouts at representative phone/desktop sizes and light/dark themes; Coach acceptance. No production records may be changed to manufacture evidence. See FRONTEND_CONFORMANCE_LOG.md October 19 entry.

## Bulk Invite local candidate

| Check | Evidence / remaining work |
|---|---|
| BULK-1 Coach component | 1440 light/390 dark actual component with mocked hooks inspected; template/upload/confirmation/download passed. Live development Join Requests navigation and real Google redemption remain unobserved. See BULK_INVITE.md. |

October 19 approval revision: isolated actual-component Coach queue reviewed at 1440px light and 390px dark; identity/email/actions legible, no phone overflow. Live integrated backend/Google check remains deferred; no backend sync authorized.
