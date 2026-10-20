# Mentor Profile and individual fundraiser links

Development feature, October 20, 2026. Production release is not authorized.

## Behavior

Mentors land on their editable Profile. Report remains at /report and Settings remains available; /myprofile still works. Coach and Travel Lead landing pages are unchanged. Existing staff setup and skip preferences still apply.

Coach Money tools contains Student fundraiser links, listing active students in the current season with paginated loading. Paste each student's individual Zeffy URL and save. Updating replaces that student's link; clearing and saving removes it. No real links have been configured as part of development testing.

The student and their active linked parents see the same selected student's link on Money. Pay Now opens Zeffy in another tab with a payment-card icon. Share copies on desktop and uses native sharing on coarse-pointer mobile devices when available. Cancellation does not copy; failures fall back to clipboard, then a selectable link. No URL means neither action is rendered. Parent student switching resets share feedback.

## Data and authorization

Optional students.fundraiserUrl and fundraiserLinkRevision store the current-season link independently of profile revisions. Only Coaches edit. Student/parent reads enforce current-season, active-record and own/linked-student access. Saves use a revision fence and normal season-transition locks. URLs must be HTTPS on exact zeffy.com or www.zeffy.com, without credentials, explicit ports, fragments or whitespace. Audit data includes presence and revision, not URL query parameters. Season rollover does not copy these links.

These buttons do not process payments, confirm a payment, or change charges/ledger balances. Existing financial workflows remain responsible for recording payments.

## Evidence

- 11 focused tests across fundraiser authorization/update/clear, navigation and sharing passed.
- Independent combined source review found no blockers.
- Actual React components with isolated synthetic Convex/auth responses passed Mentor landing/report navigation, Coach update/clear, family copy/no-link hiding, and desktop 1440px light / phone 390px dark layout checks. Representative screenshots visually inspected; no horizontal overflow or page errors.
- Native sharing/cancellation/fallback exercised in automated mocks. A physical-phone share sheet and real Zeffy checkout were not exercised.
- Development third-bandicoot-18 synchronized with backend typecheck. No production deploy, real student write, email, invitation or payment.

Screenshots and browser fixtures remain ignored local artifacts. Previously recorded unrelated 501-charge fee-test timeout remains a separate follow-up; the full suite was not repeated for this feature.

Final integrated checks: lint, frontend/backend typechecks and application build passed. The build retains the existing large-bundle advisory.

Visual correction: the global anchor color overrode the Pay Now foreground in dark mode. The fundraiser action now explicitly uses the shared text-on-gold token. Browser checks confirmed #222 text/icon on #fdd023 in both themes; dark screenshot inspected.
