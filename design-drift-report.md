# Student Status design drift audit — October 12, 2026

**Consolidated audit for Coach approval. Corrections have not been made.** Available live screens show recurring drift in shared components, navigation, mobile layout and information hierarchy. Several reference workflows are unfinished. This report separates functional gaps from presentation fixes. It is not a blanket visual pass, production acceptance or evidence that every role and state was available.

## Scope and reference authority

The comparison covers Student Status against `Design_Comparison.zip`, at 390px and 1440px in light and dark themes. Evidence combines the integration owner's browser inspection, parallel reviewers' inspection of saved images, and labeled source review. Screenshots and account/student records stay outside Git; extracted `design-reference/` is ignored.

Authority: latest explicit user decisions, then Flow index **What changed in v2 (Oct 2026)**, clickable prototype, and handoff README. The prototype review toolbar must not ship. Tokens, component examples, navigation and `ui-copy.json` support presentation decisions. A broken reference deep link is not an intended empty screen.

Reference archive SHA-256: `a05ef834d964b1ed9e39ea46fdc7e0d2241f0b191c63ddb77a0ba1837e601e06`. Extracted folders: assets, prototype, source, tokens. README and decoded Flow index were read; the prototype was opened through a local reference server.

### Intentional newer requirements

- Who’s Going uses **Travel Team, Whole Team, Open Registration**, without individual student selection. Historical approval events remain supported. The paused local audience implementation has not received final functional acceptance.
- Parent invitations expire after seven days. Matching Google identity and authority attestation remain required; acceptance is not a travel signature or medication authorization.
- Shared Timeclock attendance includes reviewed corrections while preserving original evidence. Family views keep verified sessions separate from legacy counts and exclude audit actors, reasons and private evidence. Family Attendance remains an unfinished local draft.
- Actual cash/check payouts use available personal funds only. Fundraising credits retain their source and may transfer under approved permission/season rules; they cannot become cash payouts.
- Waitlist promotion is manual and chronological. Student room changes stop at the deadline; authorized adult corrections require audit reasons. Withdrawal review preserves approved financial dispositions.
- Real consent stays blocked pending approved wording. Health permissions, retention, rollover and production readiness remain separate work.

Newer features inherit the prototype's overall design system and layout patterns without needing a fabricated exact counterpart. Older README instructions to flag every additional field do not override subsequently approved requirements.

## Screen coverage matrix

**Four combinations** means 390 light, 390 dark, 1440 light and 1440 dark. Inspection records evidence, not approval that the screen matches. Coverage below is owner-reported browser work and delegated image review, not independent second review of every pixel.

| Role / area | Screens covered | Width/theme evidence | Result or limitation |
| --- | --- | --- | --- |
| Coach core | Team, Readiness, Event workspace, Finances, Permission forms, Drivers, Join requests | Four combinations captured; priority comparisons inspected by owner | Findings below; permission workflow is unsigned draft. |
| Coach missing workflows | Fundraising, Reports, Users & Roles, Season | Four combinations; paired saved images inspected by parallel reviewer | All four build routes show unfinished content; defective capture cells noted below. |
| Coach additional screens | Events list, Attendance, Withdrawals, Settings | Owner reports four-combination coverage | Added features assessed through shared visual inheritance; not every operational state available. |
| Coach New Event | All six build steps | Owner reports four-combination captures | Current prototype failed to advance from step one despite valid date; reference uses source and prior step-two inspection, whose first image was 1280px. No event submitted. |
| Student | Status, Events list, Event detail, Finances, Profile & health, Parents, Settings | Four combinations attempted; latest full-page captures use explicit settled-heading waits | Owner live inspection; Sol verified settled desktop Status light/dark, Events dark, Profile light and Settings dark. Parents desktop images remain invalid; source/mobile reviewed. Family event reference deep link blank. |
| Parent | Status, Events list, Event detail, Finances, Profile & health, Forms, Settings | Four combinations, settled full-page captures | Live inspection; multi-child state unobserved; Forms remains draft; family event reference limitation applies. |
| Travel Lead | Twelve destinations including team/event/finance/operations and placeholders | Four combinations, Chrome top/bottom views | Account lacks finance editing. Top/bottom images do not establish every intermediate section. Readiness 437px overflow reconfirmed at 390 dark. |
| Ordinary Mentor | Reference and frontend source | Reference four combinations; no ordinary-Mentor live account | Available Mentor also has Travel Lead. No grant changed for audit. |
| Family Attendance | Unavailable/retry state | Targeted live observation and source | Loaded corrected/legacy totals not live-accepted. |
| Shared entry | Google sign-in and missing invitation link | Targeted live observation | Other account/invitation states remain source-only or unavailable. |
| Phone More menu | Open/close interaction | Targeted live observation | Escape did not dismiss; Close menu did. Limited keyboard observation, not full accessibility acceptance. |
| Student rooming | Direct route for existing withdrawn event | Targeted live observation | Loading followed by whole-app error/reload, losing navigation. Cause not established. |

