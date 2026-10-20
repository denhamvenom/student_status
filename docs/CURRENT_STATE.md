# Current integration handoff

## Staff setup production release

Owner accepted and authorized release of reviewed source280bc81. Production Convex amicable-eel-413 deployment succeeded with typecheck/schema validation; no indexes deleted. Website merge/build evidence is recorded on the release PR and GitHub release. See RELEASE_2026-10-20_STAFF_SETUP.md and STAFF_SETUP_WIZARD.md.

The four-step staff wizard offers optional basics and driving/trailer details, skips individual fields without erasing saved values, supports temporary/permanent dismissal, uses shared contact phone and omits account email. Existing driver approval safeguards remain. Coach Profile supports later edits.

17 focused backend tests, independent review, synthetic desktop/phone checks, lint/types/build passed. Earlier full suite561/562: unrelated501-charge fee test exceeded30seconds; leave that recorded follow-up separate. No real profile edits, migrations, invitations, emails or environment changes during release checks.

Root owns release integration in student-status-bulk-invite, feature/parent-email-invitations. Other chat holds shared sync/merges until completion handoff. Development email remains disabled; Calendar writes stay production-only.
