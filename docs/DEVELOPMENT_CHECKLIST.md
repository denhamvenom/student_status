# Student Status Development Checklist

## October 21 - Event display release verified

PR33 released as v0.1.0-onboarding.13. Public production assets match the approved build and Worker rollout is 100%. Earlier pending-release statements for this scope are superseded. See RELEASE_2026-10-21_EVENT_DISPLAY.md for verification limits and rollback.

## October 21 - Student event times and Pay link (development candidate)

- [x] Dashboard, event list and details show Central start/end times; Calendar all-day dates are preserved.
- [x] Pay Now uses the established gold button with readable dark text and keyboard focus.
- [x] 630 tests, source lint, types/build, independent Astra review and representative phone/dark + desktop/light browser checks passed.
- [x] Owner approved production release on October 21. See RELEASE_2026-10-21_EVENT_DISPLAY.md for rollout evidence and limitations.

## October 21 - Approved conservative test cleanup

- [x] Removed unused roster cancellation case; consolidated legacy consent without losing empty/event input coverage.
- [x] Strengthened selected UI/query, invalid balance and PDF assertions; added only adult privilege and parent travel ownership denial/no-change coverage; added AGENTS testing rule.
- [x] Independent review, typecheck and source lint. One full run: 628/629 passed; corrected PDF assertion then 5/5 targeted passed. See test-audit.md; no full rerun or production changes.

## October 21 - Optimizations released

- [x] PR31 merged, production backend and both websites deployed, live assets verified, and v0.1.0-onboarding.12 published. See RELEASE_2026-10-21_OPTIMIZATIONS.md for execution evidence and limitations. Earlier development-only restrictions for this scope are superseded by owner release approval.

## October 21 - Calendar cadence and fixed event roster (development only)

- [x] Calendar sync at 6 AM and 3 PM Chicago time, DST-aware, plus authenticated Refresh with pending and recovery states.
- [x] Roster snapshot daily while idle and once on event selection; names stay fixed throughout the selected event. Clock-in/out and device selection stay live.
- [x] Snapshot tests cover daily boundaries, event switching, midnight freeze, retry and stale responses; schedule tests cover DST and freshness.
- [x] Independent Astra review, source lint, strict types, both builds and all 628 integrated tests passed. Development backend synced; localhost manual refresh and cooldown exercised, phone/dark and desktop/light inspected.
- [x] Owner accepted development and authorized production release on October21. Execution evidence:RELEASE_2026-10-21_OPTIMIZATIONS.md and GitHub v0.1.0-onboarding.12 release notes.

No schema/index/dependency changes. Schedule attempts fall from 1,440 to two daily, plus manual refreshes; this is not a measured billing reduction. See [USAGE_OPTIMIZATION.md](USAGE_OPTIMIZATION.md).

## October 21 - Attendance and kiosk read optimization (development only)

- [x] Summary-only reports skip history, and full report pages share one live result.
- [x] Quiet report timers replaced with relevant boundary refreshes; open-session timing and live updates preserved.
- [x] Kiosk status reuses session reads and avoids redundant selected-history reads with validated active attendance.
- [x] Synthetic measured savings: quiet summary121→1 and report page242→1 argument sets/hour;100 active-selected kiosk bytes145,467→83,377 (42.7%).
- [x] Independent review, source lint, build and targeted/regression verification complete; timed-out suites passed on rerun. Existing randomized limiter test flake documented.
- [x] Synced only third-bandicoot-18. Real signed-in two-client clock-in/out and report updates/automatic closure verified on localhost; phone/dark and desktop/light checked.
- [x] Owner authorized release of all optimizations on October21; see v0.1.0-onboarding.12 release evidence.

No schema/index/dependency changes. See [USAGE_OPTIMIZATION.md](USAGE_OPTIMIZATION.md) for measurement limits and exact evidence.

## October 21 - Usage optimization (development only)

Boundary-driven roster refresh, stable Timeclock queries with local expiry, redundant backend-read removal and deferred authenticated JS are implemented and verified in development. Actual Timeclock simulation reduced 241 subscription argument sets to 1 per query per quiet hour; synthetic backend read bytes fell 53.0% for unready team reports and 13.5% for competition roster rows; initial sign-in JS fell 51.0%. These are workload measurements, not promised monthly billing savings. All 605 tests passed, source lint/both builds passed, independent review has no blockers, and development sync succeeded. See [USAGE_OPTIMIZATION.md](USAGE_OPTIMIZATION.md). Owner acceptance and production release remain pending.

## October 20 - Approved actionable error production release

Owner accepted the localhost preview and explicitly authorized production release of PR30. Reviewed implementation 67c2145 preserves expected backend validation and recovery errors across Student Status while keeping internal diagnostics private. See [RELEASE_2026-10-20_ACTIONABLE_ERRORS.md](RELEASE_2026-10-20_ACTIONABLE_ERRORS.md) for validation and release boundaries. Earlier development-only restrictions for this change are superseded by this approval.

## October 20 - Actionable errors (development review ready)

Implemented shared user-facing errors across Student Status, explicit backend validation/recovery messages, invitation cooldown guidance, and private fallbacks for internal diagnostics. Independent review has no blockers. Development sync, lint/typecheck/build, focused tests and eight actual-component browser scenarios passed. Broad regression's two failures were corrected and their files rerun successfully; the historical >500-charge fee test remains a documented timeout. See [ACTIONABLE_ERRORS.md](ACTIONABLE_ERRORS.md) for exact evidence and localhost links. Owner localhost acceptance and production authorization remain pending; production unchanged.

## October 20 - Approved contact formatting production release

Owner authorized publishing reviewed fdabbe3. Production backend amicable-eel-413 deployed successfully with schema/type validation and no index deletion. Phone/email formatting and validation cover live input and backend paths; optional blanks, unchanged legacy values and signed records are preserved. Documentation publishes with source. See RELEASE_2026-10-20_CONTACT_FORMATS.md. Earlier development-only statements for this feature are superseded.


## October 20 - Contact input formatting (development)

Phone/email entries now use shared formatting and validation across profiles, setup, driver contacts, invitations, paper signer fields and payment CSV matching, enforced on backend entry too. US phones display as (555) 123-4567; email is trimmed/lowercased and structurally checked. Optional blanks remain optional, unchanged legacy contacts preserved, signed evidence untouched. 84 backend/helper and two payment CSV tests covered; desktop/phone input and wizard browser checks passed with independent source review. See CONTACT_INPUT_FORMATS.md. Development only; no production release authorized.


## October 20 - Approved Mentor landing and fundraiser production release

Owner accepted the localhost changes and authorized production publication. Reviewed source f075087 deployed to production amicable-eel-413 with backend typecheck/schema validation and no deleted indexes. Includes Mentor Profile landing, fundraiser CSV workflow, family Pay/Share, and Coach/Travel connection status. Documentation publishes with source. See RELEASE_2026-10-20_FUNDRAISERS.md for evidence and release boundaries. Earlier development-only statements for these features are superseded.


## October 20 - Fundraiser CSV and roster status (development)

Replaced the long Money tools link list with Download current CSV and Upload fundraiser CSV. Export includes names, stable IDs, revisions and existing links. Review shows canonical names and connection/update/removal counts; Coach applies one atomic batch of up to 500 rows. Blank links remove; omitted students remain unchanged. Stale, duplicate, unauthorized or invalid rows reject the batch. Coach/Travel rosters and team reports (including CSV) show Fundraiser Link as Connected/Disconnected, without exposing URLs in Travel projections.

25 focused tests passed; independent source review found no blockers. Synthetic browser workflow passed export, removal review, apply, malformed-file rejection and desktop/light plus phone/dark layout checks. Phone screenshot inspected. No real student links, payments or invitations changed. See MENTOR_PROFILE_FUNDRAISERS.md. Production unchanged.

## October 20 - Mentor Profile and individual fundraiser links (development)

Implemented Mentor Profile as the landing page, retaining Report and Settings. Coaches manage individual student Zeffy links in Money tools. Students and linked parents see Pay Now with a payment-card icon and Share on the selected student's Money page; both hide when no link exists. Desktop copies the URL; phones use native sharing when available, with copy/manual fallback.

11 focused tests passed. Independent source review found no blockers. Synthetic actual-component checks passed for Mentor landing/report navigation, Coach update/clear, family copy/no-link hiding, and desktop/light plus phone/dark layouts. Representative screenshots inspected; no horizontal overflow. Native phone share was tested through mocks, not a physical device. No real payment or fundraiser was created. Development backend third-bandicoot-18 synchronized; production is unchanged. See [feature details](MENTOR_PROFILE_FUNDRAISERS.md).

## October 20 - Staff setup production release

Owner accepted the localhost wizard and authorized release. Source280bc81 deployed successfully to production amicable-eel-413 with backend typecheck/schema validation and no deleted indexes. All personal items can be skipped; optional driving/trailer uses shared contact phone and existing approval rules. Temporary/permanent skip and later Profile editing remain available. Source and documentation publish together. See RELEASE_2026-10-20_STAFF_SETUP.md and release notes for exact merge/build evidence; older development-only statements below are superseded.


## October 20 - Staff setup with optional permanent skip (development)

Implemented a three-step basic-profile wizard for Coaches, Mentors and Travel Leads, including existing accounts with missing information. Full name, phone, shirt size and emergency contact prefill from saved data. Skip for now bypasses the current session; Don’t ask me again stores a permanent per-account preference across logins/seasons. Both can still edit Profile later, and Coaches now have a Profile entry. Student/parent setup remains unchanged. No driver approval or role grants occur during setup.

Focused backend tests, independent review and synthetic actual-component desktop/light and phone/dark browser checks passed. See [staff setup verification and release boundary](STAFF_SETUP_WIZARD.md) for final integrated checks. Development only; Coach acceptance and any production release remain pending.

## October 20 - Approved grade and roster production release

Coach reviewed and accepted the development roster and authorized production publication of both grade dropdowns and roster sorting, including documentation. Reviewed source 4f414df was successfully deployed to production Convex amicable-eel-413 with backend typecheck and schema validation; no indexes deleted. No bulk migration, record rewrite, email or environment changes were performed.

The release includes Freshman/Sophomore/Junior/Senior dropdowns with legacy-value preservation and conversion on normal save, plus full-roster last-name/grade/subteam sorting and visible grades. Signed permission snapshots remain unchanged. Validation: 556 tests/103 files, lint, application types/build, independent review and synthetic desktop/light and phone/dark component checks passed. Coach visual acceptance passed. Source and documentation publish together; exact merged revision and both automatic website build results will be recorded in the release notes. Earlier development-only restrictions below are superseded by this authorization.

## October 20 - Active Roster sorting (development)

Active Roster now sorts by last name, grade or subteam in either direction and displays grade beside the full student name and subteam. Sorting and search cover the complete current-season directory before showing 20 detailed rows per page. Existing connection, archive, Travel Team and readiness/balance filters remain. Missing grades show Not provided; unknown legacy grades remain visible. Stored surnames take precedence over the older-name fallback.

Validation: 556 tests across 103 files passed; lint, application types/build and independent review passed. Actual roster component with synthetic mocked data passed desktop1440/light and phone390/dark checks, including later-page sorting/search, quick filters, pagination and visible grades. Development third-bandicoot-18 sync and backend typecheck passed. No records were migrated or rewritten. Production remains unchanged. Live Coach acceptance remains pending. See [roster behavior and evidence](ROSTER_SORTING.md).

## October 20 - Grade dropdown (local development)

Student and parent setup plus the parent health/contact profile now use Freshman, Sophomore, Junior and Senior. Recognized earlier values display canonically and convert on normal save; unknown values remain selectable unchanged. Existing confirmed profile spelling may remain until parent reconfirmation, and signed snapshots are untouched. No bulk migration or production data change.

Validation:552 tests/102 files passed, focused tests/types/lint and independent review passed. Shared dropdown browser checks passed at desktop/light and phone/dark. Application build and development third-bandicoot-18 synchronization passed, including backend typecheck. See [behavior and evidence](STUDENT_GRADE_DROPDOWN.md). Production release is not authorized for this change.


## October 20 - Mentor/Staff invitation email production release

Owner authorized production publication, including documentation. Reviewed source78dd107 deployed successfully to production Convex amicable-eel-413 with backend typecheck/schema validation and the additive adultInvitations email/date index; no indexes deleted. No migrations, record edits, environment changes, real test invitations or emails were performed. Production email sender/reply/origin and enabled setting were verified; development sending stays disabled.

Coach invitations now queue private email links with delivery statuses and guarded one-hour resend. Google or email-code sign-in and explicit invitation acceptance remain. Old invitations are not automatically emailed. Parent workflows and student Google login are preserved.

Evidence:535 tests/101 files, focused31 account/mail checks, lint/types/build and independent review passed on the unchanged implementation. Synthetic actual-component desktop/light and phone/dark checks passed. Source, workflow, plan, checklist and verification documentation are included in the release PR. Exact main revision and both automatic Cloudflare build outcomes are recorded on the release PR and immutable release notes after publication. Real-inbox delivery/acceptance remains unverified.


