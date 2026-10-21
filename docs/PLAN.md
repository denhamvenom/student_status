# Student Status implementation plan

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


## Linked Calendar production release (PR21)

Implemented event create/link, Media Support Requested, linked title/schedule/location/cancellation sync, conflict recovery and permission/cancellation safeguards. Development and source/synthetic verification passed. Calendar editor sharing verified; development Calendar writes explicitly prohibited and blocked in code. Production backend deployed and Calendar connection enabled under explicit owner authorization. Production authentication and writer access verified without Calendar changes. Exact website build outcomes are recorded in PR21; real-event end-to-end saving remains unperformed. See [scope and evidence](EVENT_CALENDAR_SYNC.md).

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

## October 19 parent email invitation candidate

Owner approved local implementation of automatic parent invitation email and native Share invitation, retaining exact invited Google-account sign-in. See [scope, configuration and evidence](PARENT_INVITATION_EMAIL.md). This work does not authorize backend synchronization, production email, or a main merge. Bulk Invite's earlier release remains unchanged.

## October 19 charge review wording

Implemented frontend-only simplification: View charge details; Review students and charges; explicit eight-character Reason input guidance; student names, planned/current amounts and readable saved/pending/review status replace internal revisions and processing counters. New unposted charges no longer produce false load errors. Missing existing charges still need review; held rows retain their explanation. Partial money release amounts and all confirmation/retry safeguards remain. No backend or production data changes.

Validation: integrated lint/typecheck, 425 tests and build passed (existing bundle-size warning); final held-row wording refinement passed 14 focused tests and source lint. Independent review found the held-row case and it was corrected. Rendered-markup evidence only; fresh authenticated browser/phone/theme comparison remains pending. Development checkpoint only; production publication is not included in this change.


## October 18 production changeover completed

Owner-authorized production cleanup and release completed. Application source `09289d4` was pushed to the development branch, deployed to Convex production `amicable-eel-413`, and merged through PR15 as `d3d2e9e368dbbb52d6031ebae0dc5007c11f356b`. Both production websites built and deployed that merge successfully; its tree exactly matches the reviewed source.

The verified permanent Coach is the sole remaining application user and Google auth account. All four other accounts/sign-ins, the one synthetic student and their reviewed dependencies were deleted atomically. Fresh snapshot checks found zero students, no remaining removed-identity references, no stored files and no report aggregate entries. Real season/FIRST/family-readiness settings, Coach identity and 63 calendar occurrences were preserved. Normal calendar sync timestamps advanced; configuration did not change. Credentials were neither changed nor exported. Private recovery exports remain ignored and outside Git.

Temporary cleanup switches and Coach-only maintenance restriction are removed. The old team join code was revoked and deleted; no replacement was created. Student Status and Timeclock public sign-in pages load; Coach backend access passes. The owner confirmed successful production Coach browser sign-in on October 18 and reported that everything looked good. Full student onboarding remains deferred by the owner to tomorrow; real signing remains disabled. Production needs no old-subteam conversion because there are zero student records.

The four stale tests are fixed. Full application check passed 423 tests before the final invitation regression; final maintenance suite passed 5/5 plus typecheck/lint. Timeclock checks and production backend compile passed. See [execution evidence](PRODUCTION_CHANGEOVER_2026-10-18.md). Earlier restrictions and pending-cleanup statements below are historical, superseded by this authorized release.

## Historical checkpoints (superseded where noted)

## October 18 Batch 4 workflow changes

Batch 4 implementation, independent review and role spot-checks are complete on `feature/development-review-fixtures-2026-10-18`. See [Batch 4 report](audit-2026-10-18/batch-4-report.md) and [copy inventory](audit-2026-10-18/batch-4-copy-inventory.md). Owner clarified the only selectable subteams: Build, Electrical, Machining, Programming, Business/Media. Owner explicitly deferred stored-record conversion; no production access or backfill. Final development backend sync, build/typecheck, source lint and 18 focused tests passed. Full suite before that last update: 412 passed, four existing stale assertions; full lint nine existing private-helper errors. Coach confirmation Cancel and staff Money tools/New event checks passed without shared-data writes. Parent Money/Home and event signup guidance checked. Student Home money, read-only independent travel, Whole Team leave confirmation and Cancel checked; participation stayed confirmed. This report accompanies the reviewed development checkpoint. Stop after Batch 4. No main merge or production rollout.

## October 18 plain-language audit

Owner approved the [master audit](audit-2026-10-18/master_report_2026-10-18.md), with development-only work and a stop/report after each batch. [Batch 0 facts](audit-2026-10-18/batch-0-findings.md) are investigated and published. [Batch 1 safe copy](audit-2026-10-18/batch-1-report.md) is implemented, including approved display formatting and pinned-test updates; role checks are recorded in its report. [Batch 2 sensitive-area wording](audit-2026-10-18/batch-2-report.md) is implemented and reviewed with unchanged safeguards and development-only message sync. [Batch 3 navigation/layout](audit-2026-10-18/batch-3-report.md) is implemented and reviewed, including the Coach draft-preservation browser check and targeted backdrop-dismissal fix. Travel Lead Join requests is included by explicit owner decision; New event stays in Batch 4. Stop before Batch 4. Stored values, consent source wording, financial/safety guards and production boundaries remain intact. Baseline lint/test failures remain explicitly distinguished from regressions; shared fixture repairs require separate data-write authorization.

Current production frontends are release `68179f7`; shared backend remains approved `8c22d50`. OAuth publication, five account roles, footer changes and family readiness are verified; see CURRENT_STATE.md and PRODUCTION_ONBOARDING_RELEASE.md. Real signing remains disabled. October 18: local source matches current main and development backend synchronized only to third-bandicoot-18 for the upcoming rehearsal.

## Frontend cleanup — owner decision October 17, implemented October 18