### Capture and comparison limitations

- Saved Coach reference Adults/Season at 390 light were malformed/clipped. Build Fundraising at 1440 dark appeared clipped to about 320px despite 1440px JPEG. Reliable 390 dark/1440 light evidence supports missing-workflow findings; defective cells are not matched visual passes.
- Some screenshot tooling produced scaled images despite correct DOM viewport dimensions. Exclude invalid pixels from fidelity judgments; screenshot presence alone is not acceptance.
- Student Parents desktop light/dark images show a roughly 320px layout pinned to a much wider canvas and cannot establish desktop fidelity. Mobile/source evidence remains available. A 375px image alone is not proof of a wrong viewport: a 390px browser with a 15px scrollbar can produce that content width.
- Family event reference deep links were blank. Current reference New Event could not advance. These limitations require source/prior reference evidence, not invented equivalents.
- Earlier empty Parent/Travel snapshots and unsettled Student captures were superseded where valid replacements were obtained. Named Student desktop cells were independently re-reviewed; this does not repair the Parents desktop limitation.
- Mobile Create event was keyboard-focused without activation: DOM top 678.7px, bottom 722.7px, height 44px within an 844px viewport, above navigation. **Obstruction is not confirmed** and is not a defect in this report.
- Earlier smoke tests, no-overflow checks and automated tests do not establish visual fidelity. Full-page or top/bottom capture alone does not prove every state or pixel was inspected.

## State coverage

| State | Evidence / availability | Classification |
| --- | --- | --- |
| Loaded Student/Parent/Coach/Travel routes | Existing accounts and synthetic records inspected | Available; findings recorded, not blanket passed |
| Missing invitation token; Google sign-in | Live entry states observed | Available; not all OAuth outcomes |
| Family Attendance error/retry | Live unavailable message | Available error presentation; loaded feature blocked |
| Student rooming for withdrawn event | Loading then whole-app error | Observed; cause unresolved |
| More menu | Open, Escape, Close menu | Limited keyboard observation |
| Parent multi-child / no linked child | Frontend branches only | Live state unobserved |
| Active paid withdrawal, pending room invitation, all deadline variants | Existing audit records do not expose every state | Unobserved where unavailable; prior rehearsal is not current visual acceptance |
| Valid/expired/used/mismatched/conflicting-role invitation | Source variants reviewed | Live unobserved; no invitation accepted or replaced for audit |
| Rejected join, archived access, onboarding, durable pending | Distinct complete frontend flow not established | Functional gap / contract validation required |
| Ordinary Mentor live report | No separate available account | Blocked; permissions unchanged |
| Real signing and receipt | Wording approval outstanding | Intentionally blocked |
| Offline/query failures/loading races/all disabled states | Source fallbacks reviewed | Partial source coverage, not full live acceptance |

## Drift findings

The table uses the requested six columns. **No** means presentation can use existing consumed data or requires no domain persistence. **Yes** means missing functionality or unresolved data contracts need separate validation, not that backend implementation is authorized. Source-only findings are labeled; visual observations are owner/reviewer-reported.

