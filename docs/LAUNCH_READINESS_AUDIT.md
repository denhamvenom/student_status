# Bounded launch audit — October 16, 2026

Source: Student Status `caf8ce3`; latest separate Timeclock frontend `15f074d`. Read-only independent security, Timeclock and usage reviews; existing checks reused. Development visual review remains closed. This report does not authorize deployment, account migration, paid upgrades or record changes.

## Result

No substantiated exploitable authorization bypass was found in inspected paths. Both apps still need production preparation. This is a source/configuration review, not a penetration test or certification of production settings.

Security review covered Google verified identity, active-account guards, student/family scope, ordinary Mentor minimization, finance grants, invitation identity/expiry, permission PDF authorization, export ownership and Timeclock role/PIN enforcement. Existing helper-based enforcement was retained. The source secret-pattern scan found synthetic test material, not a confirmed exposed credential; exhaustive Git-history scanning and dependency vulnerability inventory remain unperformed.

## Required launch work, in order

| Work | Evidence and smallest adequate completion condition |
| --- | --- |
| Integrate Timeclock frontend | Separate frontend is at `15f074d`; integrated UI/CSS/browser checks differ. Reconcile that work without restarting either app; run relevant combined checks once. |
| Reduce avoidable reads | Address repeated season-meeting reads and time-parameter churn below. Preserve freshness and attendance semantics; measure representative load before promising a bill. |
| Real signing | `convex/permissionsV2.ts:20` explicitly limits signing to development; snapshot creation/parsing require synthetic evidence. Implement a reviewed production mode through preparation, submission and receipt validation. Do not merely remove the URL guard. Preserve approved PDF and historic synthetic receipts. |
| First production Coach | Development bootstrap is intentionally guarded (`convex/bootstrap.ts:61`). Prepare a narrowly scoped internal procedure for the verified production Coach identity; no synthetic-record promotion or relaxed seed guard. |
| Ownership and hosting | Confirm Team Workspace ownership of Google project and intended Convex organization. Configure two GitHub-connected Workers with approved domains, separate build roots and production endpoint. Verify OAuth origins/callbacks and external-user audience. |
| Recovery and operations | Decide backup plan/cost, include files, prove isolated restoration, preserve code/config separately and recover scheduled work. Document monitoring, rollback and five-year archival retention/holds. Keep deletion disabled. |
| Final real-origin/device checks | Verify sign-in/invitation return/sign-out/access at approved domains after explicit deployment approval. Rehearse one tablet and two phones, concurrent clock/transfer, reconnection and handoff. Use an ordinary Mentor on shared hardware, without finance/health/Travel Lead grants. |

Timeclock's PIN restricts app controls; it cannot restrict the backend authority of a logged-in Coach or prevent browser/OS exit. A shared Coach session is therefore inappropriate even when displayed on the Timeclock origin.

## Usage findings

These are source-based request/read estimates, not measured invoices. Caching can reduce query execution; reactive invalidations add work. User count alone does not establish cost.

| Driver | Evidence / illustrative load | Targeted response |
| --- | --- | --- |
| Timeclock time arguments | `apps/timeclock/src/main.tsx`: two queries change arguments every 15 seconds. Three devices open four hours imply 5,760 requests per meeting day, before reactive updates. Continuously open devices imply 34,560/day. | Avoid hidden-screen churn; use the coarsest safe server-query cadence while keeping local countdowns. Preserve calendar freshness contract. |
| Family attendance refresh | `src/DashboardReports.tsx`: 30-second refresh; 100 accounts for five minutes roughly 1,000 requests/day. `convex/dashboardReports.ts` includes history/legacy work even for compact summaries. | Reduce unnecessary time changes when no session is active; split compact reads only if measured I/O warrants it. |
| Mentor meeting reads | `convex/app.ts:146` calls attendance computation per student; `convex/lib/readModels.ts:56` rereads the same season meetings. Fifty students and 100 meetings can mean roughly 5,000 repeated meeting reads per execution. | Read shared meetings once or reuse existing summaries. This is the clearest avoidable amplification. |
| Calendar baseline | `convex/crons.ts` schedules every minute. Configured refresh implies about 4,320 Convex calls and 2,880 Google HTTP requests/day, before changed-item writes. | Preserve the current three-minute freshness guarantee until an explicit cadence decision; do not silently slow sync. |
| PDF storage | Review and signed artifacts are event-driven, each capped at 4 MB. Fifty forms at both caps imply up to 400 MB before additional attempts/backups. Expired abandoned drafts have no identified file cleanup. | Measure actual files and backup transfer. Preserve signed records; any unused-draft cleanup needs safe reference checks, not broad retention deletion. |

Development insights for the prior 72 hours returned three retried contention warning groups from October 13 maintenance, involving attendance-report maintenance and financial-source maintenance. No read-limit warning was returned. This does not measure billed bytes or prove production capacity. Actual plan, billing totals, database I/O, PDF sizes and realistic open-tab hours remain unverified.

## Infrastructure observed

- Cloudflare connector reached the active `team8044.org` zone in Team 8044. Exact DNS queries returned no records for either proposed app hostname. Neither proposed Worker appeared in the account Worker inventory. No DNS/Worker change was made.
- Both repositories' deployment configuration uses Workers static assets, not Pages. Keep this architecture and use [Workers Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/) unless a concrete need requires change. Build configuration and branch protection remain to be verified.
- Convex exposes development `third-bandicoot-18` and production `amicable-eel-413`. Only development health insights were inspected; production records/configuration were not read or changed.

## Backup budget decision

Current [Convex pricing](https://www.convex.dev/pricing) lists Professional at $25 per developer/month. [Built-in periodic backups](https://docs.convex.dev/database/backup-restore) require Pro, so native nightly scheduling exceeds the initial $10 combined target. Actual billing plan is unverified. Recommendation: favor native backups for lower operational complexity if the owner approves the cost; otherwise separately scope automated exports, secure credentials/storage and failure alerts. Neither option is configured.

Include file storage. Daily backups retain seven days; this recovery window is separate from the five-year record-retention policy. Code, environment configuration and pending scheduled functions are excluded, so restoration needs those recovery steps too. Prove recovery in an isolated target, never by overwriting current records.

## Scope and next checkpoint

Next bounded implementation batch: reconcile latest Timeclock, reduce demonstrated repeated reads/time refreshes, and prepare production signing/bootstrap behind explicit production configuration. Focused behavior checks only; one integrated validation after the coherent batch. Consequential changes receive independent review. Ownership, backup billing and real FIRST link can be resolved alongside that work.

Remaining audit limits: dependency inventory/history secret scan, real measured load, production configuration and Google ownership, recovery drill and physical devices. No new accounts, records, signatures, role changes, deployments, purchases or test reruns occurred during this audit. Account-specific evidence remains outside Git. CSV cents headings stay deferred; accepted visual evidence is preserved.