Consolidate About, Privacy and Terms navigation into one consistent, accessible footer in Student Status and Timeclock. Remove duplicate navigation links elsewhere, including sign-in/entry areas. Keep the existing public pages and direct URLs available without login; preserve any context-specific consent or acknowledgement required by a workflow. This supersedes the earlier repeated-link placement decision, not the approved policy content.

Queue this for the next frontend change batch. Verify affected signed-out/signed-in layouts at phone and desktop sizes, footer keyboard access and all three destinations. Use focused checks; no backend changes are needed. Status: implemented, independently reviewed and deployed through approved PR12; see the current release log. Controlled production account rehearsal and cleanup work are in [PRODUCTION_ONBOARDING_PLAN.md](PRODUCTION_ONBOARDING_PLAN.md).

## Historical planning and approval record

The following records earlier checkpoints; current status above supersedes pending/undeployed statements.

Execution complete October 17: owner approved setup and User Data Policy acceptance. Google project denham-venom-production created under Foundation; Denham Venom Production Web client serves both approved origins and exact amicable-eel-413 callback. Branding/support and production domains saved; only openid/userinfo.email/userinfo.profile declared. External/Testing verified; public URL fields await hosting. Creator admin has automatic Owner access, so no manual IAM grant was needed. Owner privately replaced production AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET. Both saved values were compared in memory against the new Google client and matched; no values were printed or persisted in documentation. Production dashboard shows both settings present with no pending Save. Development, Calendar, signing keys and PIN were not changed by this setup. No deployment, merge, OAuth publication, bootstrap or real signing. Live OAuth remains unverified until authorized hosting. Earlier approval/transfer-pending text below is historical.

October 17 OAuth review: owner confirmed up to 165 users (50 students, 15 mentors, up to 100 parents) and personal/school accounts. Separate production Google project is required for the planned audience. See [GOOGLE_PRODUCTION_SETUP.md](GOOGLE_PRODUCTION_SETUP.md) for the concrete approval packet: retain existing development/calendar project; propose new Denham Venom Production project and one Web client for both apps. Execution, new-project IAM and private production credential replacement await owner approval. Nothing changed in Google or production. This supersedes earlier statements that policy applicability remains unknown.

## Current checkpoint — October 17

Public About/Privacy/Terms and approved prelaunch configuration are complete at published application checkpoint `87134fb`. Boundary documentation reconciled October 17; implementation checks are retained from that checkpoint, not rerun for this documentation audit. See CURRENT_STATE.md for verified configuration, targeted checks and release-only gates. No deployment or merge.

## Historical checkpoint — October 15

Parent and Student setup batch implemented under PARENT_SETUP_BATCH.md; owner visual review next. Season FIRST verification automatically applies to every Competition. Preserve completed G1–G7 and approved PDF. CURRENT_STATE.md and VISUAL_CHECKS.md hold current evidence.

## Preserved authorized PDF batch — October 14

Implement [populated field-trip PDF consent](FIELD_TRIP_PDF_PLAN.md): completed student setup and Parent profile before PDF review/signing, structured allergy/prescription entries, no active Medication Choices/OTC policy, minor first aid retained, immutable exact PDF and checkbox/typed signature. Preserve legacy receipts and existing gates. This scoped batch supersedes the consent details below; broader G1–G7 scope is unchanged.

## Historical completion checkpoint — October 13

Follow CURRENT_STATE.md and GOAL_ACCEPTANCE.md for active G1-G7 scope. Published source checkpoint f156744 is synchronized to development. The synthetic season transition, historical roster and attendance corrections, CSV payment import and receipt correction have completed scoped live rehearsals. Existing integrated checks and Astra review remain valid for their recorded checkpoints. The next implementation closes the missing Coach roster archive/reactivate controls using the existing backend contract, followed by combined account-lifecycle and upcoming Whole Team enrollment rehearsal. Historical financial correction, remaining role journeys, selected-scope download evidence and representative prototype comparisons remain open. Production, real signing and automatic deletion remain separately gated.

## Scope and evidence

Build a new application in this directory. Preserve the root Convex starter and every file in `../Devel_Vs_Handoff/design_handoff_student_status`.

Functional precedence: explicit subsequent user decisions, then Flow index **What changed in v2 (Oct 2026)**, then the clickable prototype, then handoff README. The Flow index is a bundled HTML artifact; its functional content is the JSON string in `script[type="__bundler/template"]`. The October 12 decisions below supersede the handoff's 14-day parent-invitation expiry with 7 days. Credits apply automatically, and season close offers explicit balance dispositions.

Stack: React, Vite, strict TypeScript, React Router 7 Data Mode, Tailwind 4, shadcn components built on Base UI, CSS design tokens, Convex, Google-only authentication, Zustand for ephemeral UI state, next-themes, Sonner, and Cloudflare static hosting. No production deployment is authorized. Synthetic fixtures and restrictive development policy unblock independent development; they are not production identity, consent, or health records.

## Milestones and exit criteria

1. **Foundation:** isolated project builds and typechecks; tokens, local assets, accessible shared primitives, responsive application shell, router, loading/error/empty states, and theme work. At 390 px no core workflow scrolls sideways; desktop navigation changes at 1024 px. Prototype review bar is absent.
2. **Shared domain and server boundaries:** student/parent/adult identities, seasons, participation, charges and allocations, immutable permission snapshots, health, room groups, transport and audit history have typed contracts. Every public server function authenticates and checks record scope. Server permission tests prove rejection, not merely hidden buttons.
3. **Usable family workflows:** status links to live details; optional signup/withdrawal changes status and capacity; finances reconcile to charge allocations; profile edits persist; linked-child selection respects scope; permission and parent-invite workflows explicitly expose development restrictions.
4. **Usable operations workflows:** roster, event setup/workspace, readiness, drivers/transport, rooming, financial recording, join review and requirement review perform meaningful mutations and update related summaries. Mentor report excludes restricted fields.
5. **Administration and reporting:** attendance source/import preview, corrections, adults/roles, season close preview, and role-filtered reports/export paths are implemented or explicitly listed as incomplete. Never show a success toast for an unimplemented operation.
6. **Integration and delivery:** build and typecheck pass; meaningful domain/security checks pass; browser review at phone/desktop and light/dark confirms key tasks. README explains local synthetic mode, Convex/Google setup, static hosting, and remaining production gates. Record completed versus incomplete scope honestly.

