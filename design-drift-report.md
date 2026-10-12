# First design drift audit report — October 12, 2026

**Draft for Coach review. This is not a completed all-role visual audit. Audit only; no design corrections are approved by this document.** Product development remains paused. This report compares the current Student Status implementation with the extracted `Design_Comparison.zip` reference. It does not approve production, real consent, backend changes, Timeclock changes or a main merge.

## Reference authority and intentional differences

Use the latest explicit user decisions first, then the Flow index **What changed in v2 (Oct 2026)**, the clickable prototype, and finally the handoff README. The reference is a design artifact, not production code. Its black review toolbar must not ship. The extracted `design-reference/` remains ignored; screenshots and account/student records must not enter Git.

The following newer requirements take precedence over older prototype behavior and must survive visual alignment:

- Who’s Going means **Travel Team, Whole Team, Open Registration**, not selecting individual students. The paused local draft has not received final functional acceptance. Historical approval events remain supported.
- Parent invitations expire after seven days, replacing the older fourteen-day reference.
- Attendance uses the shared Timeclock backend, audited corrections and preserved original evidence. Family totals stay separate from legacy meeting counts; family views must not expose correction actors, reasons or private evidence. The family Attendance draft is unfinished.
- Actual cash/check payout records use available personal funds only. Fundraising credits retain their source and may transfer under the approved permission and season rules; they cannot become cash payouts.
- Waitlist promotions remain manual and chronological. Student room changes close at the deadline; audited adult corrections remain possible under the approved rules.
- Withdrawal review preserves the approved payment-source dispositions. Real consent remains gated on approved wording; health permissions and retention decisions remain separate work.

Newer features without an exact prototype counterpart inherit its typography, palette, spacing, layout and component states. They do not require a fabricated one-to-one screen match. The README instruction to flag every additional field does not override these subsequently approved features.

## Evidence and coverage

**Source inspected:** reference README, tokens, component examples, navigation and decoded Flow index; current `src/LiveApp.tsx`, `src/styles.css`, `src/shadcn.css`, shared Card/Button components and operations styles. Source findings identify actual class/token/structure differences, but are not claims of rendered pixel comparison.

**Browser evidence reported by the integration owner:** eleven loaded Coach screens have paired reference/build captures at 1440px and 390px in light and dark themes. Only priority screens have been visually inspected so far; capture completion is not visual acceptance. Inspected priorities include phone readiness, desktop event workspace and finance. Readiness reaches 437px document width at a 390px viewport. Student, Parent, Travel Lead and Mentor are source-reviewed with live visual matrices pending. Existing Parent/Travel browser handles returned empty snapshots, which do not count as visual inspection. The owner restored the Coach system theme and viewport after capture. Exact route inventory and remaining visual findings will be appended by the owner.

**Not established by this draft:** complete visual inspection of every capture; complete Student, Parent, Travel Lead and ordinary Mentor coverage; keyboard/screen-reader behavior; all loading, empty, error, disabled and long-content states. Earlier no-overflow smoke checks and automated functional tests do not establish design fidelity. Unimplemented routes must be identified as unimplemented, and unavailable authenticated roles as blocked, rather than counted as inspected screens. The synthetic review shell is not evidence that the authenticated live screen matches it.

## Drift findings

The table uses the requested six columns. “Yes” includes dependencies whose existing backend coverage still needs validation; it does not authorize backend work. Evidence labels distinguish source inspection from owner-reported browser comparison.