| Screen | Element | Prototype shows | Build shows | Type: wording, option list, layout, styling, missing state or behavior | Needs a backend change? (yes/no) |
| --- | --- | --- | --- | --- | --- |
| Readiness, phone | Event picker | Core tasks fit 390px. | Live: 437px document width; long selector overflows, reconfirmed Travel dark. | layout | no |
| Phone navigation | Labels/icons/surface | Short role-specific Home, Money, Forms, Readiness labels and theme treatment. | Live/source: desktop labels reused, differing icons and dark bar where compared reference is light. | wording, styling | no |
| Phone More | Dismissal/focus | Accessible sheet interaction. | Live: Escape did not dismiss, Close menu did; source lacks full dialog/focus behavior. | missing state or behavior | no |
| Staff desktop shell | Grouping/theme control | Grouped staff navigation and theme control. | Live/source: flat links, no header theme control; theme setting elsewhere. | layout, missing state or behavior | no |
| Shared operations | Color tokens | Gold primary, purple secondary, specified theme surfaces/borders. | Live/source: generic monochrome primitives coexist with separate brand tokens. | styling | no |
| Cards/panels | Shape/spacing | Consistent 8px cards, border/shadow and gaps. | Live/source: legacy 8px, shared 14px, finance 16px surfaces; some missing vertical gaps. | styling, layout | no |
| Shared controls/titles | Size/hierarchy | 4px controls, 44px handheld targets, Anton section hierarchy. | Source: shared buttons default 32px, large 36px, radius 10px; titles 16px, finance 19.2px; CardTitle is a div. | styling, missing state or behavior | no |
| Coach finances | Heading/panels | One page heading and subordinate sections. | Live: duplicate H1 and separate rounded panel. | layout, styling | no |
| Travel finances | Read-only explanation | Permission-appropriate copy. | Live: text invites recording payments while account lacks editing controls. | wording | no |
| Family finances | Grouping | Per-event cards, standalone items, account and history distinguished. | Live/source: aggregate summaries and flatter charge/history display. Regroup available data; additional metrics are separate. | layout | no |
| Family Status | Money metrics | Team raised and individual travel share distinct. | Source: charged/paid/due/travel balance consumed instead. Relabeling charged as raised would be false. | wording, missing state or behavior | yes |
| Family Status | To-dos | Event grouping. | Source: flatter cards despite available eventId/eventName/dueAt. | layout | no |
| Parent screens | Child context | One clear Viewing context. | Live: duplicated Viewing text; multi-child state unobserved. | wording, layout | no |
| Family Events list versus Status/detail | Participation label | Consistent meaningful participation states. | Live: the same event says Not signed up in the list but Withdrawn on Status and detail. Preserve the returned participation state in labels; verify the projection before claiming this resolves the discrepancy. | wording | no |
| Family Status / Finances | Correction request | Visible Request a correction action. | Live/source: no equivalent action in inspected views. A functioning request workflow needs contract validation; do not add a nonfunctional button. | missing state or behavior | yes |
| Family Profile & health | Information sections | Guardian, emergency-contact and medication-authorization context alongside student and health cards. | Live: Student details, Health and a basic edit form; reference sections are absent in these views. Preserve approved categorical medication decisions instead of restoring old authorization wording. | layout, missing state or behavior | yes |
| Readiness / attendance summaries | Values | Human-readable Not applicable and missing values. | Live/source: raw NotApplicable and —% appear; Student event can show the raw enum alongside all applicable requirements complete. | wording | no |
| Readiness | Student requirements | Detailed open requirement list. | Live/source: sparse badges/FIRST actions; existing ReadinessRow.open already supplies labels. | layout, missing state or behavior | no |
| Readiness | Transport/room state header | Clear summary chips. | Existing state consumed; improve formatting and hierarchy. Detailed reports separate. | styling, wording | no |
| Readiness | Detail/exports | Transport/room detail and exports. | No complete equivalent; detailed projection and export authorization/generation unresolved. | missing state or behavior | yes |
| Adult event | Workspace structure | Sticky section navigation and compact summaries. | Live/source: sequential mixed-card forms, crowded transport controls, short unbranded actions. | layout, styling | no |
| Coach event | Requirements message | Staff participant context. | Live: Select a linked student, a family-oriented instruction. | wording | no |
| New Event | Wizard | Compact dialog/steps, descriptive choices, separate navigation actions. | Live/source: full-page large step buttons/dropdown. Reference current navigation blocked; prior/source comparison supports finding. Keep newer three categories. | layout, styling | no |
| Mobile roster/report | Field labels | Labeled stacked cards. | Source/visual: hidden headers leave some values unlabeled. | layout, wording | no |
| Drivers dark | Save Driver | Branded primary action/target. | Live: short white action. | styling | no |
| Permission draft phone | Spacing | Separated cards. | Live: zero vertical gap between cards. Signing restriction intentional. | layout | no |
| Join requests | Invitation controls | Added features inherit shared style. | Live: legacy card and inconsistent shared controls. Preserve server enforcement. | styling | no |
| Family Attendance | Loaded view | New feature inherits shared system; verified/legacy distinct. | Live only unavailable/retry. Recovery is paused functional work, not CSS. | missing state or behavior | yes |
| Student rooming | Unavailable presentation | Contextual accessible state with navigation. | Live withdrawn-event route ends in whole-app error/reload. Contextual presentation can improve without asserting cause. | missing state or behavior | no |
| Student rooming | Access/state handling | Supported or clearly unavailable route. | Whole-app failure cause unresolved; contract/access handling needs separate diagnosis before claiming recovery. | missing state or behavior | yes |
| Sign-in/errors | Guidance/recovery | Clear new-student/parent direction and messages. | Source: limited guidance and raw error strings in forms; generic app reload for query failures. | wording, missing state or behavior | no |
| Join/access | Persistent states | Pending/rejected/archived/setup flows. | Source: signedOut/pending/active consumed; waiting relies on local submitted flag without persisted request-status query. | missing state or behavior | yes |
| Parent invitation | Share/success display | Link/QR and clear accepted confirmation. | Source: copy-link but no QR; acceptance navigates home. Existing link/result supports presentation; seven days intentional. | layout, missing state or behavior | no |
| Adult invitation | Mentor setup | Invitation/onboarding workflow. | Source: no complete equivalent route established. | missing state or behavior | yes |
| Ordinary Mentor | Empty/mobile values | Clear absence states/labels. | Source only: —%, no explicit empty message, mobile labeling gaps; live blocked. | wording, layout | no |
| Ordinary Mentor | Report detail | Richer read-only context. | Source only: name/subteam/Tuesday/event-count; extra readiness/filter data contract unresolved. | missing state or behavior | yes |
| Fundraising/Reports/Users & Roles/Season/My profile | Workflows | Fundraisers, report filters/CSV, adult access, season wizard/profile. | Live/source: generic unfinished destinations. Missing workflows are not CSS defects. | missing state or behavior | yes |
| Student record detail | Dedicated view | Reference record screen. | Source: no equivalent live route; projection/workflow needs assessment. | missing state or behavior | yes |