## Functional acceptance map

| Flow | Acceptance criteria |
| --- | --- |
| Sign-in/access | Google is the sole real provider. Unknown, awaiting approval, archived and first-setup accounts have distinct states. No role picker authorizes real server access. |
| Join | Coach creates/revokes codes for 24 h, 1 week or 2 weeks. Five invalid tries impose a 15-minute lock. One request per Google account; submitted requests remain approvable after code expiry. Coach/Travel Lead approve. Archived matches require explicit resolution. |
| Onboarding | Legal name comes from join approval; shirt size and Boys/Girls rooming category collected, parent contact skippable. Category locks after setup; Coach handles later changes. |
| Status | Money, participation, event readiness, and attendance are distinct. To-dos group by event and include due dates. Parent sees selected linked child and a Viewing banner. |
| Profiles | Student edits preferred name, shirt and parent contacts. Parent/Coach edit health and emergency contact. Missing health is Not completed, distinct from None reported. New workflows remove seasonal OTC authorization; structured Parent-confirmed fields follow FIELD_TRIP_PDF_PLAN.md. |
| Parent linking | Student invites parent by email; recipient signs in with the matching Google email and attests their relationship/authority. Valid acceptance establishes the link without routine Coach approval. Coach handles exceptions. One-time invitations expire after 7 days; landing reveals no student data before validation. Disabling new invitations preserves outstanding valid invitations and existing access. Multiple linked children supported. This is good-faith attestation, not independently verified guardianship. |
| Parent invitation control (implemented October 12, 2026) | Coach-only **Allow new parent invitations** toggle in **Join Requests**. Persist the setting in Convex and enforce it on every invitation-creation/replacement path. Show a clear explanation where inviting is disabled. Implemented with the parent-invitation milestone; see verification below. |
| Events | Competition, Outreach and Team event types; six setup steps. Travel Team/Required assignment differs from optional signup. Pending reservations consume capacity but incur no charge until confirmed. Waitlist promotion is manual. |
| Requirements | Payment/permission/room selection are computed. FIRST/custom completion is adult recorded; following an external link does not complete it. Due dates are per event and requirement. Attendance never contributes to readiness. |
| Money | Charges are event-tied or standalone with all/selected recipients. There is no implicit Travel Fee. Event payment sums event-tied charges. Automatic credits follow Coach priority; no credit exceeds available balance. Every financial change logs actor/time/before/after; manual adjustments require reasons. |
| Fundraising | Coach creates fundraiser; allocations sum to 100%. Travel Lead amount/allocation editing requires explicit finance capability. Team raised total and individual travel share remain distinct. |
| Permission | Four-step parent workflow; correction opens flagged field; typed signature matches verified account. Signed snapshots preserve wording version, covered events and health at signing. Later events are separate. Review never edits a signed snapshot. Legal copy remains draft and real signing is blocked until approved. |
| Roster | Coach edits subteam/Travel Team and archives/reactivates. Travel Lead cannot gain these controls by calling a mutation directly. Filters and student record opening work. |
| Adults | Coach invites by Google email with shareable link; no automated email. Travel Lead is a Mentor capability and finance editing is an independent grant. Parent link revocation immediately removes access. |
| Attendance | A future separate clock-in app on another subdomain owns clock-in/out; this app consumes attendance from the common Convex backend. Match verified account email initially and retain stable student IDs for relationships. Tuesday/Thursday/outreach/build distinctions remain. Shared authentication, permissions and attendance aggregation contract must be designed; imports are not the primary integration. |
| Drivers/transport | Passenger seats exclude driver. Demand is riding students plus additional adults; bus plus assigned vehicle seats provide capacity. Trailer driver must be assigned and tow-capable. Transport off means Not applicable. No passenger-to-vehicle assignment. |
| Student rooming | Only eligible confirmed same-category peers may be invited. Four accepted occupants maximum for student actions. Invite acceptance is transactional, closes incompatible invitations, and cannot silently displace membership. Deadline closes selection. Other students' selections/unassigned state remain private. |
| Adult rooming | Adults move/combine/finalize; no mixed categories. Fifth occupant requires recorded adult authorization and note; never six. Category or participation change flags impacted room for review. Assignment request completes student selection but does not finalize adult rooming. |
| Readiness | Open students sort first; each requirement explained. Overall event ready requires all applicable student, transport and rooming categories. Not applicable remains distinct from ready. |
| Reports/exports | Mentor sees names/subteams/attendance/events/overall readiness only. Each export shows event/time and Draft if incomplete. Coach can export permission/health packets; a separate Coach-managed permission grants this to a Travel Lead. Proposed default off; independent of financial-edit permission. Ordinary logistics exports exclude health. |
| Season | Coach only; unique new name, returning/departing review, unpaid disposition, departing balance disposition with reasons, retain/reset preview and typed confirmation. Transaction idempotent; previous season read-only. Corrections require warning and logged reason. Ordinary users cannot access old seasons. |
| Appearance | Light/dark applied consistently and account preference persists. Status includes icon/text, tap targets at least 44 px, inputs 16 px, visible focus and keyboard-operable dialogs. |

## Integration priorities

### Implemented feature: Coach control of new parent invitations

Requested October 12, 2026 and subsequently authorized for development. Implemented with the parent-invitation workflow milestone.