| Screen | Element | Prototype shows | Build shows | Type: wording, option list, layout, styling, missing state or behavior | Needs a backend change? (yes/no) |
| --- | --- | --- | --- | --- | --- |
| New event / Who’s Going | Wizard presentation | Centered dialog, compact six-step progress, outlined choice cards with descriptions, separated Cancel/Back/Continue actions. | Browser inspected: full-page form, six large step buttons and a small dropdown. Preserve the user's newer three categories: Travel Team, Whole Team, Open Registration. | layout, styling | no |
| Family Status | Financial summaries and to-dos | Raised and individual travel share are distinct; to-dos grouped by event. | Source review: charged/balance summaries and flatter to-dos. Do not relabel charged money as fundraising raised. | wording, layout, missing state or behavior | yes |
| Coach / Travel Lead readiness, phone | Event selector and page width | Core tasks fit the phone viewport without horizontal scrolling. | **Browser reported:** readiness reaches 437px at 390px; event selector overflows. | layout | no |
| Coach / Travel Lead readiness, phone | Student requirement detail | Detailed per-student requirement lists, with meaningful open states. | **Browser reported:** sparse open badges and FIRST actions lose the reference’s detail and hierarchy. Verify the available readiness projection before proposing new data. | layout, missing state or behavior | yes |
| Coach / Travel Lead readiness | Transportation, rooming and export sections | Transportation/rooming summaries and report exports below student readiness. | **Browser reported:** reference sections are not represented at equivalent depth. Report/export data and access rules need a separate implementation assessment. | missing state or behavior | yes |
| Phone shell, Coach directly compared | Bottom navigation labels and surface | Rendered reference uses short labels such as Money and Readiness on a light surface in the compared state. | **Browser reported and source corroborated:** dark bottom bar and longer shared desktop labels such as Finances and Event readiness. Compare both themes before selecting exact surface tokens. | wording, styling | no |
| Staff desktop shell | Navigation grouping | Role-specific grouped navigation rather than a single undifferentiated list. | **Source:** `LiveApp` maps all role menu entries into a flat row. | layout | no |
| Adult event workspace | Section navigation and information density | Sticky Overview / Participants / Requirements / Transport / Rooming navigation, collapsed sections and one-line summaries. | **Source:** event operations, transport and room controls are rendered sequentially after the overview. | layout, missing state or behavior | no |
| Coach event workspace, desktop | Form hierarchy and action styling | Consistent cards, section hierarchy and branded actions. | **Browser reported:** long mixed-card forms and short black shared-component buttons. | layout, styling | no |
| Coach event workspace | Requirements empty-state copy | Role-appropriate participant/requirement context. | **Browser reported:** Coach sees the family-oriented “Select a linked student” message. Use the staff participant context without changing parent scope. | wording, missing state or behavior | no |
| Coach finances | Page heading and operations panel | One clear page heading with subordinate sections and consistent cards. | **Browser reported:** duplicate H1 headings and a separate 16px-radius operations panel. | layout, styling | no |
| Permission draft, phone | Vertical spacing between cards | Distinct cards separated by the shared spacing rhythm. | **Browser reported:** draft cards have no vertical gap. The unsigned development restriction remains intentional. | layout | no |
| Drivers, dark theme | Save Driver action | Gold primary action with readable dark text and handheld control sizing. | **Browser reported:** short white Save Driver button. | styling | no |
| Join requests | New parent-invitation toggle and shared controls | Added controls inherit existing card, action and input styles. | **Browser reported:** added toggle section inherits legacy cards, but shared controls are inconsistent with them. Preserve the approved invitation control and server enforcement. | styling | no |
| Screens using shared Button/Card/Badge, including operations | Brand and theme tokens | Gold primary actions, purple secondary actions, specified light/dark surfaces, borders and readable purple text. | **Source:** `shadcn.css` retains generic monochrome tokens; `styles.css` defines a separate brand token family. Shared primitives consume the generic family. | styling | no |
| Shared cards and finance operations | Card shape and border | 8px cards, 1px specified border and small shadow. | **Source:** legacy `.card` matches the basic recipe; shared Card uses 14px radius and a generic ring, while FinanceOperations uses 16px radius. | styling | no |
| Shared card sections and finance operations | Heading hierarchy | Anton 400 section headings generally 22–30px, with distinct body/meta text. | **Source:** shared CardTitle defaults to 16px medium weight; finance panel heading is 19.2px. Confirm the role of each title before applying section-heading sizing. | styling | no |
| Operations using shared buttons | Control sizing and shape | 4px control radius and at least 44px touch targets in handheld use. | **Source:** shared Button default is 32px high, large 36px, with 10px radius; callers do not uniformly override this. | styling | no |
| Shared card screens | Heading semantics | A clear navigable page/section hierarchy. | **Source:** CardTitle renders a `div`; visual title sizing alone does not establish semantic headings. Review heading levels when aligning cards. | missing state or behavior | no |
| Staff/family unimplemented destinations | Complete screen states | Functional reference screens for reports, administration and other workflows. | **Source:** some menu destinations fall through to “This workflow is not implemented yet.” This is unfinished product scope, not a CSS defect. Inventory each destination before estimating work. | missing state or behavior | yes |

