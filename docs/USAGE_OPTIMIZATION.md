# Database and frontend optimization - October 21, 2026

Development branch: perf/reduce-database-reads-2026-10-21, based on released main 357bd4f (v0.1.0-onboarding.11). User requested convex-cost and web-perf, minimal complexity, and verified development savings before production. No production approval for this work.

## Changes

- Coach roster time arguments stay stable until the earliest event start passes. A Coach-only indexed nextTransition query supplies that boundary, including archived events because they affect the existing bounded upcoming window. Real data changes still flow through Convex subscriptions. Hidden tabs catch up when visible.
- Timeclock event/calendar queries use a stable Chicago day-start argument. Existing 15-second visible clock computes event expiry and calendar freshness locally from subscribed records. Mutation-side authorization and time checks remain unchanged. Chicago midnight changes the query argument, including DST transitions.
- Roster rows reuse FIRST status already read by competition readiness. Team finance reports defer summaries until accounts are ready and query failed accounts only when required.
- Sign-in loads its existing UI first; authenticated workspaces load through React lazy/Suspense after viewer resolution. Public invitation routes retain their existing behavior. No new dependency, cache, table, index, background job, or service.

## Measured development savings

| Workload | Before | After | Interpretation |
|---|---:|---:|---|
| Actual Timeclock component, one simulated quiet hour | 241 argument sets per event/calendar query | 1 each | 99.6% fewer time-driven subscription argument sets, including initial load |
| Coach roster, quiet visible hour | 60 time-argument changes | 0 | Excludes initial subscription and genuine data updates |
| Coach roster, hour with one event boundary | 60 changes | 1 | Refresh occurs at event start + 1 ms |
| Team report before accounts ready, 12 synthetic students | 27 documents / 8,736 bytes | 15 / 4,104 | 44.4% fewer documents; 53.0% fewer measured bytes |
| Competition roster details, 12 synthetic students | 76 documents / 19,162 bytes | 64 / 16,582 | 15.8% fewer documents; 13.5% fewer measured bytes |
| Public sign-in JS, browser decoded resource sizes | 1,316,381 bytes | 644,454 bytes | 51.0% less initial JavaScript; authenticated code deferred, not deleted |
| Public sign-in JS, build gzip estimates | 374.03 KB | 197.60 KB | 47.2% smaller initial compressed JS |

Backend measurements use convex-test transaction metrics in convex/readCost.test.ts with the same synthetic fixture before/after. They are development measurements, not production billed bytes. Timing argument tests are src/lib/roster-refresh.test.ts and src/timeclock-event-clock.test.ts. Actual Timeclock browser harness uses original main source versus current source, mocked queries and a simulated clock; it makes no backend writes. Its snapshots/JSON remain ignored under tmp/perf-timeclock.

Chrome DevTools trace on local optimized production-mode builds connected to development: sign-in LCP 433 ms before / 419 ms after, CLS 0.00 both, no CPU/network throttling. This small timing difference is not claimed as a reliable speed improvement. The measurable improvement is download size. Render-blocking estimated savings were zero, so no speculative CSS rewrite was made. Full authenticated download is deferred and includes a small chunk-loading overhead.

## Verification

- Independent Astra focused review: no blockers in auth/invitation loading, timer boundaries/visibility, local expiry, or read reuse.
- Integrated regression: 596 tests / 112 files passed; separate fee-bulk suite 9 tests passed, including the historically slow >500-charge case (21.90-second suite). Total 605 passed. No tests skipped in these combined runs.
- Scoped source lint, root typecheck/build, and Timeclock lint/typecheck/build passed. Existing root large-chunk advisory remains; no dependency changes.
- Development third-bandicoot-18 sync succeeded with typecheck enabled. Production amicable-eel-413 unchanged.
- Actual Timeclock browser comparison: event button expires at one minute, calendar-delayed warning appears, 241-to-1 argument sets, no horizontal overflow at phone width.
- Sign-in before/after at 390px dark and 1440px light: identical visible copy, working role navigation, no overflow. Parent invitation route loads the deferred workspace and shows its existing unavailable-link recovery state without submitting a form.

## Limits and next step

Savings depend on open-page duration and actual record updates. No guarantee of a particular monthly bill reduction; the usage dashboard includes accumulated historical consumption that these changes cannot erase. Broad Timeclock event ranges, minute calendar cron and healthy team-total scans remain unchanged; no speculative index or aggregate infrastructure was added. Further work should follow observed post-release usage.

Ready for owner development review, then explicit release authorization. Real development app uses localhost:5173; optimized build preview is 127.0.0.1:5185 (sign-in UI/performance review only; OAuth redirect settings remain the normal development origin).