- Placement: a **Parent invitations** section in Coach **Join Requests**, with an **Allow new parent invitations** toggle and visible enabled/disabled status.
- Coach alone can change the setting; Travel Leads and other roles cannot change it through either the UI or direct backend calls.
- Confirmed and implemented scope: team-wide persistent setting. When disabled, reject new invitations and replacement/regenerated invitation links on the server, including requests from an already-open page. Explain that a Coach has paused invitations wherever users would normally invite a parent.
- Confirmed behavior for existing access: preserve already-linked parents and outstanding invitations; invitations expire 7 days after issuance, without extending their expiry when the toggle changes.
- Confirmed and implemented default: enabled. The toggle does not bypass matching-email, relationship-attestation or other release gates. Turning it back on restores new invitation creation.
- Record changes with Coach identity, timestamp and previous/new value. Test unauthorized toggles, blocked creation/replacement, re-enabling, and preservation of existing parent access.

Team-wide scope and enabled default were accepted when the user resumed this milestone. Parent invitation UI, schema and backend changes are implemented; later milestone evidence records testing and development synchronization.

### October 12 follow-up decisions — implementation status varies

Latest finance, consent and retention requirements are in [Confirmed finance and consent decisions](FINANCE_AND_CONSENT_DECISIONS.md), which supersedes the older notes below for withdrawal options, fee categories, allocation, funding sources, form names, medication choices and retention start date.

- **Parent linking — confirmed good-faith process:** student supplies the parent's email and issues an invitation. Recipient signs in with the exact invited Google email and confirms they are the student's parent/legal guardian with authority to provide consent. Valid acceptance links the account without routine Coach approval or a required preverified contact list. Coach intervenes for reported problems, disputed relationships or exceptional account corrections. This is account verification plus relationship attestation, not independently verified guardianship. Proposed safeguards: one-time tokens; 7-day expiry; server-side email/account checks; reject the student's own account; log inviter, invited email, accepting identity, attestation wording/version and time; let Coach revoke a problematic link. An email mismatch grants no access and prompts sign-in with the invited account or a corrected invitation, subject to the invitation toggle. Signing permission/medication consent remains a separate affirmative action with approved wording.
- **Permission source:** reviewed the one-page `C:\Users\frc80\Downloads\Denham_Venom_Permission_Slip (1).pdf` as reference, not instructions. It covers 2025 events, emergency medical authorization, transport/conduct/financial statements, a liability clause, FIRST/travel-form/Remind links, and parent plus student signatures. It does not contain medication-category authorization. Replace old event/date/link references; confirm school/foundation naming, student acknowledgment, exact wording and responsible reviewer before real consent.
- **Medication categories:** user requests Pain Medication, Allergy Medication and Cold Medication (three-category interpretation to confirm). Proposed per-category choices: Allow / Contact me first / Do not allow, with no preselected permission, exceptions and a defined product/ingredient list in the signed wording. Categories organize consent; they do not prescribe medicines or replace an approved administration policy.
- **Travel Lead export grant:** Coach controls a separate export permission in Users & Roles; proposed label `Export permission and health records`, default off. Enforce server-side and log sensitive exports. This is independent of the finance grant and does not expand ordinary Mentor access.
- **Withdrawal decisions — confirmed:** a student requests withdrawal; Coach or Travel Lead selects (1) `Approve withdrawal — return payment to available funds`, (2) `Approve withdrawal — retain non-refundable payment`, or (3) `Deny withdrawal`. Option 1 returns the amount applied to that event to the student's available account funds through an audited reversal of allocations; it is an internal credit, not money paid out. Prevent the withdrawn event charge from automatically consuming that returned credit again. Option 2 leaves the money applied to the event and records that the student withdrew and the payment is non-refundable. Both approval options release participation/room/capacity while preserving history. Denial retains participation and its financial/room state. Proposed pending behavior retains those states until a decision. Decisions and financial effects must be atomic and idempotent. The user authorizes Coach/Travel Lead to make this withdrawal disposition; it does not grant permission to record external cash/check refunds. Remaining edge decisions: unpaid or partly paid event charges, and whether returned available funds should immediately auto-apply to other outstanding charges.
- **External refund recording — confirmed:** giving money back by check/cash or another external method is a separate action, recorded only by an authorized financial editor in the finance area beside `Add funds`/`Record payment`. Proposed label: `Record money returned (cash/check refund)`. Existing financial-editor scope is Coach or Travel Lead with the separate financial-edit grant. This entry reduces funds held for the student; the app does not transfer money. Preserve original payments and internal event-credit reversals, appending the payout entry rather than rewriting history. Proposed required fields: amount, date, reason, method/reference; derive actor and timestamp server-side. Validate available refundable funds, allocation effects and duplicate submissions. Do not display an approved event-credit reversal as an external refund awaiting payment. Restricted fundraising-credit payout eligibility remains open.
- **Attendance:** future separate clock app/subdomain, common Convex backend. Use account email for initial matching, stable student/account IDs thereafter; do not expose health/finance data to clock-only capabilities. Shared backend means a shared project/deployment contract, not merely both apps using Convex. Separate-origin authentication and aggregated attendance rules remain design work. Do not build clock-in/out UI in Student Status.
- **Account management and retention:** Coach manages application accounts. Archived records retained for 5 years. Proposed start date is archival, pending user confirmation; deletion scope, backups, downloaded exports and any holds must be defined before implementing purge. Do not treat this business retention decision as a legal sufficiency determination.

Confirmed follow-up: unpaid main event/travel balances remain owed unless explicitly cancelled, paid extras are included in the return amount, and the Coach approves final permission/medication wording. Fundraising-transfer authority and detailed form wording remain to be settled. Auto-allocation, funding-source separation, form names, medication choices and archival-based five-year retention have now been confirmed; see the linked decision record. Parent linking, withdrawal payment disposition and separate financial-area cash/check refund recording are now decided. The parent-linking and invitation-control subset was subsequently authorized and implemented; financial, consent, attendance and retention changes above remain planned.

Implement and validate complete vertical slices before widening menus: (1) role-scoped status/event participation, (2) requirement mutations/readiness, (3) charges/credit/audit, (4) rooming/transport, (5) approval/profile/forms, (6) remaining administration. Shared calculations belong in pure domain modules reused by synthetic fixtures and server code, while authorization belongs exclusively on the server.

## Production gates