## Private parent sign-in production release - October 19

Owner authorized production publication of the combined parent sign-in and legal-name/Money work. Source 15f2dcc deployed successfully to Convex production amicable-eel-413 with backend typecheck, schema validation and additive indexes; no indexes deleted. Production sender/reply/origin and existing auth credentials were verified without exposing or changing secrets. Production email remains enabled; development sending stays disabled. Calendar write guard is preserved.

Validation: all 509 tests in 99 files passed, lint and application/backend types passed, Student Status and Timeclock builds passed. Independent auth review and synthetic actual-component desktop/light and phone/dark checks passed. Local Coach Money showed full legal names and scrolling. No real invitation, email, Calendar event or financial write was created during release checks. Real-inbox end-to-end private sign-in remains unverified.

The release PR publishes all source and documentation together; exact main revision and both automatic website build outcomes will be recorded in its release evidence. The previous Share/Copy workflow is superseded by inbox-only parent sign-in, explicit Continue and separate relationship attestation; student Google login and one-hour resend remain. Legacy invitations cannot become login credentials. See [current parent workflow](PRIVATE_PARENT_SIGN_IN.md).

Rollback: use a coordinated code fix or rollback of both frontend/backend. Do not delete new parent auth records or indexes; these may hold live accounts after release. Disabling PARENT_INVITE_EMAIL_ENABLED stops new mail and new invitations but does not revoke existing sessions or already-sent links. Do not overwrite later shared releases.


## October 19 private parent sign-in: development verified

Implemented inbox-only parent sign-in links, removed student Share/Copy, preserved one-hour invitation resend and student Google login. Parent login still requires separate relationship/authority confirmation. Returning parents and expired private links support six-digit email codes. Integrated Calendar main b1f730a and reviewed legal-name/Money checkpoint 2bd052a without source conflicts.

Combined verification: 99 test files / 509 tests passed with one worker; lint, frontend/backend types and application build passed. Independent authentication review found no unresolved blockers. Actual React components with mocked Convex/Auth passed explicit Continue, failed-link OTP fallback, separate attestation and student resend checks; 1440px light and 390px dark screenshots have no overflow. These checks did not send real emails or prove a real-inbox end-to-end round trip.

Development third-bandicoot-18 synchronized successfully with backend typecheck/schema validation. Development email remains disabled; Calendar write guard remains production-only. No production deploy, main merge, real invitation, or financial write. Other chat confirmed signed-in local Coach Money layout; combined backend now provides legal-first labels. Real-inbox/browser rehearsal remains pending before production release.


## Private parent email sign-in — local work

Owner-approved local replacement for student Share/Copy: private inbox-only first sign-in, one-hour resend, parent email-code recovery/returning login, and unchanged student Google sign-in. Implementation and synthetic verification are complete; see the current evidence above. Production still runs the previous shared-link feature. See [design, boundaries and checks](PRIVATE_PARENT_SIGN_IN.md). Coordinate Calendar/main and the parallel name/Money fix before shared development sync.

## October 19 legal student names and Money scrolling

Student lists and financial/report projections now prefer the stored full legal name, with preferred name only as a fallback. Preferred-name editing and immutable signed records are preserved. Money uses the full content width; its focusable table scrolls vertically and horizontally with sticky column headings. Phone account cards remain available.

Verification: focused backend tests and source review passed. Actual Money component with fictional rows checked at desktop/light, narrower desktop with keyboard scrolling, and phone/dark; no page-width overflow. No payment writes or production deployment. Parent-login chat owns the coordinated development sync and overlapping SetupWizard/Mentor/permission-export labels. The other chat confirmed the signed-in local Coach Money layout; legal-name backend changes are included in the combined development sync.


## Linked Calendar workflow

- [x] Event creation/linking, Media Support Requested, linked editing and recovery.
- [x] Cancellation and permission safeguards, source review, automated checks and representative synthetic UI checks.
- [x] Development sync and read-only Calendar lookup; editor sharing verified.
- [x] Development Calendar writes explicitly prohibited and blocked in code.
- [x] Authorized production backend deployment/enablement; read-only production authentication and writer access verified.
- [x] Release documentation included in PR21; exact website build outcomes tracked in the PR.
- [ ] Real-event end-to-end verification (no test Calendar entries created).

See [workflow evidence](EVENT_CALENDAR_SYNC.md).

## Bulk Payment full-name correction - October 19

Owner explicitly authorized the production correction. Export and payment review now use the full student legal name, preserving last names when a preferred name is only a first name. CSV columns, identifiers, financial behavior and settings are unchanged. Existing downloaded files need to be downloaded again to show the corrected names.

Source ad61740 passed lint, typecheck, all 495 tests in one single-worker run, and production build; independent review found no blockers. Development third-bandicoot-18 and production amicable-eel-413 synchronization succeeded with backend typecheck/schema validation. Read-only production export verification confirmed full multi-part names on every exported row; no financial writes were performed. This code release also carries the previously published PR19 deployment documentation onto main. Automatic website build results are recorded in the release PR after merge.

## Production release - October 19

Owner authorized the combined production release. Source 75683bb deployed successfully to Convex production amicable-eel-413 with typecheck/schema validation and no index deletion. PR19 merged as c861f1d78aef57796cb2787c1c46cb5fb2887202; both Student Status and Timeclock Cloudflare builds succeeded for that exact merge.

Signed-in Coach production check confirmed the fee CSV UI and all three export options. View charge details opened and Close details dismissed it. Read-only production export queries verified consistent assessed/paid/unpaid balances. Timeclock operator sign-in page loaded. No payment import, charge change or test invitation was performed during release verification.

The coordinated parent-email chat installed and verified production settings, then enabled sending after both builds succeeded: notifications@team8044.org sender, coach@team8044.org replies, production app origin matching SITE_URL, existing restricted key preserved privately. Development sending remains disabled. No real invitation/Google round trip was performed; that remains unverified. Existing accounts, charges and real settings were preserved.

## October 19 fee-specific Bulk Payment CSV

Implemented fee selection, All/Paid/Unpaid assessed-student export, blank-row skipping, authoritative review, and new receipts applied only to the selected fee. Durable row replay prevents duplicate posting; stale/overpayment and authorization checks remain server-side. Focused backend/CSV/regression checks and independent source review pass. See [workflow and evidence](FEE_PAYMENT_CSV.md). Combined lint/typecheck/build passed. Full suite passed 493 of 495 cases; two existing large-fixture tests timed out under parallel load, then both unchanged suites passed 35/35 with one worker. All 495 cases passed across those runs. Development sync to third-bandicoot-18 succeeded with backend typecheck; email sending remained disabled. No production deployment. Reviewed parent-email branch through 01ec5fe is integrated.

## October 19 simplified charge workflow (PR19)

Implemented development work follows the owner-approved Add charge → Review → Confirm charges flow: enter the reason once, load all student pages automatically, preserve exact reviewed-scope checks, and include Close details without changing charges. Validation: full lint, typecheck, 462 tests and build passed (existing bundle-size warning); independent source review found no blockers. Live browser/visual checks remain pending. Backend contracts remain unchanged. PR19 is the development candidate; main merge and production UI deployment remain separate.

The owner separately authorized confirmation of the existing production fee. That one prepared operation completed successfully for the entire reviewed active roster, with no held rows. Private verification remains outside Git; no student records or account-specific evidence are included here. This supersedes the earlier observation that the fee was only prepared. No duplicate fee was created.

PR18 is already merged as `4d21466`, with both production frontend builds verified successful. The older pre-merge and empty-roster notes below describe historical checkpoints, not current production state.

## October 19 charge-details close control

Added Close details while charge details are loading or open. Closing only dismisses the panel locally; it does not cancel, confirm or change charges. View charge details reopens it. A dismissed automatically selected job stays hidden, while a different new automatic job can still appear. No backend changes. Focused fee tests (14), source lint, typecheck and build validation recorded for this frontend checkpoint; live UI verification remains pending. Production read-only inspection confirmed the reported missing fee was still prepared, not committed; no financial action was taken. No student-specific evidence is stored here.

## October 19 parent email resend checkpoint

Implemented and locally verified: automatic parent email, Share/Copy, and Resend invitation after one server-enforced hour. Exact invited Google login remains required; resend invalidates the prior link. Lint/types/build and scoped review pass; all 482 regression cases passed across the full run and isolated timeout rerun. Synthetic phone/desktop checks passed. See [detailed evidence and rollout](PARENT_INVITATION_EMAIL.md).

Current main audit fixes are preserved. Audit chat owns the next shared development sync after merging this candidate with its fee-payment CSV work. Production deployment/main merge and real invitation-to-Google rehearsal remain pending. Development mail stays disabled; the prior direct connectivity email was confirmed received.

## October 19 parent email invitations — local candidate

- [x] Automatic invitation email, safe sending status, bounded retry/rate limits and interrupted-job recovery implemented.
- [x] Share invitation and Copy fallback implemented; matching Google account and existing acceptance rules preserved.
- [x] Full 478-test suite, lint, application/backend types and application build pass; actual-component synthetic browser checks at desktop/light and phone/dark pass.
- [x] Scoped Astra review closed without blockers. No production requests or real emails sent.
- [ ] Configure verified sender/domain/key and approved origin; authorized real-email and Google-link round-trip check before release.
- [ ] Separate authorization for backend sync and production rollout; no deployment in this checkpoint.

See [configuration and detailed evidence](PARENT_INVITATION_EMAIL.md). Earlier dated checkpoints below are historical.

## October 19 charge review wording

Implemented frontend-only simplification: View charge details; Review students and charges; explicit eight-character Reason input guidance; student names, planned/current amounts and readable saved/pending/review status replace internal revisions and processing counters. New unposted charges no longer produce false load errors. Missing existing charges still need review; held rows retain their explanation. Partial money release amounts and all confirmation/retry safeguards remain. No backend or production data changes.

Validation: integrated lint/typecheck, 425 tests and build passed (existing bundle-size warning); final held-row wording refinement passed 14 focused tests and source lint. Independent review found the held-row case and it was corrected. Rendered-markup evidence only; fresh authenticated browser/phone/theme comparison remains pending. Development checkpoint only; production publication is not included in this change.


## October 18 production changeover completed

Owner-authorized production cleanup and release completed. Application source `09289d4` was pushed to the development branch, deployed to Convex production `amicable-eel-413`, and merged through PR15 as `d3d2e9e368dbbb52d6031ebae0dc5007c11f356b`. Both production websites built and deployed that merge successfully; its tree exactly matches the reviewed source.

The verified permanent Coach is the sole remaining application user and Google auth account. All four other accounts/sign-ins, the one synthetic student and their reviewed dependencies were deleted atomically. Fresh snapshot checks found zero students, no remaining removed-identity references, no stored files and no report aggregate entries. Real season/FIRST/family-readiness settings, Coach identity and 63 calendar occurrences were preserved. Normal calendar sync timestamps advanced; configuration did not change. Credentials were neither changed nor exported. Private recovery exports remain ignored and outside Git.

Temporary cleanup switches and Coach-only maintenance restriction are removed. The old team join code was revoked and deleted; no replacement was created. Student Status and Timeclock public sign-in pages load; Coach backend access passes. The owner confirmed successful production Coach browser sign-in on October 18 and reported that everything looked good. Full student onboarding remains deferred by the owner to tomorrow; real signing remains disabled. Production needs no old-subteam conversion because there are zero student records.

The four stale tests are fixed. Full application check passed 423 tests before the final invitation regression; final maintenance suite passed 5/5 plus typecheck/lint. Timeclock checks and production backend compile passed. See [execution evidence](PRODUCTION_CHANGEOVER_2026-10-18.md). Earlier restrictions and pending-cleanup statements below are historical, superseded by this authorized release.

## Historical checkpoints (superseded where noted)

## Plain-language audit October 18

- [x] Batch 0: confirm six prerequisite facts and inventory development wording gates; see [findings and baseline validation](audit-2026-10-18/batch-0-findings.md).
- [x] Owner review of Batch 0 and approved publication of its documentation checkpoint.
- [x] Batch 1 safe text replacements and corresponding pinned tests implemented; typecheck/build/changed-file lint pass, source review complete. See [batch report](audit-2026-10-18/batch-1-report.md).
- [x] Coach, Parent, Student and Travel Lead live spot-checks completed without shared-data saves.
- [x] Batch 2 money/consent/FIRST/health/safety wording implemented and independently reviewed; development-only message sync passed. See [report](audit-2026-10-18/batch-2-report.md).
- [x] Batch 3 navigation/layout implemented and source/test reviewed; development sync passed. Travel Lead navigation and Coach draft preservation checked live. See [report](audit-2026-10-18/batch-3-report.md).
- [x] Batch 4 workflow implementation: review, build, typecheck, source lint and final subteam tests passed; Coach, Travel Lead, Parent and Student spot-checks complete without shared-data writes; see [report](audit-2026-10-18/batch-4-report.md).
- [ ] Stored subteam conversion explicitly deferred by owner; no production comparison or backfill.
- [ ] Separately listed bug/data fixes remain outside this checkpoint.
- [x] Integrated checks repaired and production release authorized separately; see current changeover evidence above.

