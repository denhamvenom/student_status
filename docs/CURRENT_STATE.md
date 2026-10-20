# Current integration handoff

## Contact formatting production release

Owner authorized release of fdabbe3. Production Convex amicable-eel-413 deployment succeeded with typecheck/schema validation; no indexes deleted. Website merge/build evidence is recorded on the release PR and release notes. See RELEASE_2026-10-20_CONTACT_FORMATS.md and CONTACT_INPUT_FORMATS.md.

Shared phone/email input formatting and backend validation apply throughout contact entry. Optional blanks and unchanged legacy contacts preserved; historical signed snapshots/OAuth identity unchanged. 84 backend/helper tests covered, two CSV tests passed, independent review, browser checks and lint/types/build passed. No real record submits or emails during release.

Root owns release integration on feature/parent-email-invitations. Other chat holds shared sync/merges until handoff. Development email stays disabled and Calendar writes production-only. Historical unrelated501-charge fee timeout remains separate.