- Final permission and medication authorization wording/version and retention policy.
- Real multi-account Google OAuth invitation acceptance was rehearsed successfully in development using owner-controlled test identities and a fictional student. Production identity/privacy/consent gates still apply.
- Implement and verify the explicit Coach-controlled Travel Lead health/form export grant.
- Define the future clock app's shared identity/data contract and aggregation rules.
- Owned development/production Convex and Cloudflare projects and Google OAuth configuration.
- Production security review, synthetic-to-live data separation, configured origins and tested deployment rollback.

These gates do not prevent local synthetic development. They do prevent presenting the app as ready for real student health/financial data or deploying to production.

## Interim implementation review — October 11, 2026

This is a changing implementation snapshot, not a completion certification. Initial typechecking passes; deployment and real Google authentication have not yet been verified. The application has a responsive synthetic read-only review surface, a live authenticated query shell, and server mutations for several operational domains. The full acceptance map above remains the target.

Priority integration gaps found in this snapshot:

- Live UI must connect existing profile, roster, finance, event creation, requirement, join-review and rooming mutations. Declared function references alone do not constitute working flows. Coach finance needs a roster-based student selector because Coach viewer records have no linked children.
- Real Convex Auth identity requires stable auth-user mapping: the installed provider's default JWT subject contains both user and session IDs, and does not include email. Session-specific token identifiers and fabricated Google-shaped test identities cannot establish durable application roles.
- Server calculations must not silently truncate financial ledger history. Bounded pagination is suitable for display, but balances and allocation require authoritative aggregates or explicit safety limits.
- Transport still needs independent travelers, additional adults, bus and towing state; rooming needs leave/cancel/invite and adult placement/finalization workflows; Required/Travel Team events need distinct assignment behavior.
- Family invitations/verification, legal consent, attendance matching and owned cloud configuration remain legitimate gates. Ordinary profile edits, event creation, financial recording and rooming interactions are independent of those gates and should continue.

The first review identified a join-attempt rollback bug, Mentor room-category disclosure, archived-record scope gaps and falsely ready unplaced rooming. The backend owner reports fixes and passing focused tests; final review must verify those changes alongside actual live identity behavior. Remaining screens must be reported as incomplete where they only render sample data or configuration placeholders.

## First milestone review — October 12, 2026

Fresh review confirms stable Convex Auth user mapping and the first-round server fixes in source. Independently executed backend suite: **7/7 passing**. Live UI now connects several previously missing mutation paths: profile, Coach roster, payment recording, event creation, join review and FIRST completion. Limited room actions are also wired. OAuth setup and authenticated browser proof remain separate integration work.

Final follow-up closes the targeted join-result, participation-transition, post-allocation ledger-limit and readiness-display findings described in `REVIEW.md`. Fresh source inspection and independently rerun tests confirm **10/10 passing**. The integrating agent also verified real Google OAuth, development Coach bootstrap, two fictional students and one event, and a persisted $1 synthetic ledger entry through the live browser. The initial milestone is accepted for supervised synthetic development; final development sync/build/Cloudflare dry-run evidence belongs to integration delivery.

The full product is incomplete. Parent/consent workflows, complete transport/room operations, broad financial administration, attendance integration, season close, adult role management and exports remain next-milestone work; policy gates do not account for all of this unfinished implementation. No production approval or full handoff completion is implied.

Final baseline review confirms next-themes, shadcn Sonner and ephemeral Zustand menu state are wired. Integration reports passing typecheck/lint/tests/build, development sync with typechecking, and Cloudflare dry run without upload; live FIRST completion reduced the synthetic open-requirement count from three to two. These checks complete the initial development milestone's delivery evidence, not the full acceptance map.

## GitHub repository setup — October 12, 2026

Connected this app to denhamvenom/student_status on branch setup/development-app. Preserved the four existing standalone demo files byte-for-byte under demo/. Added repository guidance, line-ending rules and exclusions for environment secrets, local tooling, dependencies, builds and private exports. Lint, strict typechecking, all 10 tests and build pass; the existing bundle-size advisory remains. Publication is through a draft pull request only: main currently serves GitHub Pages, so merging requires a deliberate hosting transition and separate authorization. No production deployment is authorized. See REPOSITORY.md.


### Repository privacy clarification

Confirmed: student records must always stay out of Git and GitHub, regardless of public/private visibility. This covers repository content and history, issues, pull requests, attachments and CI logs/artifacts. Fixtures, tests and documentation must use synthetic student data only. Recorded in AGENTS.md and REPOSITORY.md.


### Ongoing GitHub versioning

Confirmed: maintain accurate GitHub versioning as development proceeds. Repository guidance now requires focused checkpoint commits, reviewed staged content, appropriate validation, verified development-branch pushes, current pull requests and documentation, and coordinated Git writes across agents. Development checkpoints use commit IDs; approved releases use intentional semantic versions, immutable tags and release notes. Existing no-production and main/GitHub Pages merge boundaries remain unchanged.

## Parent invitation milestone — completed for synthetic development

User authorized development of the parent invitation workflow with the proposed defaults: one team-wide Coach toggle enabled by default, multiple parents per student, and multiple students per parent. Scope includes seven-day one-time invitations, matching Google identity, affirmative relationship/authority attestation, automatic linking, Coach exception revocation, and scoped frontend/backend verification. Existing valid invitations and links survive disabling new invitations. Linking does not sign travel or medication consent.

Astra owns project/security review; separate Sol agents own backend/tests and frontend. The integrating agent owns documentation, validation, and Git checkpoints. Email delivery is not configured: initial UI must clearly provide a link to share manually and must not claim an email was sent. Only synthetic data is used; production and main/GitHub Pages publication remain unauthorized. Implementation is complete for synthetic development; final verification evidence follows.


### Parent invitation delivery evidence

