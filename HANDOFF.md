# Handoff

October 22, 2026 | Branch: main

## Current status

**Main app**

- Accounts, setup/FIRST, events, rooms, transport, reports, money and season/history tools are implemented.
- Approved PDF records preserve reviewed/signed evidence; old Medication Choices are retired.
- Release records cover the live sites, event-time/Pay improvements, optimizations and Zeffy import; the owner confirmed automatic Zeffy runs and real-inbox parent sign-in on October 22.

**Timeclock**

- Integrated clocking has PIN controls, live status, automatic closing and a fixed roster during each selected event.
- Calendar checks run at 6 AM/3 PM Central plus manual refresh; the historical attendance import is complete.
- Single-device checks are accepted; the owner confirmed successful tablet/two-phone concurrency and reconnection checks on October 22.

## In progress

Documentation cleanup is complete and approved for publication on main; application and backend code are unchanged.
Phase 2 cleanup is complete: 50 files removed; two detailed contract documents remain until fully consolidated. See [remaining docs work](docs/BACKLOG.md#docs-cleanup).

## Top open risks

- Real PDF signing is deferred until the owner is ready; do not enable it. [Details](docs/BACKLOG.md#securityrecovery)
- Backup/restore proof and security reviews remain open. [Details](docs/BACKLOG.md#securityrecovery)
- Payment recovery, finance rollback and live-screen regression gaps remain. [Details](docs/BACKLOG.md#testing)
- Older waitlist, payment replay, event-date and fixture reports still need source triage. [Details](docs/BACKLOG.md#october-18-audit-follow-ups)
- Test-run failures and the unreproduced Pay contrast report need targeted follow-up. [Details](docs/BACKLOG.md#testing)

## Next development step after cleanup

Prepare a file-inclusive backup and isolated restore plan for owner review.

## Transportation dropdown - October 23

- New events and event transportation settings offer Charter Bus, School Bus, Team Carpool, and Provide your Own.
- Provide your Own hides driver/seat/rider controls, rejects ride-management mutations, and marks transportation not applicable. Existing assignment records remain preserved; new consent snapshots use the same enabled rule.
- Verified: lint, TypeScript, production build, 17 targeted transportation/UI/form tests, and development sync to third-bandicoot-18. Full suite: 646 passed with two unrelated failures (parent-invite mock call count and bulk-fee timeout); both suites passed in isolation (35 tests).
- Branch: fix/transportation-options. Production has not been deployed. Existing local documentation edits are preserved separately.

- PR #36 is open. Live development API verification passed for creation with Provide your Own, all three managed choices, persistence, readiness exclusion, ride-change rejection, and assignment preservation on switching back. Verification found and fixed the legacy admin.assignDriver bypass; its regression check passes. The synthetic event was cancelled, its assignment removed, and synthetic driver deactivated; no Calendar connection or fees were created.
- Follow-up validation: targeted tests (14) and lint passed; development sync typecheck passed. Authenticated browser walkthrough and responsive visual comparison remain pending development Coach sign-in; browser evidence currently reaches the real app sign-in screen only.
