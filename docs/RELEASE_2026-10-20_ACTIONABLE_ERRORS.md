# Actionable error production release - October 20, 2026

Owner accepted the localhost scenarios and authorized normal production release of PR30. Release identifier: v0.1.0-onboarding.11. Implementation source: 67c2145.

Expected failures use explicit public error data and shared frontend formatting across Student Status. Parent invitations explain the one-hour cooldown and inbox/spam checks; answers remain available after failure. Network/session failures have recovery guidance; unexpected failures and legacy internal job diagnostics use safe contextual fallbacks.

Independent review has no blockers. Scoped lint, typecheck/build, development sync and eight phone/desktop browser scenarios passed. Broad regression initially passed 585 of 587; the two failures were corrected and all ten tests in those files passed on rerun. Eight fee-bulk tests passed separately; the historical >500-charge timeout remains unresolved. See ACTIONABLE_ERRORS.md for detailed evidence.

Production target: amicable-eel-413. No schema change, index deletion, data migration, seed, real invitation or financial write is part of this release. Existing main-only Cloudflare builds deploy Student Status and Timeclock after merge. Exact merged revision and final build/live verification belong in the GitHub release notes.

Rollback baseline: main 9deefe7; Student Status Worker 32f462c1-93ec-42fa-b964-8499f80a3a17 and Timeclock 0c126495-d6dc-4d1f-9617-1a1fabbab030. Code rollback does not undo records written after release. New saved error strings remain strings under the existing schema.