Final integration: lint, strict typechecking, all **19 backend tests**, and Vite build pass. Thirteen browser checks cover student/Coach/parent fixture layouts at 390 and 1440 pixels in light/dark plus the missing-token live landing. Real signed-in Coach Join Requests displays the enabled setting and scoped synthetic student selector. Convex development synchronization with typechecking succeeded on third-bandicoot-18. Astra accepted the synthetic-development milestone after final source review. The existing bundle-size advisory remains.

Implemented Coach resolution for revoked invitations and family links; history lists retain actionable older invitations. Server preview/acceptance use authoritative time; acceptance snapshots exact versioned attestation. OAuth redirect excludes the token, using temporary same-tab storage for the round trip. Child lists exclude prior seasons and update after link revocation. No automatic emails are sent.

Live additional-account Google OAuth invitation acceptance was subsequently rehearsed successfully; Google remains in Testing mode. Bounded history/access-list limits and complete production readiness remain documented limitations. No real student records, production deployments, main changes or release tags were created. This milestone is published on feature/parent-invitations in a draft PR based on setup/development-app, leaving the setup PR and live demo unchanged.

### Live invitation rehearsal completed

The real two-account Google OAuth rehearsal passed in development: student join/Coach approval, invitation creation, paused-new-invitation behavior, wrong-account rejection, matching-parent acceptance through Google redirect, one-time replay rejection, reactive Coach revocation and restoration. The fictional student and parent link remain for further testing; new invitations were restored to enabled. Refer to REVIEW.md. Test-account addresses and invitation tokens are excluded from GitHub.

## Human-readable progress guide

See [Development checklist](DEVELOPMENT_CHECKLIST.md) for verified completed work, remaining workflows and user decisions organized into the expected development phases. Keep it current with milestone evidence; it supplements this technical acceptance plan and does not authorize new work or production deployment.

## Active milestone October 12 withdrawals travel and consent draft

Implemented and verified for development on `feature/withdrawals-and-travel`, based on the parent invitation milestone. Astra coordinates shared contracts and performs final review; Sol owners implement withdrawals, transport, and permission drafting in separate files. Root owns schema integration, live routes, verification and Git. No production deployment or main merge.

Scope: reviewed full/partial/no-return withdrawal decisions, source-preserving reallocation and fee cancellation; drivers, vehicle assignments, independent travel, bus/adult counts and towing readiness; read-only permission wording for Coach approval with signing blocked. Complete room-management, cash/check payout recording, fundraising transfers and real consent/export workflows remain separate unless explicitly verified in this milestone.


Verification: 32 backend tests, lint, strict TypeScript and build pass; Astra final source review accepted after fixing stale approvals, archived-event review, bounded-history rollback, old withdrawal bypasses and reenrollment capacity. Development synced to third-bandicoot-18. Live Coach browser checks verified driver/vehicle/settings/independent travel, categorized extra charge with automatic credit application, empty withdrawal queue, and draft form. Source provenance is explicit for new allocations; ambiguous old allocations fail closed for financial review. Approved-withdrawal reenrollment remains blocked until a deliberate new-fee workflow is built. Full multi-account withdrawal rehearsal remains pending. See REVIEW.md and DEVELOPMENT_CHECKLIST.md.

## Timeclock coordination October 12

[Timeclock coordination handoff](TIMECLOCK_COORDINATION.md) records verified current entities, a proposed additive multi-app layout, shared attendance/calendar/auth contracts, single-backend ownership and unresolved policies. Planning only; no Timeclock implementation, schema/folder/account changes or deployment. The Timeclock chat must agree the contract before implementation.

## Timeclock backend foundation — October 12

The owner approved the remaining Timeclock policies. Implemented on isolated `feature/timeclock-backend` from verified coordination baseline `5eacf42`, preserving the original checkout and draft PR stack. Shared schema/attendance/calendar/auth belongs to this integration chat; separate `apps/timeclock/` scaffold only, full frontend delegated to the later Timeclock chat. See [concrete backend handoff](TIMECLOCK_BACKEND_HANDOFF.md).

Astra final source review accepted synthetic development after timing/race/reconciliation findings were fixed. Root checks passed 73 tests, lint/types/build; workspace check/build and both Cloudflare packaging dry-runs passed. Development synchronized successfully. Dedicated read-only Calendar identity configured privately, sharing completed by owner, HTTP200 read verified and deployed minute poll observed successful. Existing roles preserved; Mentor Google sign-in and reactive access after verified provisioning passed. Full UI/reporting/import and production remain pending.

Timeclock integration follow-up: reactive per-student selected-event status and other-event conflicts now have a dedicated minimal query, `timeclockRoster.clockStatus`. Astra reviewed; 77 tests plus root checks passed. Port5174 handed over safely to the frontend chat. Existing synthetic names still require explicit Coach review; no automatic surname inference or live reseeding.

## Operations milestone now in progress — October 12, 2026

Agreed decisions: chronological waitlist order with manual Coach/Travel promotion; student room changes stop at the deadline while adult corrections require an audit reason; financial editors may transfer available fundraising credits to active students within the same season, with a reason. Cash/check refunds are separate recorded payouts from available personal payments.

- [x] Coach structured-name review and Timeclock attendance/correction screens.
- [x] Event approval, ordered waitlist, requirements and rooming workflows.
- [x] Source-preserving payout records, fundraising transfers and readable history.
- [x] Astra final review, 90 automated tests, Coach browser smoke checks, development sync and GitHub checkpoint `d33c701` / draft PR #7. Full multi-role rehearsal remains pending.

Work runs in isolated `student-status-operations` / `feature/student-status-operations`. Timeclock frontend owns its separate worktree and `apps/timeclock`; one Student Status owner integrates shared backend and schema changes. Production, real signatures, automatic deletion and main merges remain outside this authorization.

### Operations implementation evidence

