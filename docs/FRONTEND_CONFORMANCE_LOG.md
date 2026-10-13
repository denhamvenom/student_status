# Frontend conformance work log

## October 12, 2026 — rollout authorized

Coach approved representative Readiness and authorized remaining frontend conformance. Baseline: published PR9. The original design reference stays immutable in sibling student-status-operations/design-reference. Existing paused backend drafts are excluded.

Owners: integration owner — shared shell, tokens, LiveApp screens, browser evidence and Git; Sol operations — travel, withdrawals, attendance, event/room presentation; Sol family operations — finance editor, parent invitations and permission draft; Astra — coordination and final review.

- [x] Shared role-aware shell and component tokens
- [x] Family Status, Events, Finances, Profile and parent context presentation implemented; full visual matrix below remains open
- [x] Coach roster, Event workspace, New Event presentation
- [x] Travel, withdrawals, attendance and room presentation
- [x] Parent access, permission draft and finance editor
- [ ] Role/viewport/theme comparisons, source checks and final review
- [ ] Reviewed Git checkpoint and updated checklist

No backend, generated API, domain logic, role changes, real consent, Timeclock or production changes. Missing workflows remain explicit dependencies rather than nonfunctional imitations. Verification cells and limits will be recorded below as completed.

## Implemented checkpoint — October 12

- Shared role-aware shell reuses approved Readiness navigation, mobile menu, themes, typography and spacing. Role filtering and backend access rules are preserved. Travel Settings/Profile are grouped under Account; Mentor phone labels follow reference copy.
- Shared Base UI controls now follow the reference control/card sizing, radii and foreground colors. The reference UI-copy snapshot and shared label helpers are installed. Complete migration of legacy inline screen copy remains open.
- Family Status uses a money stat grid and event-grouped to-dos. Finances uses existing-value summary tiles, source-separated available funds, event-grouped charge cards and preserved transaction history. `Applied to charges` accurately includes credits; no unsupported team-raised total is invented.
- Event listings use the existing authorized family dashboard projection for participation and wait for it before showing badges. Event workspace uses section navigation and shared cards. New Event uses a compact six-step panel with category choices; Whole Team remains disabled because its backend contract is excluded. This remains a page route, not the prototype modal.
- Coach roster gains client-side search/subteam/travel filters over existing authorized rows. Driver list gains detailed cards and conditional Add/Edit form. Withdrawal, attendance, room and event-operation cards share the design system. Room query failures have a scoped return/retry boundary.
- Parent invitations and permission draft use shared card/form patterns. Seven-day invitation policy and unsigned draft restrictions are preserved.

## Verification and evidence limits

Astra accepted final source review after foreground-token, open-only capacity, navigation-group, event-loading and choice-keyboard findings were fixed. Full `bun run check` passes: lint, strict types, 101 tests across 18 files, production bundle build. The first sandbox run failed on the known Windows temporary-module ENOENT; the unchanged check passed outside the sandbox. Vite retains its large-bundle advisory (~791 kB minified). Cloudflare packaging dry run completed without upload; sandbox prevented its optional global log-file write.

Browser evidence is private outside Git. Only valid captures count; distorted narrow-strip images are explicitly rejected.

| Surface/state | Observed evidence | Remaining limit |
| --- | --- | --- |
| Approved Coach Readiness | Prior four-combination comparison and Coach approval; shared shell retained | New populated cells require actual backend projections |
| Coach New Event audience | Final PNG captures at 390/1440, light/dark reviewed by Sol; category controls and progress clear | Page rather than modal; Whole Team unsupported; full four-combination coverage of every step remains open |
| New Event navigation | Open Registration reveals capacity; steps 3–6 and review reached; Cancel discards unsaved draft | No event submitted during presentation review |
| Coach Event workspace | Corrected full desktop light capture valid; phone light full workspace valid | Earlier desktop images invalid; dark phone lower sections not fully verified |
| Drivers | Four-combination list captures reviewed; detailed cards fit | Add/Edit populated states not exhaustively compared |
| Finance | Final desktop light and phone light loaded cards/forms observed; phone DOM has no horizontal overflow; dark captured | Coach aggregate overview needs backend data; complete dark/lower-form visual acceptance remains open |
| Student | Events verified Withdrawn; profile phone dark and desktop light; valid Parents desktop light | Latest Status card rewrite source-reviewed; all family state/theme combinations not yet complete |
| Parent | Verified Viewing context, Withdrawn event details, unsigned permission draft desktop dark and phone themes | Multiple children, invitation variants and real signing unavailable/unexercised |
| Attendance/Withdrawals | Empty/unselected Coach states visually checked | Loaded corrections and paid decisions require separate state rehearsal |
| Mentor/Travel | Shared role menus source-reviewed; existing authorization gates preserved | Final role-specific browser pass remains open; no role grants manufactured |

## Remaining conformance work

- Complete the outstanding visual/state matrix above and migrate remaining inline copy into shared labels.
- Resolve prototype-backed functional dependencies separately: Whole Team enrollment, aggregate Coach finance/roster projections, family Attendance, missing form/signature workflow, exports and unsupported report controls.
- Obtain final Coach visual acceptance after remaining review. This checkpoint is not a claim of whole-app pixel parity or production readiness.
- Maintain the existing Git/main/production boundaries. No backend, generated API, dependency, Timeclock or deployment configuration changed.

### Final follow-up verification

Travel Lead signed in through its existing authorized Chrome session: Team roster and Account group loaded; Finances exposed only read-only account information with no charge/payment/payout controls; phone Readiness loaded existing student/transport/room status and correct role navigation. No role grants or domain changes. The Chrome screenshot timed out, so these are DOM/behavior observations rather than a completed visual matrix. Temporary viewport overrides were removed.

New Event wording was extracted into a shared `event-copy.ts`, preserving reference step/action labels and approved newer audience wording. Open Registration capacity and all six steps were navigated without submission, then cancelled. The parent/student theme choices were restored to System; Coach review returned to Readiness. No fixture records were created or altered for this frontend pass.

Parent invitation and permission-draft wording now uses `family-copy.ts`; Dashboard/Finance and legacy operation strings still require further shared-copy consolidation. Copy extraction passed targeted lint/types; final integrated lint/types/build are rerun after extraction. A blank roster subteam filter option observed in Travel review was removed without changing rows or domain values.

## Git checkpoint

Local reviewed implementation commits: `2cdcd34` shared controls; `db738e1` operations cards; `b4ef144` role shell/reference labels; `24aa091` family/event views and shared copy. Final lint, typecheck and build after copy extraction pass; bundle advisory is approximately 796 kB minified. Astra accepted the final copy-only review. Publication is recorded separately after remote verification.
