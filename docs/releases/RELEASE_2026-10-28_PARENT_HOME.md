# Parent Home release — October 28, 2026

Released: Parent Home and Coach announcement audiences (Students, Parents, Both). PR #52 (`feature/parent-home`, source head `1b43843`) merged as main `bcda86a`.

## Scope

- Parent Home (`studentHome:parentSummary`) with FIRST registration, permission and balance action links.
- `announcements:pinnedForParentHome`; Coach announcements can target Students, Parents or Both.

## Order executed

1. Owner authorization: "Sync production, merge."
2. Production Convex `amicable-eel-413` synced from exactly `1b43843` (`bunx convex deploy` as the signed-in CLI user with `CONVEX_DEPLOYMENT=prod:amicable-eel-413`; a dry run first confirmed the target). No env vars, secrets, data or Cloudflare settings were changed.
3. PR #52 merged with a merge commit as main `bcda86a`; this auto-deployed both Workers.
4. Verification below.

## Schema (additive)

- Optional `teamAnnouncements.audience`. Schema validation passed and no indexes were deleted. The deploy also reported a Node.js action server-version config change. `studentHome:parentSummary` and `announcements:pinnedForParentHome` are present.

## Validation done

- Both GitHub check-runs on `bcda86a` succeeded (denham-venom-student-status, denham-venom-timeclock). PR #52 had no checks before merge.
- https://students.team8044.org and https://timeclock.team8044.org returned HTTP 200 unauthenticated.
- The Student Status entry bundle references `amicable-eel-413.convex.cloud` (no development deployment); a chunk contains the Parent Home string "Start FIRST registration"; no `__parent-home-preview` or developer sign-in strings are present.
- Development `third-bandicoot-18` signed-in checks covered Parent, Parent with staff access, Coach and Travel Lead.

## Validation limits

- No signed-in production walkthrough.
- The permission and balance action links were covered by unit tests only.
- Console warnings (next-themes script, favicon 404) are pre-existing.
- Worker version IDs were not recorded.

## Rollback

Restore the previous Worker versions (recorded in the [Student Home receipt](RELEASE_2026-10-27_STUDENT_HOME.md); confirm they are still the prior versions in Cloudflare). Keep the additive schema.