## Controlled onboarding — October 18

- [x] Save live Google information URLs; publish OAuth after explicit action-time approval.
- [x] Verify real Coach Google login and empty-target preflight; initialize real Coach/approved season; remove bootstrap switches; observe Coach dashboard.
- [x] Initialize private account baseline and synthetic cleanup ledger; owner confirmed live-site rehearsal.
- [x] Implement exact-ID synthetic cleanup support; four focused tests, lint/types and Astra source review passed. Not yet deployed; preserve real Coach/season.
- [ ] Provision and verify Student, Mentor, Travel Lead and Parent using supported identity flows.
- [ ] Release footer and explicit disabled Worker default/preview URL settings after review.

## Frontend cleanup — implementation October 18

- [ ] Consolidate About, Privacy and Terms into a single consistent, accessible footer in both apps; remove duplicate navigation elsewhere. Preserve public URLs and required workflow acknowledgements. Verify affected phone/desktop layouts and links before the next approved frontend release. Implemented with focused checks; Astra review passed; release pending. See [PLAN.md](PLAN.md).

## Current prelaunch checkpoint — October 17

- [x] Prepare RELEASE_APPROVAL_PACKET.md with verified remote/Pages identity, known four-file demo merge conflicts, hosting matrix and rollback gates.
- [x] Owner approved the ordered hosting batch on October 17.
- [x] Preserve exact demo/reference branch, switch Pages and verify build/four file blobs.
- [x] Merge PR10/PR11; Astra verifies candidate-preserving tree. Main release 60505b4.
- [x] Deploy production Convex amicable-eel-413 from 60505b4; typecheck/schema validation passed, no index deletions.
- [x] Temporary registration scope approved, used and removed; both Workers/domains deployed from 60505b4 and hosting checks passed. See HOSTING_RELEASE_LOG.md.

- [x] Public About/Privacy/Terms and signed-out links in both apps; Terms exclude permission forms. Owner-approved concise public privacy; detailed operations internal.
- [x] Approved Google project-only OAuth Config Editor and saved organizational support email.
- [x] Post-migration calendar read verified; three production calendar settings privately installed/verified; owner PIN presence verified.
- [x] Exact season name/year/date boundary approved; FIRST inputs remain private.
- [x] Scoped frontend checks/builds and final Astra source review passed; representative local desktop/phone/light/dark page checks.
- [x] Frontend hosting complete; main-only builds and HTTPS domains verified.
- [ ] Google live URL registration/publication prerequisites, real login/device proof and later bootstrap/signing gates remain separate.
- [ ] Before the next frontend deployment, explicitly preserve disabled workers.dev and version preview URLs.
- [x] Resolve Google separate-project applicability from official policy and owner-confirmed audience; prepare GOOGLE_PRODUCTION_SETUP.md approval packet.
- [x] Owner approved production Google setup; created denham-venom-production under Foundation. Creator already has project access; no manual IAM grant.
- [x] Owner authorized User Data Policy acceptance; branding, identity scopes and shared production Web client saved. External/Testing verified.
- [x] Owner privately replaced both production Google credentials; saved presence and exact in-memory comparison verified without exposing values. Live OAuth remains a post-deployment check.

- [x] Published application checkpoint `87134fb` and verified remote development revision, unchanged main, and draft PR10 integration target. Boundary documentation audit reconciled current handoff, plan and historical status notices.

## Historical checklist — superseded where noted

Earlier checklist entries are historical where superseded by CURRENT_STATE.md; unchecked configuration items below do not reopen completed approvals or settings.

- [x] Two-agent prelaunch pass: DEV-only Timeclock label, both builds/typechecks and Timeclock lint passed; independent auth/release review clear. See NEXT_CHAT_HANDOFF.md.
- [x] Owner supplied January 9, 2027 kickoff/start, FIRST enrollment link/QR (private local storage), and admin support identity. Production season not yet created.

- [x] Owner approved configuration batch; production Student Status and Timeclock origin settings saved and verified.
- [x] Owner completed Google client credential handoff; AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET verified saved in production without reading values.
- [x] Production JWT signing pair installed privately and stored pair verified with RS256 sign/verify.
- [ ] Real-origin OAuth verification remains post-deploy; Cloudflare creation remains gated; neither app deployed.

- [x] October 17: prepared production configuration/build matrix and release/Pages-transition/rollback sequence in LAUNCH_CONFIGURATION_PLAN.md; verified Convex, Google and Cloudflare DNS/Worker gaps read-only.
- [x] Cloudflare GitHub connection inspected after login: existing denhamvenom connection lists student_status.
- [x] Consolidated configuration approval received; approved origin/OAuth/signing setup applied. Launch remains separately gated.

- [x] October 17: Convex administrator/plan and existing production identity/default protections checked read-only. Production reports Never deployed; owner-approved organizational Admin invitation accepted and membership verified.
- [ ] At each phase transition, assess whether a fresh chat would improve accuracy and prepare a handoff when needed.

- [x] October 17: existing Google Cloud project moved into Foundation organization with owner-approved administrator roles; External OAuth verified after migration. Details: ONLINE_READINESS_HANDOFF.md.
- [ ] OAuth remains Testing; finish branding/production configuration and verify real-origin sign-in separately. Convex organizational Admin membership verified; production configuration and Cloudflare Git hosting preparation remain open; backups/paid upgrade deferred.

Updated October 16, 2026. Owner closed the development visual review cycle at 1f20ca8; Parent/Student setup and review corrections are complete. Current disposition supersedes historical unchecked boxes. Original G1–G7 scope and valid evidence are preserved.

## Completion batches

- [x] October15 recheck R1, M1-M4, section3 confirmations and optional a-j implemented/reconciled; see VISUAL_CHECKS.md for exact source and live evidence limits.
- [x] Focused regressions, full lint/types/build and consolidated Astra review passed; no backend sync required.
- [x] Owner closed the current visual correction cycle October 16; evidence limitations retained.

- [x] October15 adult-invitation OAuth return route fixed after live failure; exact-origin/path regression and security review passed.
- [x] Adult invitation landing preserves the OAuth code query while restoring the token fragment; focused transport regression and scoped lint passed. Owner completed invited-account sign-in in the in-app browser; Mentor Team report observed. Separate Chrome retry not observed.
- [x] Owner confirmed invited Mentor access after both sign-in repairs; Mentor report observed. Separate Chrome retry was not observed in that repair session.

### October 15 wizard-review correction batch

- [x] B1–B3 and W1–W4 implemented; full updated cutting pass mapped row-by-row in VISUAL_CHECKS.md.
- [x] Focused setup/Home/travel regressions, lint, typecheck/build and packaging dry-run passed; Astra consequential finding corrected and closed.
- [x] Development backend synchronized October 15 at 10:20 America/Chicago; no schema, permissions, financial or Timeclock contract changes.
- [x] Parent phone FIRST at360/390, single report, Waiting on Coach, completion summary; Student minor Home/setup/completion; Coach Verify/Reopen and settings checked live. Conditional fixture limitations recorded in VISUAL_CHECKS.md.
- [x] Owner visual review cycle closed October 16.


- [x] Approved original-logo PDF: completed profile required, populated review, checkbox and typed signature, saved immutable receipt and Coach acceptance. Ordinary examples remain one page with signature/date in original slots. Genuine overflow continues losslessly; historical receipts preserved.
- [x] Operational journeys: current-season room/deadline, paid withdrawal with original-source return and canceled charge, released room membership and scoped withdrawn-room recovery verified with fictional data. Existing room invitation/acceptance and Parent-isolation checks reused.
- [x] Production-language review: route/role inventory completed using live representative pages, source review and retained evidence. User-friendly status labels, accurate Available funds label and fee order positions replace internal values. See VISUAL_CHECKS.md.
- [x] Integrated lint, types, tests and build passed at final milestone. Final label-only correction passed scoped lint/CSV checks and rebuilt successfully. Packaging dry-run completed without deployment; sandbox prevented only its external log-file write.
- [x] Consolidated Astra review: no blocking findings at the representative scope. No new public API, schema or migration.
- [x] User confirmed signed PDF opens and Reports CSV downloads.
- [x] User confirmed CSV opens correctly; friendlier cents headings/units deferred until after launch by explicit request.
- [x] Parent and Student setup usability batch — implemented and reviewed; live representative workflows and focused checks complete. Includes three-step Student setup and initial subteam selection (Build, Electrical, Programming, Machining, Business), Coach corrections, and shared season FIRST team acceptance + Consent & Release for Parent/Student/Coach, automatically required for every Competition. See PARENT_SETUP_BATCH.md.
- [x] Coach closed visual review October 16 at 1f20ca8.

## Preserved G1–G7 outcomes

| Requirement | Current evidence |
| --- | --- |
| G1 — Frontend alignment | Hosted prototype visual language retained; later features preserved; representative phone/desktop and light/dark evidence retained. |
| G2 — Visual coverage | Finite route/role review complete at representative scope; owner visual acceptance recorded October 16. No claim of every state/device combination. |
| G3 — Whole Team | Creation/reactivation rehearsal and enrollment/access/financial tests retained. Withdrawals preserved. |
| G4 — Genuine dashboards | Source-backed finance, attendance, child switching and bounded reports; unknown future kickoff remains unavailable rather than invented. |
| G5 — Accounts and consent | Setup/correction, Mentor acceptance, independent finance/health grants and restored permissions, approved PDF lifecycle and historical receipts verified. |
| G6 — Administration | Roster, money/source history, fundraising, season carryover, historical corrections and retention holds retained. Paid withdrawal now verified live. Destructive retention remains gated. |
| G7 — Delivery | Final integrated milestone, focused follow-up, packaging, Astra review and development publication. PDF/CSV opening confirmed; owner visual cycle closed October 16. |

## Evidence limits, not new implementation scope

Recipient-side room-invitation acceptance and the no-linked-Parent screen were not observed with live signed-in fixtures. Existing source and tests cover acceptance/stale/conflict and Parent link isolation/revocation. Astra accepted these limits under the focused-verification policy. No account was created, permission expanded or Parent link severed for a screenshot.

Development records and the development-only banner remain truthfully labeled. The production-build sign-in screen has ordinary user language and does not enter review mode through a query parameter. Real onboarding/configuration remains a launch task. Timeclock's frontend-only copy checkpoint and its separate physical/concurrent evidence remain with its owner; Student Status shared contracts did not change.

## Release checklist — after the visual-review candidate

These are separate launch gates, not authorization to deploy.

- [x] Complete the finite page-by-page production-language review; production sign-in build inspected. Confirm real deployment configuration separately at launch.
- [ ] Before launch, remove the permission-page development explanation "Real signing is closed. This account and fictional subject are not registered for synthetic consent." together with the development banner from production-facing copy. Keep it in development and retain signing safeguards; real signing approval remains separate.
- [x] Coach closed development visual review October 16 with documented evidence limits retained.
- [ ] Confirm organizational ownership and administrators for GitHub, Convex, Google and Cloudflare.
- [ ] Confirm Student Status production domain, separate production configuration, Google sign-in and allowed origins.
- [ ] Approve production privacy/access configuration and enable real signing separately. Field-trip/first-aid wording is already approved; Medication Choices is removed.
- [ ] Resolve retention coverage, holds and backup/export treatment; keep automatic deletion disabled pending explicit authorization.
- [ ] Review realistic team-volume limits, performance and remaining material usability/accessibility issues.
- [ ] Establish monitoring, backups, demonstrated restoration and deployment rollback.
- [ ] Prepare production account/roster onboarding without promoting synthetic development records.
- [ ] Plan the existing GitHub Pages demo transition before a merge affecting it.
- [ ] Obtain explicit production-deployment approval.
- [ ] Publish the approved release with release notes; verify sign-in, permissions and core workflows at the production address in a controlled launch.
- [ ] Coordinate Timeclock's separate visual approval, authorized concurrent Group rehearsal and physical-device evidence at an approved reachable origin.
## Historical phase plan and dated evidence

The sections below retain prior decisions and evidence. Their older unchecked boxes, checkpoint IDs, estimates and phrases such as “pending,” “no activation,” or “all seven open” describe their original date, not a second current queue. The reconciled status above and later dated evidence supersede those historical claims. Do not repeat completed journeys merely to close historical boxes.
## Phase 1 Establish the foundation

**Status: Completed for development.**

- [x] Preserve the original prototype and handoff files.
- [x] Create a separate development app with the agreed React, TypeScript and Convex stack.
- [x] Apply team branding and support phone/desktop layouts and light/dark appearance.
- [x] Connect the development database and Google sign-in.
- [x] Establish server-side checks for account roles and access to student information.
- [x] Connect GitHub, preserve the old demo, and exclude secrets and local build files.
- [x] Establish focused commits, draft pull requests, review notes, and ongoing project documentation.
- [x] Make the privacy rule explicit: student records never belong in GitHub, whether public or private.
- [x] Prepare Cloudflare hosting configuration and verify local packaging without publishing.