Implemented Coach structured-name review and per-session attendance/correction UI; manual ordered event approvals/waitlist, requirement/deadline editing, private student room invitations and audited adult assignments/finalization; personal-only payout records and same-season source-preserving fundraising transfers. Astra accepted final source for synthetic development. Integrated lint/types/build and 90 tests across 15 suites passed; both app packaging dry runs and preserved Timeclock workspace checks passed. Development sync to the approved personal deployment succeeded. Browser connectivity recovered. Live Coach attendance/name review, payout/transfer forms and event/room workspace smoke checks passed; event/finance phone layouts showed no horizontal overflow. Full live multi-role transaction rehearsal and closed-session correction UI rehearsal remain pending (mutations are covered by automated tests). No production action or real consent enabled. See DEVELOPMENT_CHECKLIST and REVIEW for remaining scope.


## Fictional rehearsal follow-up — October 12, 2026

See [the rehearsal report](REHEARSAL_2026-10-12.md) for the current evidence, superseding earlier pending statements for the live closed-session correction and Coach financial/room/transport checks. Coach, Student and Parent live journeys passed within the documented scope. Fixed duplicate React sibling keys and financial draft leakage between students, preserved payment/charge retry keys, clarified waitlist withdrawal wording, and denied attendance correction writes to archived seasons. Added guarded fictional fixtures and integrated multi-role tests. Full root checks passed 97 tests across 17 suites, lint, strict types and build. Remaining live Travel/Mentor, independent-device, paid-withdrawal and room-invitation journeys are explicitly open; family Attendance still needs implementation. No real records, real signatures or production release.

## Representative design review

Coach authorized one screen before broader corrections. The isolated Coach Readiness candidate uses the existing backend with screen-scoped presentation. All four viewport/theme comparisons, Astra review and local checks are recorded in [READINESS_DESIGN_REVIEW.md](READINESS_DESIGN_REVIEW.md). Coach subsequently accepted this representative screen and authorized the frontend rollout below. Paused backend drafts and production remain excluded.

## October 12 approved frontend rollout

Coach approved representative Readiness and authorized frontend alignment across existing screens. Work runs on `feature/student-status-readiness-design`, draft PR9, excluding paused backend draft ancestry. See `FRONTEND_CONFORMANCE_LOG.md` for implementation, review and evidence limits. Sol agents own separate presentation areas; Astra reviews integration. Whole Team backend semantics, aggregate Coach finance views, missing states and real consent remain separate dependencies. No production or main merge authorization.

### Copy and visual-check follow-up

Live-app copy consolidation and sticky-anchor/empty-state corrections completed with Astra review and101 passing tests. Updated available-role visual checks distinguish scaled viewport evidence from pixel parity and unsupported states. See FRONTEND_CONFORMANCE_LOG.md for the current table and explicit backend dependency list. Legacy fixture-only preview, new backend work and production remain outside this pass.

## October 13 Whole Team decision and context audit

Whole Team includes every active team member; new members joining after creation are automatically included in that event too. This supersedes the suggested creation-time snapshot/manual addition. Agreed only: implementation and verification remain pending separate backend-phase authorization. Inspect event lifecycle, membership and financial interactions before implementation; do not silently invent closed-event or reactivation policy. Start future work with CURRENT_STATE.md; older workspace/pause statements in this plan are historical snapshots.

## October 13 reusable workflow checkpoint

Created the two first-party project skills under .agents/skills and linked them from AGENTS.md. VISUAL_CHECKS.md owns current outstanding visual comparisons; FRONTEND_CONFORMANCE_LOG.md retains dated evidence. No application/backend implementation or new browser verification is part of this checkpoint.

Validation for this workflow checkpoint: both skills passed the skill-creator format validator. Astra read-only scenario review confirmed correct handling of stale worktree instructions, partial/wrong-theme screenshots, unavailable Mentor-only identity and unimplemented Whole Team. No blocking findings; clarified unexpected clipping versus intentional viewport slices. Documentation diff checked; no application tests/browser checks rerun.

## October 13 frontend continuation

Modal/event sections/invitation presentation implemented with existing contracts; staff personal participation labels removed. Both workflow skills used, parallel Sol ownership and Astra source review completed. See FRONTEND_CONFORMANCE_LOG.md and VISUAL_CHECKS.md for scoped browser evidence. Whole Team and other backend dependencies remain unimplemented. Full check100/101 due to expired existing Timeclock fixture; isolated failure confirmed and separately flagged. No production authorization.

## Seven-item goal authorization — October 13

Complete all allowable frontend/backend checklist work to readiness for Coach visual approval. Current integration branch feature/student-status-completion derives from5343092. GOAL_ACCEPTANCE.md maps requirements/evidence without reducing scope. Upcoming-only Whole Team additions confirmed by user. Real wording approval/signing, retention deletion policy, production/main remain gates. Maintain one owner for shared schema/generated/deployment and coordinate Timeclock branch753b236. Local WholeTeam/reporting candidates need scale corrections before acceptance; do not claim fixture-only success as completion.

## Accounts and report integration review — October 13

Whole Team source checkpoint is published; upcoming-only live rehearsal remains pending. Timeclock frontend753b236 is integrated locally through3946b88, with combined Timeclock checks passing. Account setup/corrections/adult management and aggregate-backed finance/attendance are now implemented locally. Final review fixes cover token handling, query fanout and correction queue scaling. Combined145tests/lint/build passed before those fixes; rerun affected checks and review before development sync. Permission signing, administration, full visual matrix and final multirole acceptance remain open in GOAL_ACCEPTANCE.md.

## October 13 administration and live financial continuation

Published fundraiser submit correction04c14d7 and verified Parent gross/travel/available reconciliation. Current charge correction/cancellation and fundraising-to-team slice is in parallel backend/UI implementation with Astra review; generated types and strict typecheck pass. Complete this slice's integrated validation before development synchronization. Shared season-wide fees/priorities, season transition/carryover and retention preview/holds remain required, followed by outstanding live roles and VISUAL_CHECKS. Skills remain mandatory at context and visual checkpoints. No G1–G7 closure or production authorization follows from this milestone.

Charge/team-transfer slice now reviewed, integrated, validated and synchronized to development10:54:14. Proceed with live verification and shared season-wide fee definitions/priorities/custom-fee workflows in separately owned files. Preserve source history and explicit historical-correction restriction; season transition/carryover and retention remain subsequent required outcomes.