The readiness detail and export rows are conservatively marked **yes** until the owner confirms whether existing authorized queries supply all necessary fields. If they do, reclassify the presentation portion as **no**. Export generation, field permissions and incomplete domain workflows must not be smuggled into a visual correction pass.

## Proposed correction order, subject to approval

The first shared-label change should derive stable keys from `source/ui-copy.json`, with documented overrides for later user decisions. Do not replace dynamic student/event values with reference fixtures. Missing copy is a review item, not permission to invent a new workflow. Append design rules to the existing AGENTS.md; never replace its privacy, deployment and coordination instructions.

1. Fix the confirmed readiness phone overflow and align role-specific short navigation labels. Verify 390px, both themes and long event names.
2. Align shared semantic tokens, cards, buttons, headings and states with the reference. Reuse the existing React/Base UI stack; avoid a separate visual system for newer operations.
3. Restore staff navigation grouping and event workspace section hierarchy while preserving current permissions, mutations, form state and audit behavior.
4. Address approved screen-specific information hierarchy. Separate frontend presentation work from missing data, exports or workflows requiring later functional scope.
5. Recompare every affected role/screen at 390px and 1440px in light and dark; include empty, loading, error, disabled and long-content cases. Obtain final visual review before checking off conformance.

## Added-feature visual inheritance

Coach attendance/corrections, family attendance, payouts, fundraising transfers, withdrawals and room administration should use the same Anton heading hierarchy, Segoe UI body, gold/purple semantic actions, readable theme tokens, 8px cards, 4px controls, spacing rhythm and responsive table-to-card patterns. Source distinctions, provisional/cancelled attendance, financial source balances and audited adult corrections must remain understandable. Use compact summaries and progressive disclosure where the prototype does, without hiding required decisions or authorization boundaries.

The implementation already has several aligned foundations, including the legacy card recipe, brand token palette, desktop/phone breakpoint rules and basic page typography. Prefer consolidating newer components onto that shared system over restyling every screen independently.

## Paused work and approval gate

Unfinished family Attendance/reducer and Who’s Going edits were reviewed only for preservation as a local checkpoint, not publication or final feature acceptance. The integration owner reports checkpoint `d47d85d`, local tag `pre-design-fix-2026-10-12`, and audit branch `feature/student-status-design-audit`; this checkpoint has not been pushed. Family attendance had focused passing tests before the pause; its full follow-up validation was interrupted. This design audit must not resume that implementation, synchronize the backend or imply acceptance.

**Coach approval required before corrections:** approve or revise the listed visual changes and intentional differences; identify any deferred rows and separately authorize functional/backend work if desired. The integration owner will complete the browser inventory and visual findings before presenting this report for approval. This draft changes documentation only.

## Screen inventory and remaining acceptance

Paired Coach captures cover Team, Event readiness, Event workspace, Finances, Permission forms, Drivers, Join requests, Fundraising, Reports, Users & Roles and Season at both requested widths and themes. Priority image inspection covered readiness, event workspace, finances, permission draft, drivers, join requests and roster; remaining captures still require systematic review. New-event step two was inspected separately; its first reference capture was 1280px rather than 1440px and is not counted as matched-width acceptance.

Fundraising, Reports, Users & Roles, Season and My profile currently have generic unfinished destinations. Parent Forms and adult Permission forms render the unsigned permission draft, not the final workflow. Student record detail has no equivalent live screen. Student/Parent Status, Events, Finances, Profile and parent linking; Travel and ordinary Mentor views; and modal/error/empty states require further authenticated visual acceptance. No role or access grant was changed for this audit.

Reference archive SHA-256: `a05ef834d964b1ed9e39ea46fdc7e0d2241f0b191c63ddb77a0ba1837e601e06`. Extracted folders: assets, prototype, source, tokens. README was read and prototype/index.html opened through a local reference server. Private browser captures remain outside the repository. No application checks were rerun for this documentation-only audit, and no backend synchronization or production action occurred.