**Still separate:** Production hosting, production accounts and release approval belong to Phase 8. The existing public demo remains unchanged.

## Phase 2 Connect students and parents

**Status: Parent invitations completed and tested; wider account setup still needs work.**

- [x] Let students sign in with Google and submit a team join request.
- [x] Let the Coach approve a student account.
- [x] Let a student create a parent invitation for a specific email address.
- [x] Require the parent to use that Google email and confirm their relationship and authority.
- [x] Make invitations single-use and valid for seven days.
- [x] Support multiple parents per student and multiple students per parent.
- [x] Add the Coach's Allow new parent invitations control in Join Requests.
- [x] Preserve outstanding valid invitations and existing parent access when new invitations are paused.
- [x] Let the Coach revoke access, restore it, and resolve invitation problems.
- [x] Test the real Google sign-in round trip with separate student and parent test accounts.
- [x] Verify wrong-account rejection, used-link rejection, and immediate loss of student views after revocation.
- [ ] Finish first-time student profile setup, including required fields and initial rooming-category rules.
- [ ] Finish account corrections, archived-student matching and reactivation workflows.
- [ ] Build the complete adult invitation and role-management screens.

**Current invitation delivery:** The student copies and shares a link. The app does not send email. Parent linking does not sign any permission or medication form.

## Phase 3 Complete events and financial handling

**Status: Withdrawal requests, reviewed internal returns and categorized charge entry are implemented and tested for development. Other finance workflows remain.**

- [x] Connect basic event creation, event views and selected participation actions to the database.
- [x] Connect basic payment recording and financial summaries.
- [x] Connect FIRST requirement completion and readiness updates.
- [x] Finish signup approval, chronological manual waitlists, deadline editing and custom requirement editing.
- [ ] Finish broader required-event assignment and a complete end-to-end event rehearsal.
- [x] Build the student withdrawal request and Coach or Travel Lead decision screen.
- [x] Implement Approve withdrawal and return payment to available funds.
- [x] Implement Approve withdrawal and retain non-refundable payment, with a clear note.
- [x] Implement partial return of event payments, showing how much was paid and allowing a return up to the full eligible paid amount.
- [x] Automatically cancel unpaid extra fees, such as an unpaid lunch fee, when withdrawal is approved.
- [x] Implement Deny withdrawal, preserving participation and payment status.
- [x] Release the student's event/room place when a withdrawal is approved, while preserving history.
- [x] Add Record money returned beside payment recording, restricted to available personal payments and authorized financial staff.
- [ ] Finish charge corrections, cancellations, adjustments, payment priorities and financial history review.
- [ ] Finish fundraiser creation and allocation of funds to students.
- [x] Preserve separate personal-payment and fundraising sources through implemented allocations and withdrawal returns.
- [x] Extend source checks to recorded payouts and same-season fundraising transfers.
- [x] Extend source checks to season carryover, including paired amounts, source roots, retries and automatic target allocation; synthetic checks passed. Live cutover remains unverified.
- [x] Add fundraising-credit transfers to an active student in the same season, with reasons and automatic recipient allocation.
- [x] Implement reviewed season carryover and source-preserving recorded moves into team funds. Team-account management is outside scope; no live activation occurred.
- [x] Test withdrawal decisions for duplicate submissions, stale approval, correct balances, source tracking and role restrictions.
- [ ] Test remaining financial workflows as they are implemented.

**Decisions needed before completing this phase:**

- [x] Agree that unpaid main event/travel balances remain owed unless the approver explicitly cancels them; paid extras are included in the eligible return amount.
- [x] Build the explicit unpaid main-fee cancellation choice and record the decision.
- [x] Agree that returned funds automatically pay other outstanding charges in their assigned order.
- [x] Agree to distinguish personal payments from fundraising credits; fundraising credits can transfer to students, carry over or move into the team account. Family cash/check payouts of fundraising credit are not authorized.
- [x] Agree: Coach or Travel Lead with explicit finance permission; active recipients in the same season; reason required.

**Already agreed:** Returning an event payment to available funds is an internal account change. Giving someone money back is a separate financial record. The app records that payout; it does not transfer money.

## Phase 4 Build permission and health forms

**Status: Synthetic signing, Coach acceptance, correction/resubmission, re-signing, paper recording and manifest/health export have live development evidence. Remaining role/grant and representative visual checks stay open; real signing remains disabled pending final wording/products/policy approval.**

- [x] Review the old permission slip as a reference.
- [x] Provide basic profile/health fields for synthetic development testing.
- [x] Keep real permission signing blocked while wording and the workflow are unfinished.
- [x] Agree to name Denham Springs High School and FIRST Team 8044, Denham Venom.
- [x] Agree that permission-form wording includes authorization for minor first aid as appropriate.
- [x] Prepare a read-only [permission and medication draft](PERMISSION_FORM_DRAFT.md) for Coach review.
- [ ] Approve the final permission wording and responsibilities.
- [x] Agree that the Coach approves the final permission wording and medication-administration policy before real signatures.
- [x] Agree on Pain, Allergy and Cold categories, each with Allow / Contact me first / Do not allow; nothing preselected.
- [ ] Define which products/ingredients and exceptions each medication category covers.
- [x] Build and rehearse the synthetic parent form and signature process, separate from account linking. Real signing remains gated.
- [x] Save and verify an immutable synthetic submission snapshot of wording, covered events and signed information, retaining the original through correction/resubmission.
- [ ] Build correction requests, re-signing and Coach recording of paper forms.
- [ ] Add Coach export of permission/health packets.
- [ ] Add the separate Coach-controlled permission allowing a Travel Lead to export those packets.
- [ ] Verify that other roles cannot retrieve restricted health information or exports.

**Important distinction:** Existing health fields are not a completed, approved medication-consent system.

## Phase 5 Complete travel and event readiness

**Status: Drivers, vehicle assignments and transportation readiness are implemented and tested. Complete room management remains.**

- [x] Separate student requirements, transportation and adult room placement in readiness calculations.
- [x] Provide limited room-group and assignment-request actions.
- [x] Finish student room invitations, acceptance, cancellation, leaving and assignment requests, with server-enforced deadlines.
- [x] Finish adult room assignments, moves, finalization and recorded fifth-person exceptions; prohibit six occupants and mixed categories.
- [x] Finish driver and vehicle management, passenger seats and event assignments.
- [x] Add bus seats, independently traveling students, additional adults and trailer/towing requirements.
- [x] Make approved withdrawals release room places and update transportation demand.
- [ ] Finish consistent room updates for other roster changes and adult room actions.
- [ ] Complete the Coach/Travel Lead event workspace and restricted Mentor reports.
- [ ] Rehearse a complete fictional trip from signup through ready-to-travel review.

## Phase 6 Connect attendance

**Status: Shared Timeclock backend and separate frontend are implemented and integrated in development. Family attendance loads; controlled Group-mode concurrency, physical-device and remaining reporting/visual checks remain.**

