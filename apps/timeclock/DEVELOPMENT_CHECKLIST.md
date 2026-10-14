# Timeclock development checklist

Status: frontend implemented; development rehearsal and keyboard/touch checks advanced October 13, 2026. Visual approval and production release remain separate. Follow-up checkpoints are on feature/timeclock-frontend, draft PR 6.

## 1. Foundation — complete
- [x] Isolated frontend worktree and branch; Student Status remains at repository root.
- [x] One shared Convex backend, exclusively maintained/synchronized by Student Status integration.
- [x] Frontend changes confined to apps/timeclock; root dependencies and generated files unchanged here.
- [x] Sol implementation/design and Astra source review.

## 2. Interface — implemented and checked
- [x] Student Status branding, phone/desktop layouts and light/dark themes.
- [x] Google operator access gate and explicit connection errors.
- [x] Calendar selection, finished states and calendar freshness.
- [x] All-day end-time setup and unscheduled name/duration.
- [x] Shared browser-profile console selection across tabs.
- [x] Active reviewed roster, chosen-name display, surname ordering supplied by backend, duplicate-name handling.
- [x] Individual and Group clocking with reactive status.
- [x] PIN-gated transfers, extensions, event switching and sign-out.
- [x] Same-key uncertain-request retry, offline control disabling and reactive closing.
- [ ] User visual approval; no speculative redesign or production approval implied.

## 3. Automated verification — passed at published frontend checkpoint
- [x] Root lint, strict types, 77 backend tests across 12 suites and Student Status build.
- [x] Timeclock lint/types/build and Cloudflare packaging dry-run.
- [x] 34 synthetic browser scenarios: phone/desktop light/dark, clocking, group selection, PIN rejection/success, transfer, creation, automatic return, revoked access, disconnection, retry and two-tab profile identity.
- [x] Astra final source/harness review accepted; no blocking source findings.

The browser harness intercepts transport only inside Playwright and does not ship a production fixture bypass. It is not live backend evidence. One known React development warning from next-themes initialization is recorded separately; no runtime errors occurred. Screenshots/results stay in ignored test-results/timeclock. On October 13 the backend owner identified a dated all-day regression fixture in the old baseline and owns its repair and current integrated regression run; this frontend chat did not duplicate that work.

### October 13 frontend usability follow-up
- [x] Reproduced and fixed dialog Tab escape and lost focus after dismissal. Tab/Shift+Tab now cycle within the dialog; Escape and Cancel return focus to the original control when it still exists.
- [x] Keyboard Space selects a group checkbox; unresolved name collisions remain disabled.
- [x] At 320px width, visible buttons and checkbox labels meet the 44px touch-target check; a short 480px viewport keeps dialog actions reachable by scrolling.
- [x] Reproduced overflow from a 160-character unbroken event title; text now wraps within the narrow viewport.
- [x] Updated synthetic harness: 38 checks pass with no runtime errors. Timeclock lint, strict types and build pass. These are browser simulation checks, not physical-device or assistive-technology certification.
- [ ] User visual approval and physical-device rehearsal remain pending.

## 4. Live development evidence
### Reported by Student Status integration on October 12
- [x] Coach Google sign-in, reviewed fictional name, live clock-in and same-profile cross-tab status.
- [x] Browser-independent scheduled closure at the exact end; sub-hour interval did not qualify attendance.
- [x] Coach append-only correction preserved original evidence and updated duration.
- [x] Mentor clock-in/out and preserved role boundaries.

### Directly verified by Timeclock on October 13
- [x] Existing Mentor session created explicitly synthetic unscheduled events.
- [x] Wrong extension PIN rejected; correct PIN added one half-hour while keeping original scheduled window visible.
- [x] Event switch required PIN and returned to selection.
- [x] Student already IN elsewhere showed conflict; named confirmation and PIN transferred to the selected event.
- [x] Independent Mentor Chrome and Coach in-app browser sessions on the same computer observed each other's IN/OUT changes.
- [x] Wrong sign-out PIN rejected; correct PIN returned Mentor to Operator sign-in.
- [x] Synthetic student left OUT; no production or real student records used. Coach browser identity preserved.
- [ ] Deterministic live simultaneous-request proof: an attempted pair of UI clicks was inconclusive because controls can change between clicks. Do not count it as a passed concurrency test. Automated transactional tests remain the concurrency evidence.
- [ ] Physical separate-device/network rehearsal. Localhost origins do not establish this; coordinate approved staging/origin setup before testing another device.

## 5. Publication and integration
- [x] Source/fixtures reviewed for secrets and student records.
- [x] Frontend implementation c73a6a3 and publication documentation fbb4148 pushed to feature/timeclock-frontend.
- [x] Draft PR: https://github.com/denhamvenom/student_status/pull/6, based on feature/timeclock-backend.
- [x] Direct implementation and live-rehearsal handoffs sent to Student Status integration.
- [x] Integration owner reported original frontend integration in merge 3946b88 and subsequent combined checks (216 root tests plus Timeclock lint/types/build). This is owner-reported evidence, not a rerun against this older frontend worktree.
- [ ] Integration owner incorporates the October 13 usability follow-up and checks the combined branch. Never merge main or independently sync shared Convex from this frontend checkout.

## 6. Remaining scope
- [x] October 14 tablet review: active clocking hides identity/sign-out, uses a moon/theme switch, smaller event controls and header, and two roster columns from 700px with 44px touch controls. Success notices clear after four seconds. Event selection retained; user approved that screen. Expanded synthetic suite passes 52 checks including 820px tablet/light/dark; active sign-out absence verified. Full clocking visual approval still pending.
- [x] October 14 wording review removed the DEVELOPMENT header and environment-file setup instructions, and simplified console, connection, event-switch and transfer copy. Timeclock lint/types/build pass. User visual review is in progress; browser-tool access was blocked, so no new live visual verification is claimed. Local preview remains development-only.
- [x] Added plain-language SEASON_TRANSITION response explaining paused actions and continued clock-out access. Backend transition guards and live cutover verification remain with Student Status integration.
- Other synthetic names still require explicit Coach review; do not infer surnames or reseed.
- Student Status owns reporting, name review, correction UI and shared backend readiness.
- Historical Sheets import, production domain/configuration, physical-device rehearsal and release approval remain separate work.
- Keep account addresses, PIN, credentials, record IDs and live screenshots out of Git/GitHub.

## Resume and run instructions
Worktree: Development Version/student-status-timeclock-ui. Frontend source base: 6bf4b71; the integrated backend has since advanced under its owner. Do not run old backend codegen/watchers/syncs here.

From repository root: bun run dev:timeclock; bun run check:timeclock; node apps/timeclock/tests/browser-check.mjs; bun run cloudflare:timeclock. Browser checks require the local preview and installed Edge. Use the host environment for Windows sandbox temporary-module/browser failures without weakening tests. Preview uses http://localhost:5174/ for exact Google redirect matching. Local preview restarted October 13 for rehearsal. Earlier October 12 pause was explicitly superseded by the user's resume; current work is active within the agreed ownership boundaries.
