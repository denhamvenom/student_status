# Mentor Profile and individual fundraiser links

Development feature, October 20, 2026. Production release is not authorized.

## Behavior

Mentors land on their editable Profile. Report remains at /report and Settings remains available; /myprofile still works. Coach and Travel Lead landing pages are unchanged. Existing staff setup and skip preferences still apply.

Coach Money tools uses a compact CSV import/export workflow instead of displaying an input for every student. Export the current-season roster with existing links, edit the Fundraiser Link column, upload and review before applying. Stable student IDs and revisions prevent name matching and stale overwrites. Blank links clear existing connections; review removals before saving. No real links have been configured as part of development testing.

Coach and Travel Lead roster views and team reports show Fundraiser Link as Connected or Disconnected, including report CSV exports. This status means a URL is saved; it does not claim Zeffy has verified the page or received a payment.

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


## October 20 - Fundraiser CSV and roster status (development)

Replaced the long Money tools link list with Download current CSV and Upload fundraiser CSV. Export includes names, stable IDs, revisions and existing links. Review shows canonical names and connection/update/removal counts; Coach applies one atomic batch of up to 500 rows. Blank links remove; omitted students remain unchanged. Stale, duplicate, unauthorized or invalid rows reject the batch. Coach/Travel rosters and team reports (including CSV) show Fundraiser Link as Connected/Disconnected, without exposing URLs in Travel projections.

25 focused tests passed; independent source review found no blockers. Synthetic browser workflow passed export, removal review, apply, malformed-file rejection and desktop/light plus phone/dark layout checks. Phone screenshot inspected. No real student links, payments or invitations changed. See MENTOR_PROFILE_FUNDRAISERS.md. Production unchanged.

CSV checkpoint final checks: development sync with backend types, lint, frontend types and build passed. Fixed an empty-roster row reference caught by the integrated typecheck.