## Prioritized correction scope — subject to approval

1. **Shared presentation and immediate usability:** phone overflow, enum/missing-value labels, misleading permission copy, More dismissal/focus, semantic theme tokens, action sizes, card spacing/radius and heading/mobile-label consistency. Preserve current domain behavior.
2. **Information hierarchy using existing data:** grouped staff menus, event sections, duplicate headings/context, transport layout, available readiness labels, grouped to-dos and financial records. Preserve mutation state, financial sources, permissions and audit requirements.
3. **Separately authorized functional work:** Attendance recovery, rooming error diagnosis, durable access states, missing totals/reports/exports and administration workflows. A yes above is not permission to implement these during visual corrections. Real signing stays blocked.

Use stable copy keys from the reference with documented newer-requirement overrides. Never substitute prototype fixtures for dynamic values. Append later design instructions to existing AGENTS.md, preserving privacy/deployment/ownership rules.

## Added-feature inheritance

Attendance/corrections, payouts, fundraising transfers, withdrawals, parent-access controls and room administration inherit Anton headings, Segoe UI body, gold/purple actions, accessible themes, 8px cards, 4px controls, shared spacing and responsive table-to-card patterns. Use summaries/progressive disclosure without hiding required decisions. Preserve provisional/cancelled attendance, financial source distinctions and adult audit requirements.

Legacy tokens, typography, card recipe and breakpoints provide a foundation. Consolidate newer primitives onto that system rather than inventing another visual language.

## Preservation and approval gate

Paused family Attendance/reducer and Who’s Going work was preserved at owner-reported local checkpoint d47d85d, tag pre-design-fix-2026-10-12, on feature/student-status-design-audit, without publication at that checkpoint. This is not feature acceptance; focused tests before the pause do not replace interrupted full validation.

This audit makes no product corrections, domain-record changes, role changes, backend sync, real consent submission, Timeclock changes, production deployment or main merge. Temporary appearance preferences were changed for comparison and restored to System; Coach authentication and temporary viewport overrides were restored. No new application-check result is asserted for this documentation-only work.

**Coach approval is required before corrections.** Approve or revise presentation priorities, intentional differences and deferred functional items. After approved corrections, repeat affected role/screen comparisons at both widths/themes and relevant states, retaining named limitations. Only then can visual conformance be accepted; this audit does not claim it.

## Correction checkpoint — October 12, 2026

The Coach approved representative Readiness and authorized wider frontend work. The historical observations above remain the audit baseline. Current fixes, source review, validation and unresolved visual/backend dependencies are tracked in `docs/FRONTEND_CONFORMANCE_LOG.md`; do not interpret this checkpoint as closing every finding or every unobserved state.
