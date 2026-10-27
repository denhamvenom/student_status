# Student Home release — October 27, 2026

Released: Student Home redesign, Student shell, pinned announcements and the build hours target. PR #48 merged as main 6937fa2 (source head d89ded8).

## Order

1. Production Convex `amicable-eel-413` synced first. Schema validation passed and no indexes were deleted. Added `teamAnnouncements.by_seasonId_and_archivedAt_and_createdAt` and `teamAnnouncements.by_seasonId_and_pinned_and_pinnedAt`. The `announcements:*` functions are present. The schema change is additive; no migration.
2. PR #48 merged to main.

## Validation

- Both GitHub check-runs succeeded (denham-venom-student-status, denham-venom-timeclock).
- https://students.team8044.org and https://timeclock.team8044.org returned HTTP 200 unauthenticated.
- Entry bundles reference `amicable-eel-413.convex.cloud`; the lazy chunk contains the Student Home strings.
- Limits: no signed-in production walkthrough; live scenarios ran only on development `third-bandicoot-18`; `bun run check` had only intermittent heavy timeouts (bulkInvites, feeBulk; each passes alone); Worker version IDs were not recorded.

## Rollback

Restore the previous Worker versions (previous Student Status version: 4970df44-a078-4501-a53f-7ce013e93db4, recorded in the [10-25 receipt](RELEASE_2026-10-25_VENOM_STATUS.md); confirm it is still the prior version in Cloudflare). Keep the additive schema.

## Open

A Coach must click Recalculate attendance once on production; build minutes may not be populated for existing attendance until then.