- [x] Approve the shared policies and keep Timeclock separate from travel fees/participation.
- [x] Prepare an independent Timeclock workspace on port 5174, with one shared Convex backend.
- [x] Restrict operations to active Coaches/Mentors; keep attendance corrections Coach-only.
- [x] Add reviewed first/last-name fields, minimized roster display and a Coach review API without guessing old names.
- [x] Implement individual/group clocking, explicit PIN transfers, duplicate protection and one open interval per student.
- [x] Provide live per-student IN/OUT/no-activity state and other-event conflicts to the Timeclock frontend.
- [x] Implement half-hour extensions, exact server auto-close, schedule changes and cancellations with retained history.
- [x] Derive attendance from one uninterrupted scheduled hour; keep early/extended time separate.
- [x] Add append-only Coach correction and evidence APIs; preserve legacy boolean evidence.
- [x] Connect the dedicated read-only Calendar identity and verify deployed minute polling.
- [x] Verify Google Mentor sign-in at the Timeclock origin and preserve prior Student/Parent roles.
- [x] Pass 77 automated tests, root/workspace checks and both Cloudflare packaging dry-runs; obtain Astra source review.
- [x] Implement Timeclock frontend, including cross-tab console coordination and PIN-protected controls, on separate feature/timeclock-frontend branch (c73a6a3, draft PR #6).
- [ ] Integrate/rehearse the Timeclock frontend with live reviewed synthetic roster names and multiple devices.
- [ ] Complete Coach structured-name review for existing roster records before real clocking.
- [x] Build Coach per-session/student Timeclock summaries, original evidence and correction screens.
- [x] Build the Coach structured-name review screen.
- [ ] Finish broader season attendance reports and family-facing Timeclock summaries.
- [ ] Rehearse the complete multi-device interface with synthetic students.
- [ ] Plan historical Sheets import and expand bounded queries if team scale requires it.

See [the concrete frontend handoff](TIMECLOCK_BACKEND_HANDOFF.md). Student Status family attendance now loads aggregate-backed verified totals with legacy evidence distinguished; remaining rehearsal and visual comparisons are still open. No production release is authorized.

## Phase 7 Finish administration and reporting

**Status: Six-step season administration and read-only archived-season browsing are implemented and reviewed in development. Controlled historical corrections, essential live/visual evidence and broader reporting remain.**

- [x] Connect basic Coach roster edits such as subteam and Travel Team status.
- [x] Agree that the Coach manages application accounts.
- [x] Agree to retain archived records for five years from the date the Coach archives the student account.
- [ ] Finish account/role administration and separate financial and health-export permissions.
- [ ] Finish roster archival, reactivation and correction screens.
- [x] Build the full six-step end-of-season review, balance decisions, mapped new-season profiles, typed confirmation, durable progress/recovery and safe final activation; reviewed synthetic development candidate, not a live activation claim.
- [x] Build Coach-only read-only archived-season roster and held-balance browsing.
- [ ] Complete controlled historical correction handling with warned, reasoned, audited changes.
- [ ] Finish reports and exports with the correct restrictions for each role.
- [ ] Define and implement record deletion after the retention period, including backups and any holds.

**Decisions needed:** Confirm what the five-year policy covers and how downloaded exports, backups, holds and reactivated accounts are handled. The start date is now confirmed as account archival.

## Phase 8 Prepare and approve launch

**Status: Not started as a release. No production deployment is authorized.**

- [ ] Confirm the long-term organizational ownership and administrators for GitHub, Convex, Google and Cloudflare.
- [ ] Confirm the production domain and separate production configuration.
- [ ] Complete the privacy, permission, medication, retention and access policies.
- [ ] Finish all required workflows and replace unfinished placeholder screens.
- [ ] Review access restrictions across every role and sensitive operation.
- [ ] Test complete student, parent, Coach, Travel Lead and Mentor journeys on phone and desktop.
- [ ] Compare every completed role view against the preserved original design prototype: navigation, layout, typography, purple/gold branding, logos, spacing, controls and interaction states on phone/desktop and light/dark themes.
- [ ] Record intentional design differences, correct unintended visual regressions, and obtain Coach review of the polished interface before launch.
- [ ] Address remaining usability, accessibility, loading/error handling and performance issues.
- [ ] Review current limits on financial-history entries, invitations and parent links against expected team usage; expand them safely where needed.
- [ ] Establish monitoring, backup/restore testing and a rollback procedure.
- [ ] Plan the transition from the existing GitHub Pages demo before merging changes that affect it.
- [ ] Obtain explicit approval for production deployment.
- [ ] Publish an approved version with release notes, then perform a controlled launch check.

## How we will work through each phase

- [ ] Confirm the phase's rules and any unresolved decisions.
- [ ] Have Astra manage or review major work; use Sol agents for independent implementation tasks.
- [ ] Build a complete usable workflow, including errors and permission checks.
- [ ] Test with fictional records, including attempts that must be rejected.
- [ ] Complete review and address findings.
- [ ] Commit and verify the GitHub push; update the pull request and this checklist.
- [ ] Demonstrate the result and identify the next step.

These are repeating steps for each future milestone, not unfinished tasks in the completed invitation milestone. Update this checklist whenever scope or verified status changes. Keep account emails, student records, tokens and secrets out of it.

## Current evidence and next step

The October 12 fictional rehearsal and later follow-up passed 101 automated tests across 18 files, lint, strict types and build. Live Coach, Student and Parent checks verified approval/manual promotion, waitlist withdrawal with reactive parent updates, fictional personal payout/fundraising transfer, room finalization, vehicle capacity, and Timeclock automatic closure plus an audited correction preserving the original. Later ordinary Mentor and Travel Lead checks verified limited navigation, read-only finance and a saved transport adjustment. See [the rehearsal report](REHEARSAL_2026-10-12.md) for the exact coverage and fixes.

**Current priority:** Frontend work resumed; complete remaining role/state checks in VISUAL_CHECKS.md after the modal/section/invitation checkpoint. Representative screen and frontend rollout were approved; remaining conformance and evidence gaps are in FRONTEND_CONFORMANCE_LOG.md. Whole Team includes every active member and automatically includes later joiners in upcoming events (implemented and regression-tested; remaining live/visual evidence pending). See CURRENT_STATE.md for scope and boundaries.

Current frontend publication is draft PR #9 on feature/student-status-readiness-design (verified baseline 43a254b before the context audit). PR #7 is the earlier operations milestone. Timeclock remains separately coordinated. No main merge or production deployment is authorized.

## Operations milestone checkpoint — October 12, 2026

Agreed decisions: chronological waitlist order with manual Coach/Travel promotion; student room changes stop at the deadline while adult corrections require an audit reason; financial editors may transfer available fundraising credits to active students within the same season, with a reason. Cash/check refunds are separate recorded payouts from available personal payments.

- [x] Coach structured-name review and Timeclock attendance/correction screens.
- [x] Event approval, ordered waitlist, requirements and rooming workflows.
- [x] Source-preserving payout records, fundraising transfers and readable history.
- [x] Astra final review; 90 tests across 15 suites; lint, types, builds and packaging checks; development sync.
- [x] Smoke-check live Coach attendance/name review, payout/transfer forms and event/room workspace after browser connectivity recovered; event/finance phone layouts have no horizontal overflow.
- [x] Rehearse live Coach/Student/Parent waitlist withdrawal and reactive family status.
- [x] Rehearse a closed Timeclock session and audited correction while retaining original evidence.
- [x] Rehearse fictional Coach payout/transfer, room assignment/finalization and transport capacity.
- [x] Add integrated role/finance/withdrawal tests and guarded fictional fixture creation.
- [ ] Finish live paid-withdrawal, student room-invitation, broader Travel/Mentor and independent-device journeys; automated coverage is not live acceptance.
- [x] Publish and verify implementation checkpoint `d33c701` on `feature/student-status-operations`, draft [PR #7](https://github.com/denhamvenom/student_status/pull/7), based on `feature/timeclock-backend`.

Work runs in isolated `student-status-operations` / `feature/student-status-operations`. Timeclock frontend owns its separate worktree and `apps/timeclock`; one Student Status owner integrates shared backend and schema changes. Production, real signatures, automatic deletion and main merges remain outside this authorization.

Timeclock parallel handoff: frontend owner reports Astra review, 34 synthetic intercepted-browser scenarios, 77 baseline backend tests, root/workspace checks and packaging dry run passed. This evidence is owner-reported; full live multi-device rehearsal remains pending. Student Status operations does not modify apps/timeclock.

### Same-day Mentor and Travel Lead follow-up

- [x] Ordinary Google-signed-in Mentor created a three-minute fictional Timeclock event and clocked a fictional test student in and out; Student Status showed limited Mentor navigation.
- [x] Apply the owner-authorized, audited development Travel Lead grant to that existing Mentor without financial editing; verify reactive navigation, no Coach Attendance or Users & Roles entry, and no finance payment or payout controls. Returning to Timeclock kept Mentor access and showed the fictional session auto-closed; screenshot evidence stayed outside Git.
- [x] Load Travel Lead event, transport and room controls; save fictional additional-adult demand from zero to one and back, observing four seats for three riders and then four seats for two riders.
- [x] Rerun the full local check outside the Windows sandbox after its known Vitest temporary-file failure: 101 tests in 18 files, lint, types and build pass.
- [ ] Rehearse paid withdrawal, student room invitation, PIN-protected Timeclock actions and independent-device conflict handling live.

## Design alignment audit — current priority

- [x] Agree that features added after the prototype must follow its overall design system and look and feel, while preserving approved product requirements.
- [x] Preserve unfinished local development in local checkpoint `d47d85d`, tagged `pre-design-fix-2026-10-12`; not published or release validated.
- [x] Extract and inventory the read-only design reference; identify its version and reference conflicts. `design-reference/` is ignored and preserved unchanged.
- [x] Consolidate visual comparisons for available Coach, Student, Parent and Travel screens at phone/desktop in both themes, with Astra review and parallel Sol image review. The report explicitly distinguishes valid observations, invalid captures, unimplemented screens and unavailable states; this is not visual acceptance.
- [x] Complete `design-drift-report.md` with role/state coverage, prioritized findings, added-feature styling guidance and separate functional dependencies.
- [ ] Close remaining evidence limits during correction verification: ordinary Mentor-only account, active room invitations/paid withdrawal, multiple linked children, invitation variants, and invalid Student Parents desktop captures. No permissions or domain records were changed to manufacture those states.
- [x] Coach authorized representative corrections and then approved wider frontend rollout.
- [ ] Implement approved shared labels, tokens/components and screen corrections; preserve backend and access rules.
- [ ] Recompare corrected screens, document intentional differences and obtain final visual review.
- [x] Append design-conformance instructions to existing AGENTS.md.
- [x] Publish and verify the broader reviewed frontend checkpoint `2bb7eee` in draft PR9.

No backend work, Timeclock changes, real consent, production deployment or main merge is included in this design task. Newer features without an exact prototype screen inherit its typography, colors, spacing, layout patterns and component states; do not invent a separate visual style.

## Representative design review — Coach Readiness

- [x] Coach authorized one representative screen, then review before wider rollout.
- [x] Prepare Coach Readiness at 390px and 1440px in both themes, with explicit existing-data limitations.
- [x] Validate four visual comparisons, navigation/event selection/keyboard behavior, Astra review, lint/types, 101 tests and build. See [the representative review](READINESS_DESIGN_REVIEW.md).
- [x] Coach approved representative Readiness and authorized applying its design across the app.

This branch excludes paused backend drafts and earlier broad frontend drafts. No backend, Timeclock or production changes are authorized.

Representative Readiness checkpoint `ed69bbb` is published and verified in draft [PR #9](https://github.com/denhamvenom/student_status/pull/9). Coach approved the representative screen; broader conformance verification is in progress.

## Approved frontend rollout — October 12

- [x] Coach approved representative Readiness and authorized frontend conformance across the app.
- [ ] Complete existing-data presentation and verify role/viewport/theme coverage.
- [x] Update [the work log](FRONTEND_CONFORMANCE_LOG.md), evidence limitations and Git checkpoints for this implementation pass.

Backend-dependent gaps remain separately deferred; no production action is authorized.

### Frontend implementation checkpoint

- [x] Implement shared role shell, reference copy helpers and consistent Base UI tokens/controls.
- [x] Implement existing-data presentation changes for Status, Finances, roster, event setup/workspace, Drivers, invitations, permission draft, attendance, rooms and withdrawals.
- [x] Astra final source review and full check: 101 tests, lint, strict types and build. Cloudflare dry run packaged successfully without upload (optional sandbox log-write warning).
- [x] Compare New Event audience at phone/desktop in both themes; verify open-capacity control, six-step navigation and Cancel without saving.
- [ ] Finish remaining role/state/theme checks in VISUAL_CHECKS.md. Live-app shared-label extraction is recorded complete in the later conformance follow-up; inspect specific residual copy during checks.
- [ ] Coach final visual acceptance of the broader app.

### Copy and responsive verification follow-up

- [x] Consolidate live route, role navigation and operation wording into shared copy modules; preserve domain values and later approved policies.
- [x] Add Status All events link, missing-subteam fallback and roster no-matches state.
- [x] Correct 4px small-control corners and verify event anchor offsets below sticky navigation at phone/desktop.
- [x] Review additional Student/Parent layouts, desktop driver forms and lower finance controls; record exact capture/state limits in FRONTEND_CONFORMANCE_LOG.md.
- [x] Astra final source review and complete local check: 101 tests, lint/types/build pass.
- [ ] Finish restricted/unavailable-state rehearsals and remaining viewport slices; full pixel parity and final Coach acceptance are not claimed.
- [ ] Resolve flagged backend dependencies in a separately authorized phase.
- [x] Publish and verify follow-up checkpoint `d43fac3` in existing draft PR9.

- [x] Review dark event transport/rooming viewport slices and clarify completed-room Finalized action while preserving required re-finalization.


## October 13 context checkpoint

- [x] Agree: Whole Team includes every active team member, including automatic inclusion when new members join after event creation.
- [ ] Implement and verify that rule after backend-phase authorization; inspect lifecycle and financial interactions first.
- [x] Audit context recovery, add CURRENT_STATE.md, correct stale approval/current-branch/startup guidance, and distinguish historical reports from current status.
- [x] Create repository-local context-checkpoint and prototype-verification skills; validate their SKILL.md format.


## October 13 workflow checkpoint

- [x] Route future agents to the two tracked project skills through AGENTS.md; vendor skill bundles remain ignored.
- [x] Consolidate outstanding comparisons in [VISUAL_CHECKS.md](VISUAL_CHECKS.md); older conformance matrices remain historical evidence.
- [ ] Complete the remaining checks in that table. Consolidation does not count as new browser verification or Coach acceptance.

Shared live-app copy extraction is recorded in the October 12 conformance follow-up. Earlier broad shared-label migration tasks are superseded by that evidence; future checks should identify specific residual literals rather than repeat the completed migration. Legacy fixture-only preview remains outside this live-app pass.


## October 13 frontend alignment checkpoint

- [x] Use both project skills; Sol implements separate files and Astra accepts final source review.
- [x] Implement reference-sized New Event modal, collapsible event sections and invitation sharing/accepted confirmation; preserve backend contracts.
- [x] Review final Basics modal phone/desktop light/dark, Cancel/Escape focus, section expansion/anchors and additional driver/finance slices.
- [ ] Finish remaining cells in VISUAL_CHECKS.md, including invitation success and date-entry/submission rehearsal. No whole-app parity claim.
- [x] Historical visual-pass follow-up resolved: expired Timeclock fixture corrected; final October13 integration suite126/126 passes.
- [ ] Authorize a local QR dependency if QR sharing is required; no remote token-sharing service or fake QR added.

No production deployment, main merge, real consent or domain-record mutation occurred in this visual pass.

## Active seven-item completion goal — October 13

User authorized completing all allowable frontend/backend work through readiness for visual approval, with Astra/Sol parallel work and Timeclock coordination. See GOAL_ACCEPTANCE.md. This supersedes earlier frontend-only implementation boundaries for this goal, while privacy, real-signing approval, no production and no main merge remain.

- [x] Confirm later Whole Team additions apply only to upcoming events.
- [x] Fix existing expired Timeclock test with scoped fixed clock; isolated concurrency test passes.
- [ ] Complete Whole Team integration/scale review/dev verification; local fixtures alone do not close item3.
- [ ] Complete report/query UI and scalable team/attendance summaries; null gross-raised data is not completion.
- [ ] Integrate Timeclock frontend checkpoint753b236 and its sanitized rehearsal evidence on completion branch.
- [ ] Complete remaining requirements G1–G7 in GOAL_ACCEPTANCE.md; explicitly announce each only after full evidence.

### October 13 enrollment and reporting integration (local)
- [x] Implement Whole Team creation snapshot and durable one-member enrollment with atomic fee/cursor rollback and Coach retry.
- [x] Verify upcoming-only activation, preserved prior participation, 500-member creation and 100-upcoming-event financial batching in focused synthetic tests.
- [x] Guard participation, finance, rooms and transport while enrollment is unfinished; show enrollment progress instead of false readiness.
- [x] Implement per-student finance summaries, resumable coverage-verified rebuild, readable roster counts and Coach rebuild UI.
- [ ] Complete aggregate component and scalable corrected-attendance projections; existing bounded report implementation is interim.
- [ ] Run live development rehearsal and prototype comparisons for new enrollment/report surfaces.
- [x] Publish reviewed integration checkpoint `f52d996`; remote verified and draft PR10 created.

No G1–G7 completion is claimed by these substeps. Real signing, production and main remain gated.

Validation at this incremental checkpoint: lint, strict typecheck, Vite build and22test files/126tests pass. Astra source review accepted; build retains an833KB chunk warning. No new live backend sync or browser acceptance is claimed.

### October 13 next integration wave (historical interim snapshot; superseded below)
- [x] Merge reviewed Timeclock frontend753b236 into completion branch; combined Timeclock lint/types/build pass. No main merge.
- [x] Implement initial profile setup, locked room category, revision-checked ordinary edits and Coach correction requests; frontend integration present locally.
- [x] Implement verified adult invitation and role/grant backend; frontend work in progress.
- [ ] Finish reviewed aggregate and attendance worker integration, including failure rollback and request bounds.
- [ ] Verify account/profile/adult invitation screens against prototype and exercise synthetic live journeys.
- [ ] Complete permission signing/receipts/corrections/export behind real-signing gate; current first account slice does not close G5.
Interim synthetic regression suite135/135 passed before final attendance worker tests. At that interim snapshot the wave was not yet published or live-synchronized; the reviewed account/report checkpoint below supersedes this status.

Review checkpoint: combined lint/build and145/145 tests across25files passed before final review fixes. Attendance page size is now bounded at10; Astra is checking total fanout. Adult invitation fragment/token-free OAuth handling and paginated, duplicate-protected correction requests are being finalized. Source validation does not close live or visual checks.

### October 13 reviewed account/report wave
- [x] Resolve Astra findings: fragment-only adult links/token-free OAuth, duplicate-protected paginated corrections, bounded attendance pagination including expanded native pages.
- [x] Validate152 tests across26files, lint/types/build. Sandbox temporary-file import failure required outside-sandbox rerun; mixed-encoding label fixed. Build retains867KB bundle warning.
- [x] Sync reviewed source to development third-bandicoot-18; aggregate components installed successfully.
- [ ] Exercise live profile/account/report journeys and finish four-combination visual evidence.
- [x] Publish reviewed wave4a9ff62 and verify remote commit; update draft PR10 scope.
No numbered G1–G7 item is complete from this incremental checkpoint.

### Permission workflow slice (reviewed and development-synchronized)
- [x] Add reviewed additive schema for exact wording versions, prepared drafts, immutable submissions, event coverage and signature requests; preserve paper signer/recorder distinction.
- [x] Implement development-only fictional consent fixture and explicit verified test-Parent linkage; 6 tests pass for provenance, safe retries, wrong-deployment denial, rejected identity adoption, verified-account requirements, and no revoked-access restoration. Reviewed and synchronized to development October 13.
- [x] Integrate permission backend/UI, authoritative readiness coverage, electronic fixture linking and negative-access/snapshot tests. Combined backend suite169/169 and frontend export suite5/5 pass; Astra backend/UI source review clear.
- [x] Review, lint, typecheck, build and synchronize to development at08:45 October13; real signing stays blocked. Bundle warning is917KB.
- [ ] Complete live synthetic signing, receipt, correction/re-signing, paper and export rehearsal and four-combination prototype checks.
Parent Status/Attendance live pages now load in the user-opened browser. Coach rebuild discovered4sessions; Parent verified totals and individual session minutes now load. This is live behavior evidence with a private screenshot, not completed four-combination visual comparison. Shared family copy encoding corrected.
- [x] Pass full bun run check with174tests/29files; complete live fictional Parent form submission, Coach acceptance and reactive receipt status. Empty event selection rejected; all medication choices initially unselected. Correction/re-sign/paper/export and visual matrix remain open.
- [x] Publish and remotely verify permission checkpoint11d04d2; update draft PR10. Final badge-only CSS correction verified in the live receipt screenshot after the full check.

### Active financial integration evidence — October 13
- [x] Verify focused reader behavior: pending financial jobs withhold totals; older charges/history remain paginated and access-controlled beyond 500 ledger entries.
- [x] Verify focused report rebuild and application boundaries against the new financial projection contracts.
- [ ] Finish and review every financial writer, durable operation, fundraiser posting/correction/history and all related regression migrations before full validation and development synchronization.
- [ ] Rehearse these financial changes live and compare their finished screens to the prototype in all required viewport/theme combinations.

### October 13 financial integration verification update

- Whole Team regression coverage passes 10/10 with rebuilt source balances and scheduled allocation across 100 upcoming events.
- Full serial suite reached 187/193 passing across 34 files. Six failures identified legacy financial fixtures in withdrawal and travel tests; this is not a passing full checkpoint. Travel fixture migration subsequently passed with financial-reader and app tests (17/17 combined). Withdrawal migration remains assigned to the financial implementation owner.
- Astra review identified immutable retry identity, partial-operation audit accuracy, and gross-only fundraising timestamps; corrections are in progress. Readiness now refuses to claim completion when event evidence exceeds its supported read bound. Financial detail queries cap native page read budgets.
- Development client type generation succeeded. Financial application synchronization, reviewed Git publication, live financial rehearsal and prototype visual comparison remain pending. G1–G7 remain open.

October 13 10:00 update: all 194 tests across 34 files, lint, strict types and build passed. Withdrawal and travel fixture migrations are now verified. Financial code is awaiting final Astra review, development synchronization and live/visual rehearsal; none of G1–G7 closes on automated evidence alone. Subsequent finance first-page loading guard passed typecheck and scoped lint.

October 13 10:08 publication/live update: financial checkpoint b66450d is verified on the remote development branch and synchronized to dev:third-bandicoot-18. Astra cleared the incremental source review. The additional fundraising grant-revocation regression passes (four fundraiser tests). Corrected fictional permission replacement accepted by Coach and reflected as Accepted in Parent coverage/history. Original corrected receipt remains separate. Re-sign/paper/export, financial rebuild/rehearsal and visual matrix remain open.

Progress estimates toward visual-approval readiness (scope estimates, not checked-box arithmetic): G1 85%, G2 55%, G3 90%, G4 85%, G5 80%, G6 55%, G7 50%; approximately72% overall. All seven outcomes remain open.


October 13 follow-up: missing-account finance preparation fix passed eight backend tests, UI preparation guards passed typecheck/lint, and development sync succeeded10:21:13. Team overview now includes genuine Gross Raised and incoming transfers; pending fundraiser source reversal progress is explicit. Seven focused UI tests pass. Live Coach rebuild verification and follow-up publication remain pending.

October 13 live financial rebuild now verified: Coach can open Finances, start report rebuild and view loaded synthetic totals/history. Unknown legacy gross proceeds remain explicitly unavailable. Remaining: actual fundraiser posting/held-retry browser journeys and phone/desktop light/dark comparison; administration/season/retention work remains open.

### October 13 progress report during parallel administration work

- [x] Publish and remotely verify financial recovery checkpoint `f9282db`.
- [x] Rehearse fictional fundraiser posting in the Coach browser: $10.01 gross produces $2.51 team proceeds and $7.50 student travel credit; one committed, zero held, completed history visible.
- [x] Identify and locally fix the fundraiser posting form's missing explicit submit type; scoped lint passes and the posting journey succeeds. This fix is not yet a published checkpoint; retry behavior remains to be rehearsed.
- [ ] Complete parallel charge correction/cancellation and fundraising-to-team implementation, focused tests, Astra review and integration. Current source changes are work in progress, not synchronized or accepted.
- [ ] Finish shared fee priorities, season transition/carryover and retention preview/holds, then remaining live role and visual evidence.

Checklist-linked estimates remain G1 frontend 85%, G2 visual evidence 55%, G3 Whole Team 90%, G4 dashboards 85%, G5 accounts/permissions 80%, G6 administration 55%, G7 final verification 50%: approximately 72% toward readiness for user visual approval. These are scope estimates, not checkbox counts or production readiness. All seven broad outcomes remain open. Ordinary Mentor verification still requires the authorized test account's onboarding/sign-in; real signing, production, main merge and automatic deletion remain gated.

October 13 continuation: fundraiser submit fix published and remotely verified as04c14d7. Parent live view reconciles gross raised1001 cents, travel share750 cents and available fundraising750 cents; team portion does not enter student balance. Phone dark top inspected at390x844; remaining themes/lower states stay open. Current charge/team-transfer types generated and strict typecheck passes; source review/tests remain in progress, no full application sync claimed. Timeclock coordinator notified to continue authorized verification.

### October 13 reviewed charge and team-transfer slice
- [x] Implement source-preserving single-charge adjustment/cancellation with immutable original obligation, bounded release jobs, reasons, history, stale/replay guards and Coach-only corrections.
- [x] Implement fundraising-to-team recording with original-source lineage and explicit team destination; personal payments and gross proceeds are not converted or invented.
- [x] Integrate charge detail/history/progress/retry and exact-cent previews into Finance; preserve readable evidence while balances update and distinguish original versus effective amounts in withdrawals.
- [x] Resolve Astra findings for native pagination, archived-event correction/retry restrictions, exact-cent range/display and source-release progress labels.
- [x] Pass full check216/216 across38files, lint/types/build; final affected backend8 and UI9 tests plus scoped lint pass. Timeclock lint/types/build passes.
- [x] Synchronize reviewed source to dev:third-bandicoot-18 at10:54:14. No production deployment.
- [ ] Complete new charge/team-transfer live journeys and prototype visual comparisons. Shared fee priorities/bulk fees, historical correction mode, season transition/carryover and retention controls remain open; no G1–G7 completion follows from this slice.

### October 13 checklist-linked progress checkpoint

Current estimates toward readiness for user visual approval: G1 frontend 85%, G2 visual evidence 55%, G3 Whole Team 90%, G4 dashboards/attendance 90%, G5 accounts/permissions 80%, G6 administration 65%, G7 final verification 55%; approximately 74% overall. These are scope estimates, not checkbox arithmetic or production readiness. Earlier estimates are historical; all seven outcomes remain open.

- [x] Publish reviewed charge/team-transfer checkpoint `1c55fc5` to the development branch (remote verification recorded at publication).
- [x] Verify a fictional fundraising-to-team transfer live: available credit decreased by the recorded amount, original gross proceeds and earned travel share stayed unchanged, and the operation completed with readable history. This records a transfer; it does not execute a bank payment.
- [x] Verify live charge correction/cancellation and the held fundraising-reduction preview. Durable failed-job retry and remaining negative journeys stay open.
- [ ] Finish shared season fee priorities and bulk fees. Sol backend and UI implementation continue in parallel, with Astra review required before integration/synchronization.
- [ ] Finish season carryover, retention controls, remaining account/permission journeys, ordinary Mentor access and the visual matrix.

Last integrated validation remains 216 tests across 38 files plus lint, types and build at the reviewed charge/team checkpoint; newly developing shared-fee work is not covered by that result. No production deployment or main merge.

October 13 live policy check: a fictional attempt to reduce a previously transferred fundraising award was held at preview. The UI explained that original credit was spent/transferred, disabled posting and retained committed gross/team/travel amounts. This verifies the preventive preview; no held posting job was created and worker retry is not claimed. The draft returned to the committed amount afterward. Private evidence remains outside Git.

### October 13 live charge correction and prototype checkpoint

- [x] Rehearse a fictional fully funded charge reduction and cancellation: original $2.00 preserved, adjustment -$0.75, cancellation $1.25, final effective/applied/due all zero; $2.00 total returned to the same fundraising source and both reasons retained.
- [x] Verify transferred fundraising-credit reduction is held at preview, with posting disabled and committed totals unchanged. This does not claim worker retry coverage.
- [ ] Align Coach Finance with the freshly rendered prototype: primary team-wide student table, grouped record/add/bulk/import/export actions, shared fee order and recent changes. Current aggregate cards and one-student selection are not a substitute for that layout. Source-separated row/report/import contracts remain required.
- [ ] Complete the independently assigned non-destructive retention review and hold workflow; no deletion functionality is authorized.

Overall scope estimate remains approximately 74%; the new successful financial rehearsals do not close the remaining visual/administration scope. Timeclock concurrent Group rehearsal awaits its existing authorized operator sign-in; physical-device testing still needs a reachable approved origin. Sol agents continue shared-fee backend, shared-fee UI and retention modules with separate ownership. Last full integrated check remains the 216-test published checkpoint, not a claim about unfinished new source.

### October 13 permission rehearsal and parallel review checkpoint

Checklist-linked scope estimates remain G1 85%, G2 55%, G3 90%, G4 90%, G5 80%, G6 65%, G7 55%; approximately 74% toward readiness for user visual approval. These are estimates, not checkbox arithmetic or production readiness. No broad outcome is closed.

- [x] Verify a new signature request, Parent replacement submission and Coach acceptance using fictional records; earlier receipts remain separate and unchanged.
- [x] Verify default manifest export omits full snapshots/health, while separately selected health export includes the snapshot. Downloaded files remain private and outside Git. This does not prove every role/grant variant.
- [x] Verify fictional paper recording and Coach acceptance, including distinct signer/recorder, signed/recorded times, record reference and explicit medication choices. Real consent remains disabled.
- [x] Complete incremental Astra source review of retention preview/holds after stale-reactivation and pagination fixes. Owner-reported 11 focused tests, types and lint pass.
- [ ] Mount retention controls, integrate the shared-fee contracts, run combined validation and synchronize reviewed development source before live/visual checks.
- [ ] Complete Coach Finance prototype structure, shared fees/bulk operations, remaining accounts/roles, season carryover and visual matrix.

Shared-fee backend and UI continue in parallel. Bulk preparation will preserve an immutable paginated review scope before committing financial changes. Last full integrated result remains 216 tests at the published charge/team-transfer checkpoint, not verification of the unfinished shared-fee/retention wave.

October 13 follow-up: retention route connected under Coach Admin with a local query retry boundary; Astra integration review clear, 11 focused tests/types/scoped lint pass. It remains unsynchronized and live/visual unverified. Permission exports now show truthful completed collection/download-request feedback, verified live after five collector tests and review. Shared-fee work resumed after usage reset; isolated Mentor/Travel profile completion assigned in parallel. No change to overall 74% estimate.


October 13 visual continuation: restored Parent Attendance metric-card hierarchy and shared child-context bar; source-reviewed, scoped lint/types and4existingreport/draft tests pass. Inspected phone light/dark and desktop dark against rendered reference, plus live desktop light. Rejected stale resized reference capture; full matrix remains open. Explicit remaining report contracts: Offseason/Build-season separation and Outreach categorization. Adult own-profile/reconciliation is now in isolated implementation; fee backend/UI source review underway. Overall estimate remains74%.


- [x] Verify live zero-fee Whole Team event creation through all six wizard steps: all six active fictional students automatically confirmed. Native date entry works through the date control. Later-member live addition and four-combination states remain open.
- [x] Agree build season begins on the official FIRST kickoff day automatically; current2027 date/source verified. Calendar helper implementation assigned; attendance grouping is not yet complete.

Shared-fee Astra review found recovery/mapping/cancellation issues under correction; no source clearance or development sync is claimed for that wave. Adult profile reconciliation/audit fixes are ready for rereview. Production and automatic deletion remain unauthorized.

## Current progress report - October 13, after administration publication

Approximately76% toward readiness for user visual approval. Scope estimates, not checkbox arithmetic or production readiness: G1 frontend85%, G2 visual checks55%, G3 WholeTeam90%, G4 dashboards/attendance90%, G5 accounts/permissions85%, G6 financial/season administration70%, G7 integrated verification60%. All seven remain open. This supersedes earlier progress estimates.

Completed incremental evidence: reviewed fee/profile/retention source published0319966, handoff4beb330 remotely verified; development synchronized12:30:56; full266tests/48files lint/types/build pass, final13UI and1backend focused tests pass. Live explicit historical lunch mapping preserved charge1000/applied100/due900cents and reduced ambiguous queue by one. Mentor profile/retention complete live/four-view rehearsal still pending.

Active: source-separated Coach financial table and change feed backend; table presentation4focused tests pass and Astra presentation review is clear, but it is not integrated/live. Recent-change presentation2focused tests pass; Astra review is pending. Season transition contract drafted. Latest Coach correction supersedes family-authorization requirement: departing funds normally non-refundable; Coach records any team transfer with audit, family can request exception, actual cash/check refund separate. No automatic transfer merely from archiving.

Remaining before visual approval: full conditional phone/desktop light/dark comparisons; later-join/reactivation WholeTeam live check; ordinary Mentor-only access; new fee/profile/retention live workflows; attendance kickoff/category report integration; financial table/feed/export, historical corrections and season carryover; final combined rehearsal and Astra review. Production remains separate.

October 13 scope audit: verified the active goal still explicitly requires all G1-G7 through readiness for user visual approval. Current financial backend work is part of G6 and supports G1/G4; it does not replace the visual queue, role rehearsal, attendance integration or season transition requirements. Sol reports28focused v4 backend tests passing; feed/backfill remains in progress and unsynchronized. Overall estimate stays76%; all seven remain open.

October 13 Finance presentation checkpoint: Astra cleared unmounted table and history components after recording-time progress wording, method-neutral refund wording and actual nullable coverage dates were corrected. Eight focused tests across two files and scoped lint pass13:00:44. Live query integration, full backend review and four-view prototype verification remain open; no G1/G6 closure.

- [x] Rehearse reasoned shared-fee priority reorder with fictional records; confirm new order and unchanged previously applied amounts/team balances. Both ambiguous historical mappings resolved explicitly.
- [ ] Complete shared-fee bulk/held recovery live checks and the required four-view comparisons. The priority rehearsal does not close the full administration/visual scope.

October13 in-progress integration: unmounted Finance wrappers preserve native20-row pagination, independent query recovery and server history-preparation permissions. Eleven focused UI tests pass13:07:01. Wrapper review and backend freeze are pending; no runtime integration claim. Season-scoped identity helpers/tests advance independently under Sol ownership without switching current callers.

October13 integration verification:12focused Finance UI tests pass. Full lint/types pass; integrated tests286/288 with two500-member5-second timeouts. Both files pass isolated21/21; do not call the full suite green or claim build completion. Astra backend findings remain under correction, including legacy-job continuation and complete history coverage. Timeclock season-cutover requirements recorded; no G1-G7 closure.

### Completion-first process adopted — October 13

- [x] Add mandatory completion-first policy to AGENTS.md and docs/COMPLETION_WORKFLOW.md: usable workflow milestones, concrete blocking criteria, batched reviews/tests and less context churn.
- [ ] Deliver the connected Finance workflow and its necessary evidence before optional polish. All seven goal outcomes remain open.

### Connected Finance milestone — October 13

- [x] Integrate the source-separated Coach account table, guarded account preparation, named payment dialog, independent query recovery and readable historical feed with fee identity. Astra batch review clear; synchronized development13:21:10.
- [x] Verify all six fictional accounts prepare without changing balances; historical coverage completes with real timestamps and identified fee-order changes. Verify a fictional one-cent payment updates the row and team totals, with submission/close guards and success feedback.
- [ ] Complete Finance responsive reference comparisons and account-detail action rehearsal; scoped export/import/payment corrections remain required.

Full integrated289tests/54files lint/types/build passed before final refinements; final13UI tests, strict types, scoped lint/build and owner9backend tests after refinement pass. Bundle-size warning remains a follow-up. This completes a connected slice, not G1/G6/G7 in full.

October 13 completion-first batch in progress: scoped Finance export backend and in-memory collector implemented; four collector tests pass. Download UI, consolidated review, live rehearsal and publication remain pending. Finance account/fee sidebar hierarchy updated in source, visual checks pending. Season-link migration is under review; current Parent access has not switched. No G1-G7 completion claimed.

October 13 export integration: CSV/manifest controls connected, including local retry and cancellation. Full lint/types/304 tests/production build pass; build bundle warning remains follow-up. Astra backend/collector review clear and both final UI corrections applied. Desktop dark Finance hierarchy/spacing visually inspected at actual1440x1000; phone/light/lower controls and live export remain pending. Development sync is in progress; no G1-G7 closure.
Development export/link synchronization completed13:42:46. Live migration and export rehearsal remain pending; Parent consumers have not switched.

October13 live Finance export: all six fictional active members prepared; downloaded CSV has four charge rows and exact totals matching the screen (4000cents effective,3101personal applied,899due). Manifest/selected scope/error/cancel live checks remain open. Coach settings now mounts the reviewed-backend family-link maintenance UI; UI review and live migration pending. Season draft/roster UI proceeds in parallel.

- [x] Development family-link maintenance: Coach UI completed both passes with zero unresolved links; Parent consumer cutover remains in progress.
- [x] Finance export manifest rehearsal: all six fictional members retained, including zero-charge members; four charge records reconcile with CSV. Selected scope and remaining visual cells stay open.

Historical 14:04 milestone: October13 Coach direction was to complete functional workflows with essential risk-based verification. Representative visual coverage replaces exhaustive state/viewport permutations; no new test-count target. Season draft/roster source review cleared; integration and remaining transition steps continue.

- [x] Integrate reviewed season-scoped Parent roster/selection/retry and Coach season draft/returning-roster screen. Development sync14:04:07. Lint/types, unaffected suites, corrected invitation suite and build pass. Full season activation/carryover remains unfinished.

- [x] Implement local Timeclock transition guards: pause new sessions, clock-in/transfer/extension/correction and Calendar changes during transition; preserve clock-out and scheduled closure. Affected Timeclock/calendar checks and scoped lint pass. This historical root-only checkpoint preceded the combined season sync recorded below; it does not complete G6/G7.


### October 13 six-step season candidate checkpoint

- [x] Complete all six Coach steps, saved confirmation decisions, source-separated carry/hold/team choices and per-charge carry/write-off reasons.
- [x] Implement durable progress, pre-application return-to-review and resumable application; preserve original student/account/session IDs and historical evidence.
- [x] Integrate automatic target allocation, monetary pair verification, shared writer locks, revocation preservation and Timeclock/calendar cutover fences.
- [x] Astra review the coherent source batch; integrated lint, strict types and 319 tests passed. Build passed after the root encoding correction; development synchronization completed 14:21:33.
- [x] Publish the reviewed season batch: `214cdfb`, pushed and remote verified; draft PR10 updated.
- [x] Narrow live Coach smoke: `/season` loaded six-step navigation and the new-season form, with Save disabled until input. Current `2026–27 Development` remained unchanged; no draft save or activation was attempted.
- [ ] Rehearse the synchronized season candidate with synthetic data and complete representative visual comparison. No live activation has been performed.
- [x] Implement and source-review historical roster/attendance and supported prepared-account charge corrections; published and development-synchronized. Linked balances remain held.
- [ ] Complete scoped live historical-correction journeys and representative visual checks.

These implementation and verification claims do not close G1-G7, authorize production or imply live cutover approval.

### Outreach naming decision — October 13
- [x] Agreed: events with Outreach in their title are outreach events (case-insensitive).
- [x] Connect title-based outreach classification to attendance reporting in local source; review passed. Combined sync/live evidence remains below.

### Published payment/attendance/historical candidate — October 13
- [x] Implement and source-review kickoff-based Offseason/Build reporting with existing weekday rules.
- [x] Implement and source-review Outreach title classification; old unclassified projections require the existing report rebuild.
- [x] Implement and source-review Coach historical attendance correction with expiring access, original evidence, audit and retry protection; focused check verifies report rebuild completes.
- [x] Complete combined validation, Astra source review, publication and development sync for the supported batch.
- [ ] Complete remaining payment/historical live journeys and representative visual evidence.
- [x] Implement, source-review, publish and development-synchronize payment bulk/CSV entry and source-preserving receipt corrections; live entry/correction evidence remains pending.
- [x] Implement, source-review, publish and development-synchronize historical roster name/subteam corrections with Coach-scoped access and before/after audit; live correction evidence remains pending.
- [x] Implement and source-review supported prepared-account historical charge corrections; development sync complete. Linked financial records remain held under the approved contract.

October13 batch verification: integrated lint/types/324tests/build passed, Astra cleared payment/attendance/historical attendance/roster, and development sync completed14:43:39. Publication subsequently completed in `687f2bf`; latest supported follow-up is `ba7477f`. Remaining live/visual evidence is scoped below. No season activation or production deployment occurred.

### Build meeting naming decision — October 13
- [x] Agreed: titles containing Build identify Build meetings; calendar dates distinguish weekdays from Saturdays. Case-insensitive title matching and team-local calendar dates apply.
- [x] Implement/source-review/publish Build weekday/Saturday counts using Chicago calendar dates; development sync 14:54:21 and existing coverage rebuild completed. Outreach remains title-classified; Sunday Build meetings stay separate.

Historical finance candidate: prepared archived accounts without downstream carry/transfer lineage support audited charge correction/cancellation and source-preserving reallocation. Focused checks and Astra review pass; published in `ba7477f` and synchronized at 14:54:21. Linked balances and legacy unprepared projections remain held and are not claimed complete.

October13 historical-finance/Build checkpoint: scoped implementation and Astra review complete; focused checks/types/build pass; development sync14:54:21. Supported archived charge corrections preserve source/audit evidence. Linked financial records remain held under the approved contract, not silently changed. Published in `ba7477f`, remote verified. Scoped Parent report readiness is verified below; remaining payment/historical/season live and representative visual evidence stays open. Prior synthetic signing/resigning/paper/export evidence is accepted and should not be repeated.
- [x] Publish reviewed Build/historical finance checkpoint ba7477f; remote verified and draft PR10 updated.
- [x] Run Coach development attendance coverage rebuild:4sessions processed.
- [x] Observe Parent phase/Build/Outreach cards after coverage rebuild: updated 2:56 PM, loaded without updating/retry. Switching two existing fictional children changed session totals (one-minute rehearsals versus zero). This is scoped report/child-context evidence, not full G4.
- [ ] Verify no-linked Parent context and remaining authorized role journeys; complete representative visual acceptance.

October 13 live season draft rehearsal: all six fictional roster decisions saved, five returning profile reviews saved, reset boundaries saved, one unpaid charge disposition and six available-source dispositions visible in Confirm. No transition activation or financial application yet. Confirmation exposes raw internal choice labels; a bounded shared-copy correction is in progress before visual approval.

Season confirmation wording correction: shared readable labels implemented and browser-verified; scoped lint/typecheck passed and Astra cleared the two-file change. Coach explicitly approved synthetic activation after open-session/lock checks; activation remains pending preflight.

October 13 live season activation completed with explicit Coach approval and clean development preflight (zero open sessions/occupied locks/dangling intervals/financial conflicts). Old season is locked with six preserved historical students; five returners and existing Parent links carried to new season. Held departing sources preserved. Remaining balance/history correction and visual checks still gate full G7 closure.

October 13 readiness/historical checkpoint: future activation now initializes zero financial summaries and empty attendance coverage. Astra cleared both fixes; focused existing transition checks, lint/types/build passed; dev sync completed15:20:40. Current synthetic projections repaired via Coach maintenance. Historical roster correction saved live under timed Coach access; separate current-season profile verified unchanged, then access returned to read-only. Full G7 still requires remaining scoped historical/visual checks.

October 13 payment rehearsal: CSV import recorded one simulated cent with exact account match and All receipts recorded status; team available funds rose by one cent. Receipt correction previewed and saved zero effective value while preserving the original receipt and separate correction history; totals returned exactly to the prior values, no payout. These live G6 substeps are complete. Selected-account export prepared one member and reported download requested; browser download observation timed out and no resulting file was verified, so final download remains open.

- [x] October 13 live historical attendance correction: Coach saved an audited replacement in the archived synthetic season; original interval and earlier correction stayed visible, success disabled duplicate submission, and correction mode returned to read-only. This closes the supported historical attendance rehearsal substep; historical charge correction remains open.

- [x] October 13 Coach roster archive/reactivate controls: implemented using existing backend, scoped lint/types pass and Astra cleared. Live synthetic member archive changed active count 5 to 4; a future zero-fee Whole Team event included four. Reactivation restored active count to five and automatically added the member exactly once to that event. Account sign-in lifecycle and rearchive retention remain separate pending evidence.

- [x] October 13 retention preview/hold rehearsal: rearchived a fictional current-season profile, observed its archive and five-year review date, placed and released a reasoned hold with both audit entries visible, and restored the profile active. Deletion stayed disabled. Existing latest-archive regression evidence supports timestamp-reset semantics; the UI displays calendar dates only.

- [x] October 13 selected-scope Finance export: actual downloaded JSON manifest verified with selected scope, one expected fictional member, zero charges, scope hash and collection bounds. The earlier missing-file claim was a CSV-only search limitation; no export code change or repeat needed.
- [x] October 13 supported historical financial correction: isolated development-only archived fixture, original one-dollar charge retained, effective and paid amounts corrected to ninety-nine cents, one cent released to personal available funds, zero due, no payout. UI reported reconciliation and correction access returned to read-only. Existing transferred-source account correctly refused the same adjustment. Helper guard/idempotency suite five cases, scoped lint/types and Astra review passed; development sync 15:54:24.

- [x] Record the Coach's hosted-reference clarification: use the public prototype for visual styling, preserve added features and later decisions, and flag conflicts instead of deleting functionality. Project instructions now enforce this boundary.

- [x] Finance phone payment action now matches the hosted prototype's full-width primary Record payment treatment; rendered verification and Astra review complete. Existing financial functionality and desktop controls preserved.

- [x] Representative phone-light inspection of lower Finance import/review, source totals, export explanation and history cards completed. No additional financial transactions or tests needed; account-details/sidebar and role boundaries remain separate.

- [x] VC-006 Coach Finance representative presentation closed after Astra evidence reconciliation; independent Travel grant checks remain open.
- [ ] Restore the complete Coach roster-to-student-record workflow: record links, truthful account status, financial balance, next-event readiness and missing-information summaries/filtering. This concrete gap was confirmed against the selected prototype; preserve existing membership controls and role boundaries.

## October 14 current pause checkpoint (supersedes older pending notes above)

- [x] Approved original one-page PDF implemented, sanitized, source-reviewed, focused/integrated validated, and development-synchronized. Form and language already approved by the Coach.
- [x] Student required setup and locked-room correction; lower Parents page inspected.
- [x] Ordinary Mentor invitation acceptance, profile save and participation-only report.
- [x] Travel Lead Reports filtering/detail presentation.
- [x] Independent finance/health grants and revocation; original permissions restored.
- [x] Readiness detail and actual browser printable summary; white margins and truthful Draft status verified.
- [x] Select approved template and verify Parent review/signature, Coach acceptance and preserved old receipt on the live integrated version.
- [ ] Room invitation/deadline and withdrawn-room recovery; paid-withdrawal consequences; no-linked Parent.
- [ ] Manual PDF/CSV delivery, finite page-by-page production-language pass, final G1–G7 review and visual-approval candidate.

User resumed under COMPLETION_PLAN.md; no replacement goal tracker needed. Changes remain local until the reviewed checkpoint is published. All separate production/real-signing/merge/deletion gates remain.

October 14 visual-review follow-up: [x] Join/waiting screens offer Sign out for wrong-account recovery. Live Join-page sign-out returned to Google sign-in; scoped lint/types passed. No role or backend changes.

## October15 bounded account-free rehearsal
- [x] Isolated second-Parent reuse, adult FIRST reporting, unrelated-Parent denial, Competition verify/reopen, invitation identity and source-preserving retry checks passed.
- [x] Join/Waiting/processing render checks passed; no live state was manufactured.
- [ ] Remaining visual fixture check and owner visual approval; fresh Google login per simulated identity is not claimed.

- [x] October16 targeted pass: existing-account Google sign-out/return and isolated missing-state previews completed; see VISUAL_CHECKS F1-F6.
- [ ] Reviewer acceptance of new isolated states; live Join/Waiting sign-out remains unobserved, production-origin sign-in remains a launch check. No additional accounts required for this visual pass.

- [x] October16 bounded-review wording/spacing items1-4,6-10; typecheck/build/scoped lint passed. Item5 reopened-specific explanation deferred pending explicit client state; no scope expansion. See VISUAL_CHECKS.

- [x] October16 explicitly authorized item5 followup: FIRST reopened explanation for Parent/adult Student, minimal derived flag; focused checks and review passed, development synced. Supersedes prior deferral; existing records/rules preserved.

- [x] October16 owner visual-cycle closure and fresh independent Astra handoff review; no blocking findings. Current launch queue: ONLINE_READINESS_HANDOFF.md. Historical owner-approval/fixture-recheck boxes above are superseded; evidence limits retained.

- [x] October16 local launch-preparation batch: integrated Timeclock frontend, focused read reductions, guarded production signing and first-Coach procedure; focused validation and final Astra review passed. See LAUNCH_PREPARATION.md. No deployment/push or live changes.
- [ ] Launch configuration, billing/backup decision, recovery drill, ownership/origins and physical-device checks remain open; production authorization still required.


### October 18 approved test-role checkpoint

Production release `8c22d50` is deployed; immutable tag `v0.1.0-onboarding.1` verified remotely. Owner approved all four test-role grants. Mentor Google login, invitation acceptance and live role dashboard verified. Travel Lead invitation created with financial editing and health export disabled; account-holder Google password entry remains necessary. Student Google login, Coach approval and own setup screen verified; Parent invitation created for that synthetic Student, acceptance pending. Exact invitation and Mentor account identifiers are in the ignored private ledger; no emails, cleanup or real signing executed. Owner confirms Timeclock works on phone; Chrome ERR_BLOCKED_BY_CLIENT remains a local, unidentified blocker. This supersedes earlier pending-release/access-approval statements.

- [x] Investigate and implement explicit root destination for ordinary Google sign-in after observed stale invitation redirects; scoped lint/types/build and independent source review pass.
- [x] PR13 approved/released; both website builds succeeded; fresh Travel Google login returned directly to root dashboard. Travel invitation accepted and permissions verified.
- [ ] Finish Parent Google login and invitation acceptance with honest relationship-authority handling; authenticated Timeclock footer evidence remains open.

- [x] Production Parent Google login and synthetic invitation acceptance, explicitly approved simulated relationship/attestation logged privately.
- [x] Production Timeclock Mentor Google login and authenticated footer verified.
- [ ] Complete existing production family-link readiness setup through Coach maintenance and verify Parent dashboard. Add sign-out recovery to setup-error screen; no season guard bypass.


### October 18 controlled onboarding verified

- [x] All requested actual Google identities/roles established; Parent own synthetic child setup/dashboard verified after Coach family maintenance complete with zero unresolved.
- [x] PR14 recovery control released and used successfully; both website builds verified. Mentor Timeclock signed-in footer verified.
- [x] Private current synthetic inventory refreshed (38 selected rows, <=40/table); permanent Coach/season/family readiness protected. Test accounts retained; no cleanup executed.
- [ ] Broader rollout: actual FIRST link, calendar freshness, physical multi-device concurrency/reconnection and owner enrollment opening. Backups/recovery deferred; real signing disabled/separately gated. Earlier pending account-recovery checks are superseded by this checkpoint.


## October 18 final configuration and owner deferral

- FIRST invitation saved through actual Coach Settings from previously supplied private owner inputs; exact production match verified. Permanent setting retained in private preservation ledger.
- Calendar sync verified fresh (44 seconds old), no error; read-only verification.
- Owner explicitly defers physical clock-in concurrency/reconnection testing until later; it does not block rollout. No synthetic event or attendance was created.
- Account/footer development goal complete with these accepted boundaries. Real signing remains disabled; backups/recovery deferred; test records intentionally retained with exact cleanup ledger. Enrollment timing remains the owner’s operational decision.

## Local rehearsal alignment — October 18

Owner requested updating local development only. Freshly fetched origin/main is 68179f77212aef7c4f177b333271156389868a2d; local application/backend/dependency source matches that release exactly. Newer local differences are handoff documentation only. Existing dev:third-bandicoot-18 synchronized successfully with Convex typechecking; no reseed, reset, production sync, credential copying, or production configuration changes. Student Status local settings already target development; added ignored apps/timeclock/.env.local with the same public development endpoint. Existing development records remain separate from production. Google login and role preparation for the final rehearsal still require a fresh browser check; this synchronization does not claim that check passed.

Validation: both application TypeScript checks and local Vite builds passed. Student Status retains its existing large-bundle warning; no build failure. No source change or repeated full test suite was needed because application source matches the already-reviewed release.

## October 18 development reviewer data

Owner-authorized development-only enrichment and private reviewer guide/index completed. Reviewed fixture, three focused tests, lint, typecheck/dev sync and exact saved-data checks passed. See DEVELOPMENT_REVIEW_DATA.md. Existing identities/history preserved; production unchanged. Google browser acceptance, physical device checks and cleanup are not implied by data availability.

## Bulk Invite local candidate - October 18

- [x] Coach-only template, upload preview, duplicate decisions, idempotent creation and code downloads.
- [x] Individual-code linking, replacement/revocation, expiry and normal member records.
- [x] Server-side Membership connection filter; preserve general signup.
- [x] All 436 synthetic tests, lint/types, Timeclock checks, and isolated component phone/desktop check; see BULK_INVITE.md for evidence limits.
- [ ] Live development Google-sign-in rehearsal.
- [ ] Separate approved production release (not authorized in this task).

- [x] October 19: five-digit Bulk Invite / six-digit Coach team-code separation; collision and cross-workflow tests, local build, development sync, and Coach browser generation verified. Real Google redemption deferred by owner; production unchanged.

- [x] October 19 local revision: Coach approval required before Bulk Invite account connection; no preapproval data access; competing approvals, 100-student import, daily limits and stale-request retry tested. Student/Coach component workflows tested in isolated browser.
- [ ] Owner-authorized backend sync and live integration rehearsal of approval revision (explicitly not deployed).

## October 19 — local sign-in chooser
- [x] Student and Parent or team staff entry choices with Back navigation and existing visual language.
- [x] Google-only student path; approved adults may use Google or email.
- [x] Adult invitation email authentication preserves explicit acceptance; server denies student bypass and pending-approval race.
- [x] Automated checks, independent review and development backend sync.
- [ ] Coach acceptance and real-inbox email sign-in (development mail remains disabled).
- [x] Owner authorized production release; backend deployed without record mutations. Website checks tracked on release PR.

## October 19 - Mentor/Staff invitation wording

Owner authorized development and production publication of frontend-only invitation copy. Heading is Invite Mentor/Staff; Email address and instructions describe Google or email-code sign-in using the invited address. Landing and account-mismatch copy agree; link creation is distinguished from sending an email. No auth logic, backend, records, credentials or settings changed. Focused lint, application typecheck/build and live local heading/instructions checks passed. Exact production merge/build and live verification are recorded on the release PR.

## October 19 - Mentor/Staff invitation email (development)

Implemented Send invitation with private emailed links, accurate delivery status and guarded resend; removed public copy-link return/UI. Existing invitation acceptance remains explicit. Development third-bandicoot-18 synced with optional fields/additive index; sending remains disabled, no real messages or production writes. Independent review clear; 535 tests in101 files passed and focused31 account/mail tests passed. See [workflow and verification](ADULT_INVITATION_EMAIL.md). Real-inbox delivery and production promotion remain unverified/unreleased.


Staff setup follow-up: development sync/types/build/lint passed; actual signed-in localhost Step 1 and both skip options observed. No profile or preference saved for the user. Coach review pending. Full-suite fee-history timeout recorded separately in STAFF_SETUP_WIZARD.md.

Staff setup now has an optional Driving step before review, shared contact phone, vehicle/seats/trailer capability and Skip driving step preserving existing driver approval. Requested extra informational paragraph removed. Focused17 tests, source review and desktop/phone synthetic browser checks passed; see STAFF_SETUP_WIZARD.md. Development only.