October 13 continuation: charge adjustment and cancellation now verified live with fictional records, preserving original amounts/reasons and returning credit to its original source. Fresh rendered Coach Finance comparison identifies primary student table/top action/recent-change structure still required beyond shared fees; Astra contract inventory is in FINANCE_ADMIN_IMPLEMENTATION.md. Sol retention owner is assigned new non-destructive review/hold backend/UI modules; the shared-fee owner remains the sole schema editor and root owns generated/route integration, Git and sync. No deletion, production or main merge.

October 13 permission continuation: live synthetic re-sign request/replacement/acceptance, paper provenance/acceptance and minimized-versus-health exports verified. Retention source review is clear after stale-reactivation/read-budget fixes; route integration and live/visual verification remain required. Shared-fee bulk work uses durable zero-money preparation with immutable paginated scope, review fences and explicit commit; do not mark unfinished contracts accepted. Overall scope estimate remains approximately 74%.

Next parallel slice: finish immutable shared-fee bulk preparation/review/commit; independently complete Mentor/Travel own-profile route from prototype and auth-derived identity. Retention integration is source-ready awaiting coherent development sync. Coach finance table/feed/export contract is now specified in FINANCE_ADMIN_IMPLEMENTATION, including separate applied personal/fundraising totals and fundraising-only Travel account column.


October13: Whole Team zero-fee creation live journey confirmed all six active fictional members. Next G3 proof remains later joining/reactivation and full visual states. Attendance build boundary now follows officially verified FIRST kickoff day automatically (2027Jan9), with unknown years explicit rather than guessed; Outreach classification awaits user response. Isolated season-calendar helper can proceed in parallel with shared fee review fixes and adult profile rereview.

## October 13 administration integration checkpoint

Shared fees, retention preview/holds and Mentor profile/Coach driver reconciliation are source-reviewed and synchronized to development at12:30:56. Full integrated check passed266tests/48files, lint/types/build; final UI recovery13tests and archived enrollment retry1test passed separately. Timeclock usability commit0df2fb1 is integrated as59f58d3 with a root lint-compatible window.innerWidth assertion follow-up. Complete live/visual evidence next; finance team table/change feed/export, historical correction/season carryover and attendance season/category integration remain required. Official kickoff helper is tested but not yet wired to reports. No production or real signatures/deletion authorized.

## October 13 source-separated Finance continuation

Continue the reviewed FINANCE_ADMIN_IMPLEMENTATION contract: Sol owns shared schema and all monetary writer/projection changes; root owns the unmounted Finance table/feed presentation and later integration; Astra reviews each slice before synchronization. The table presentation has four focused tests and source clearance; the feed has two focused tests and review pending. Backend owner reports28focused v4 tests passing, with feed emission/backfill still in progress. No new development sync is claimed. Reviewed SEASON_ADMIN_IMPLEMENTATION is planning only, including the superseding no-family-authorization departure policy. Preserve all G1-G7 acceptance requirements and the single VISUAL_CHECKS queue.

## Completion-first working policy — October 13

The Coach requested explicit protection against minutiae and context churn. Follow COMPLETION_WORKFLOW.md for workflow-sized delivery, blocking-versus-follow-up decisions, convergent reviews, proportionate verification and concise handoffs. Finish connected Finance next; retain all G1-G7 requirements and privacy/production gates. This supersedes habits of fragment-sized repeated reviews and per-step narrative updates, not required acceptance evidence.

October13 connected Finance milestone: source-separated table/history and recovery/payment integration reviewed, tested and synchronized to development13:21:10. Fictional account preparation/history/payment reconciliation verified. Next complete scoped export and remaining financial workflows while independent season-link migration proceeds; retain visual/role acceptance queue. See CURRENT_STATE and checklist for exact validation limits.

October13 completion-first update: Coach explicitly reduced verification scope to essential risk-based checks and representative visual coverage; exhaustive state/viewport matrices are superseded. Parent season pagination and Coach season draft/roster are source-reviewed and integrating. Family-link maintenance is live-complete with zero unresolved links. Finish full season transition/carryover and outstanding financial/attendance workflows; use CURRENT_STATE for the checkpoint.

## October 18 development reviewer data

Owner-authorized development-only enrichment and private reviewer guide/index completed. Reviewed fixture, three focused tests, lint, typecheck/dev sync and exact saved-data checks passed. See DEVELOPMENT_REVIEW_DATA.md. Existing identities/history preserved; production unchanged. Google browser acceptance, physical device checks and cleanup are not implied by data availability.

## October 19 — local sign-in chooser implemented
Student Google-only path and Parent/team staff Google-or-email path implemented using existing components. Approved adult identity reuse and invitation email authentication retain server role boundaries and explicit acceptance. Development synced; 522 tests, final 44 focused regressions, lint/typecheck/build and independent review pass. Production promotion and real-inbox checks remain separate.

## October 19 - Mentor/Staff invitation wording

Owner authorized development and production publication of frontend-only invitation copy. Heading is Invite Mentor/Staff; Email address and instructions describe Google or email-code sign-in using the invited address. Landing and account-mismatch copy agree; link creation is distinguished from sending an email. No auth logic, backend, records, credentials or settings changed. Focused lint, application typecheck/build and live local heading/instructions checks passed. Exact production merge/build and live verification are recorded on the release PR.

## October 19 - Mentor/Staff invitation email (development)

Implemented Send invitation with private emailed links, accurate delivery status and guarded resend; removed public copy-link return/UI. Existing invitation acceptance remains explicit. Development third-bandicoot-18 synced with optional fields/additive index; sending remains disabled, no real messages or production writes. Independent review clear; 535 tests in101 files passed and focused31 account/mail tests passed. See [workflow and verification](ADULT_INVITATION_EMAIL.md). Real-inbox delivery and production promotion remain unverified/unreleased.
