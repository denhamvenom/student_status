# Proposed finance and administration implementation

October 13, 2026. Financial foundation and fundraiser Wave 1 were published in `b66450d` and synced to development at 10:08; handoff documentation followed in `9767afe` (root-reported evidence). The earlier proposal sections below preserve design history; current checkpoint review and the next-slice contract at the end supersede their baseline descriptions. Wave 2 and season/retention workflows remain unimplemented. The seven-goal acceptance map remains authoritative; no G4 or G6 closure, production action or monetary disposition follows from this document.

## Source-backed current state

- `docs/GOAL_ACCEPTANCE.md`, G4 and G6, require genuine Raised/travel-share metrics, fundraiser creation/allocation, complete financial history, charge corrections/priorities, fundraising transfer to team and source-preserving season transitions.
- `docs/FINANCE_AND_CONSENT_DECISIONS.md` defines separate personal-payment/fundraising sources, withdrawal cancellation/refund treatment, automatic reallocation, permitted fundraising destinations and the account-based retention clock.
- The immutable prototype `source/UI Copy - Options.md`, Fundraising, calls for Name, Team %, Student travel %, percentages totaling 100%, student Raised/Team/Student credit, Save amounts and New fundraiser. Finances admin includes fee priority order and before/after history. Season transition includes returning students, explicit departure balance choices, unpaid-charge choices and a final review.
- There is no fundraiser table/API or charge-correction module. `convex/finance.ts:recordFunds` records a positive personal payment or **net fundraising credit**; it cannot establish gross proceeds before a split.
- `convex/dashboardReports.ts` correctly returns `raisedCents: null`. `convex/lib/financeSummaries.ts`, version 2, calculates net direct travel credits and transferred-in credits, not gross raised. `convex/lib/reportAggregates.ts` maintains eight finance metrics without Raised.
- `convex/lib/money.ts` preserves source identity through allocation/deallocation, checks effective charge balances, and provides single-student batched charges. Current mutation calculations reconstruct up to 500 ledger/charge rows; growing history needs a materialized source-balance foundation rather than a larger arbitrary scan.
- `convex/financeOperations.ts` already implements personal-payment payouts and same-season active-student fundraising transfers with idempotency, source provenance, automatic recipient allocation and summary refresh. It does not implement team destinations or season carryover.
- `convex/withdrawals.ts` retains originals, cancels unpaid extras, performs explicit main cancellation and deallocation, and reallocates returned sources excluding the withdrawn event. New charge math must be integrated here rather than silently changing this behavior.
- `convex/lib/access.ts:ownStudent` uses a unique user lookup. Multiple historical/current student records for the same account require an active-season lookup before rollover can safely create another profile.

## Settled policy

1. Integer cents are authoritative. Personal payments and fundraising credits remain distinct throughout allocation, cancellation, reallocation, transfer and carryover.
2. Fundraising credit can move to another student, carry over, or move to the team. It cannot be cashed out to a family. Team bank accounting and execution of bank transactions are outside this app.
3. Coach, or Mentor with both Travel Lead and explicit financial-edit grant, may perform current same-season student fundraising transfers. Financial authority is separate from health-export authority.
4. Withdrawal returns become available account funds, not evidence that cash/check was paid to the family. Returned funds apply to other charges in priority order while excluding the withdrawn event. Unpaid extras cancel automatically; unpaid main balances remain unless explicitly cancelled. Existing reviewed dispositions remain history.
5. The latest user instruction authorizes building the broader administration, fundraising and season workflows. It does not authorize production, main merge or invented monetary dispositions.
6. Five-year retention starts at the most recent actual account archival, including archival after reactivation. Season archival is a separate lifecycle event. Holds/deletion coverage and backups/export policy remain unresolved. Do not start the clock merely by closing a season or implement automatic deletion here.

## Proposed engineering defaults

These are reviewable implementation defaults, not newly settled user policy:

- Percentages use integer basis points, each 0–10,000, totaling 10,000. For one student's recorded gross, student credit is the integer floor of the exact rational split; the remainder goes to the team share. Calculate with integer-safe arithmetic, display the exact penny split before posting, and persist both shares. An alternative rounding rule can replace this before contract freeze.
- Gross Raised means proceeds recorded as raised by that student **before** the team/student split. Incoming student transfers and prior-season carryover are not newly raised proceeds. Net earned travel share, incoming credits, allocated funds and currently available funds remain separate values.
- Published fundraiser splits are immutable after credits are awarded. A policy change uses a new fundraiser/version; it does not rewrite earlier awards.
- Priority changes govern future automatic allocations. Existing committed allocations are preserved. A separate explicit reconciliation operation is required to move already applied funds.
- Every financial mutation requires an actor-derived grant, reason, stable actor-scoped retry key and exact expected revision/fingerprint. Historical corrections are Coach-controlled through an explicit historical correction mode; ordinary active-season edits do not unlock archived seasons.
- Bulk posting/rollover uses durable per-student transactions and immutable command snapshots. Screens expose running/failed/complete progress and committed versus pending amounts. No aggregate or success notice calls partial provisioning complete.

## Wave 1: fundraiser facts and genuine Raised

### Proposed additive schema

| Table | Fields and invariants | Indexes |
| --- | --- | --- |
| `fundraisers` | `seasonId`, `name`, normalized `nameKey`, `teamBps`, `studentBps`, `state:draft|posting|held|posted|failed|closed`, integer `revision`, `createdBy`, `createdAt`, `updatedAt`; optional current posting-job pointer | `by_seasonId_and_nameKey`, `by_seasonId_and_updatedAt` |
| `fundraiserStudentTotals` | `fundraiserId`, `seasonId`, `studentId`, `grossCents`, `teamCents`, `travelCreditCents`, integer `revision`, `latestRevisionId`, `updatedAt`; one current projection per fundraiser/student | `by_fundraiserId_and_studentId`, `by_seasonId_and_studentId` |
| `fundraiserAmountRevisions` | Append-only `fundraiserId`, `seasonId`, `studentId`, prior/new gross/team/credit cents, exact split basis points, actor/time, reason, `operationId`; optional original-award/source reference | `by_fundraiserId_and_studentId`, `by_studentId_and_recordedAt`, `by_operationId` |
| `fundraiserPostingJobs` | `fundraiserId`, `actorId`, `state:running|failed|complete`, cursor, processed count, stable retry key/hash, created/updated times; optional last error | `by_fundraiserId`, `by_actorId_and_idempotencyKey` |
| `fundraiserPostingRows` | Immutable `jobId`, `studentId`, proposed gross, expected row revision and expected financial fingerprint | `by_jobId`, `by_jobId_and_studentId` |

Add optional `ledgerEntries.fundraiserRevisionId` to new award credits. Existing ledger bodies remain unchanged. If verified historical gross facts are supplied later, link them with an audited sidecar provenance record rather than pretending the old net amount was gross or silently rewriting old ledger facts.

Add optional `studentFinanceSummaries.knownRaisedCents`, `raisedComplete` and version 3. Use `raisedCents = knownRaisedCents` only when completeness is established; otherwise return null plus the separate known subtotal and explicit unavailable historical portion. Add aggregate metrics for known Raised and unknown-student count. A direct legacy/manual fundraising credit without verified gross provenance makes completeness false. An incoming transfer or carryover does not create such an unknown new-earned amount.

Fundraiser totals and student Raised are maintained transactionally with the existing aggregate component; do not recompute all fundraiser/student rows for every posted row. New records in a fresh season can have genuine zero Raised when source completeness is established. A legacy net-credit amount must never be divided by a newly chosen percentage to fabricate gross proceeds.

### Proposed API

- `fundraisers.create({name,teamBps,studentBps,idempotencyKey}) -> fundraiserId`.
- `fundraisers.list({paginationOpts}) -> native paginated fundraiser summaries`.
- `fundraisers.workspace({fundraiserId,paginationOpts}) -> fundraiser policy/state/revision, aggregate Raised/Team/Student-credit totals, paginated minimized student amount rows and posting status`.
- `fundraisers.previewAmounts({fundraiserId,rows:[{studentId,grossCents,expectedRowRevision}]}) -> exact gross/team/credit deltas, source implications and eligibility/conflicts`.
- `fundraisers.postAmounts({fundraiserId,expectedRevision,rows,idempotencyKey,reason}) -> operation/job ID and provisioning state`. At most 500 unique student commands; each student credit, amount evidence and summaries commit atomically in its own bounded transaction. A single-row version may finish synchronously.
- `fundraisers.postingStatus`, Coach-authorized `retryPosting`, and reasoned `close` preserve history and expose partial failures.

Creation and posting are authorized server-side for Coach or the existing financial-editor role, with policy changes/closure conservatively Coach-only until role scope is frozen. Every worker rechecks current actor access; retry can appoint the currently authorized actor. Award credits enter the existing automatic charge allocation pipeline and refresh source-authoritative projections.

UI: Fundraising screen with name/percentage creation, explicit split total validation, student Raised/Team/Travel-credit rows, cents preview, Save amounts, posting status/retry, and immutable operation history. Family/Coach dashboards react to completed amount postings and preserve unknown historical gross labels.

## Wave 2: charge correction, priorities and team transfers

### Proposed additive schema and shared math

- `charges.adjustedCents?: number`, `revision?: number`, `originChargeId?: id(charges)`, `carriedOutCents?: number`. Original `amountCents` remains immutable. Effective obligation is original amount plus signed adjustments minus cancellations minus explicitly carried-out debt. Enforce safe integer sums and `0 <= appliedCents <= effectiveCents`.
- Extend `financeOperations.kind` with `chargeAdjustment|chargeCancellation|priorityChange|teamTransfer`, then `carryover|debtCarryover` in Wave 3. Add optional charge/destination/source-season/target-season/expected-fingerprint/operation-hash fields appropriate to each discriminated operation. Original payout/transfer records remain valid.
- Add actor-scoped operation-key lookup. One exact replay returns the original result; mismatched reuse rejects.
- Record charge adjustment/cancellation and allocation release as append-only ledger evidence referencing the original charge and exact funding sources. Do not delete the charge, payment or original award.

All effective-charge consumers must change together: money allocation, withdrawal preview/disposition, family finance, readiness, report summaries and correction previews. Existing UI `charged` values must distinguish original charge, adjustments/cancellations and effective obligation.

### Proposed API

- `chargeAdmin.previewCorrection({chargeId,targetEffectiveCents}) -> charge revision, current financial fingerprint, proposed adjustment/cancellation, exact paid-source release, reallocation results and remaining debt`.
- `chargeAdmin.correct({chargeId,expectedRevision,expectedFinancialFingerprint,targetEffectiveCents,reason,idempotencyKey}) -> operationId`.
- `chargeAdmin.cancel({chargeId,expectedRevision,expectedFinancialFingerprint,cancelCents,reason,idempotencyKey}) -> operationId`.
- `chargeAdmin.priorityPreview({studentId}) -> outstanding charge order and fingerprint`; Coach-only `setPriorities({studentId,orderedChargeIds,expectedFinancialFingerprint,reason,idempotencyKey})` compares the full intended scope and updates ranks atomically.
- `financeOperations.transferToTeam({studentId,amountCents,expectedSourceFingerprint,reason,idempotencyKey}) -> operationId`. Consume only available fundraising sources using existing source-linked `transferOut` entries and record the team destination. No personal source or bank automation is implied.
- `financeHistory.page({studentId,paginationOpts})` returns authorized, minimized, readable original/adjustment/allocation/source/operation rows with resolved actor display names, exact amounts, dates and reasons.

A reduction below the currently applied amount must release the excess from the actual net allocation sources, never convert it to personal payment. Reallocate eligible released funds using the agreed priority and affected-event exclusion rules where applicable. A financial conflict is an explicit review result, not a silently retained stale amount.

UI: charge detail/history, correction/cancellation preview and reasoned confirmation, original-versus-effective values, fee-priority ordering, and transfer-to-team beside the existing student-transfer/payout controls. Keep the confirmed withdrawal interface and its paid-versus-unpaid decisions intact.

### Required growing-history foundation

Paginating history alone does not remove the 500-ledger-row mutation ceiling. Before these workflows are considered complete for growing histories, materialize source balances:

- Proposed `financialSources`: source entry ID, student/season, kind payment/fundraiser, root origin ID, optional fundraiser provenance, received/available cents, revision and available/exhausted status. Index source entry, student/kind/status. Update alongside every receipt, allocation, release, payout, transfer and carryover.
- Outstanding-charge state/index can avoid reading all historical paid/cancelled charges during every allocation.
- Verified guarded backfill compares ledger-derived source balances to projections before switching writers. Do not infer ambiguous historical allocation origins; keep the existing fail-closed review requirement.

One owner must change every financial write path and its projections together. Never enlarge an unbounded scan to disguise a missing source projection.

## Wave 3: source-preserving season transition

Proposed `seasonRolloverPlans`, durable jobs and child decisions contain source/target seasons, explicit old-to-new student mappings, returning/departing status, each source disposition, each outstanding charge disposition, expected financial fingerprints, stable operation keys and progress. Prepared plans are reviewable and immutable when applied. No existing source is moved twice.

- Fundraising carry-out equals fundraising carry-in. New incoming source retains the root `originEntryId` and remains fundraising.
- Any authorized personal carryover remains personal; personal refunds require the external method/reference/date already supported by payout recording. Fundraising cannot use the personal refund option.
- Unpaid charges have explicit carry, write-off or hold decisions. Carried-out old debt is matched by a new opening charge linked through `originChargeId`, avoiding double counting. Write-off is explicit cancellation evidence, never deletion.
- Departing students' remaining amounts are held or moved only according to the reviewed disposition. The app does not invent a refund or assume team forfeiture.
- Copy returning profiles/contact information and parent links for review. Create fresh seasonal attendance/events/checklists and permission requirements. Copy wording/definitions if desired, never signatures or completion evidence.
- Add active-season identity lookup such as `students.by_seasonId_and_userId` and update shared access helpers before creating multiple season profiles for one account.
- Root owns a common write lock during rollover. Final season activation happens once all student transactions and verification finish; failure remains visible/retryable and does not falsely claim that the season is closed. Global account revocation must remain possible during a financial lock.

The actual account-archival retention clock is distinct from old season/profile closure. Preserve archival provenance across reactivation until retention treatment is explicitly settled; no deletion work belongs to this finance wave.

## Truly unresolved outcomes

- Spent/transferred fundraiser corrections are resolved policy: hold for Coach resolution with balances unchanged. A future exceptional resolution must be explicitly selected; no automatic unwind, new debt or seizure is authorized.
- Personal-payment and unpaid-debt dispositions at season close require explicit per-student reviewed choices. The prototype suggests carry/write-off/hold and offline-refund options; implementation must preserve source restrictions and record actual choices rather than silently applying one default.
- Retention deletion coverage, exports/backups and holds remain policy gates. The most-recent-archive clock is settled. These gates do not block review/previews or hold controls and do not authorize deleting ledger/receipt records.

Penny rounding and future-versus-existing priority application above are engineering defaults presented for review, not reasons to stop otherwise authorized implementation. No bank-account bookkeeping, email sending, real consent or production action is added to this proposal.

## Ownership and validation sequence

1. Root/Astra freeze Wave 1 schema, input split/rounding and Raised completeness contract. Backend owner: new fundraiser/posting modules and focused tests. UI owner: new Fundraising screen/copy. Root: schema/generated references, source projection/aggregate wiring, dashboard metrics and routes.
2. A single financial-helper owner implements source materialization/backfill and all affected writers. Root integrates this foundation before broader source-consuming operations; no competing rewrites of `money.ts`, withdrawal handling or summary calculations.
3. Charge/team-transfer backend owner owns new charge administration module and operation tests. UI owner implements preview/history/priority controls. Root owns shared effective-charge/readiness/report changes and freezes existing withdrawal regression expectations.
4. Season backend/UI ownership is assigned after finance invariants are proven. Root owns identity/access/lifecycle locks and activation. Shared Timeclock closure/historical reporting must retain its separate frontend ownership and authoritative evidence.

Staged evidence:

- Fundraiser exact integer split and rounding conservation; zero/missing distinction; known versus legacy unknown gross; incoming transfers/carryover excluded from Raised; revision/replay/conflicting-operation and actor-revocation denials.
- 500-student durable posting with injected row failure/retry/concurrent credit spend; committed rows are not duplicated, and aggregate totals match only committed evidence. Large histories use verified projections and paginated detail.
- Charge increase/decrease/cancellation on unpaid, partly paid and fully paid charges; original-source release and reallocation; no over-refund, source conversion, hidden debt cancellation or historical record deletion; stale previews reject.
- Coach-only priority changes, future allocation ordering and preserved prior allocation evidence; separate financial grant/revocation and cross-season refusal.
- Student/team transfer source conservation, root lineage, repeat/conflicting key protection, and fundraising cash-payout denial.
- Season carryover exactly once, explicit departure/debt choices, all source kinds preserved, old/new debt not doubled, profiles reviewed, signatures not copied, failed provisioning not complete, and historical data read-only outside reasoned Coach correction mode.
- Fresh materialized summaries/aggregates compared to ledger/source evidence, readable paginated history, role-minimized exports and reactive family/Coach metric updates.
- Prototype conformance and live synthetic journeys at required phone/desktop light/dark states are separate evidence from backend tests. User visual approval and production release remain later gates.

## Wave 1 freeze checkpoint — October 13, 2026

Status: contract freeze for the next implementation wave after published `ca69af2`. The permission milestone has 174 separately verified backend/UI tests and a live Parent-to-Coach accepted journey reported by root. This section authorizes no production action and claims no finance implementation or numbered goal completion. Earlier proposal sections remain rationale; this freeze governs Wave 1 choices below.

### Ownership and monetary invariants

Sol `whole_team_goal` is the single financial-write owner for materialized sources/allocations, backfill, money helpers, all existing financial writers and new fundraiser backend. Sol `dashboard_goal` owns Fundraising UI/copy against backend validators. Root owns shared schema/generated integration, dashboard aggregate wiring, routes, Git and development synchronization. Astra coordinates contracts/reviews and this document. Do not split competing modifications to financial allocation math.

Freeze basis points totaling 10,000, student share floored using integer-safe arithmetic, team share equal to gross minus student share, and an exact cent preview. Positive awards may post. Downward corrections may consume only still-available original award sources for that fundraiser/student; no use of unrelated credits, cash conversion, automatic allocation reversal, recipient clawback or invented debt. Insufficient original availability returns an actionable hold with the requested reduction and available amount; that row makes no monetary change. User confirmed: spent/transferred reductions stay on hold for Coach resolution, with balances unchanged. A job may commit independent safe rows while showing held/failed rows explicitly; never label it fully complete until all rows are resolved.

Gross Raised is recorded gross before splitting, not net travel credit or incoming transfer/carryover. Missing historical gross remains unknown; never infer it by dividing old net awards by a new split. Published splits stay immutable. Per-student gross/team/travel changes, source evidence and summary deltas commit together.

### Additive fundraiser tables

All IDs use the named table's `v.id`; cents, basis points and revisions use `v.number` plus safe-integer/range checks. Text and arrays require bounded handlers. New fields on populated tables remain optional.

- `fundraisers`: required `seasonId`, `name:string`, `nameKey:string`, `teamBps:number`, `studentBps:number`, `state:draft|posting|held|posted|failed|closed`, `revision:number`, `createdBy:id(appUsers)`, `createdAt:number`, `updatedAt:number`; optional `postingJobId:id(fundraiserPostingJobs)`; required `creationIdempotencyKey:string` and `creationHash:string`. Indexes `[seasonId,nameKey]`, `[seasonId,updatedAt]`, `[createdBy,creationIdempotencyKey]`.
- `fundraiserStudentTotals`: required `fundraiserId`, `seasonId`, `studentId`, `grossCents:number`, `teamCents:number`, `travelCreditCents:number`, `revision:number`, `latestRevisionId:id(fundraiserAmountRevisions)`, `updatedAt:number`. Indexes `[fundraiserId,studentId]`, `[seasonId,studentId]`.
- `fundraiserAmountRevisions`: required fundraiser/season/student IDs, `previousGrossCents`, `grossCents`, `previousTeamCents`, `teamCents`, `previousTravelCreditCents`, `travelCreditCents`, `teamBps`, `studentBps`, `recordedBy:id(appUsers)`, `recordedAt`, `reason:string`, `jobId:id(fundraiserPostingJobs)`, `rowId:id(fundraiserPostingRows)`; optional `awardSourceEntryId:id(ledgerEntries)` (mandatory in the posting invariant whenever the revision awards positive travel credit). Reduction provenance must reference every consumed original source through append-only source-linked movement entries. Indexes `[fundraiserId,studentId]`, `[studentId,recordedAt]`, `[jobId]`.
- `fundraiserPostingJobs`: required `fundraiserId`, `actorId:id(appUsers)`, `state:running|held|failed|complete`, `cursor:string|null`, `processed:number`, `committed:number`, `held:number`, `idempotencyKey:string`, `operationHash:string`, `reason:string`, `createdAt:number`, `updatedAt:number`; optional `lastError:string`. Indexes `[fundraiserId]`, `[actorId,idempotencyKey]`. Snapshot the operation actor and immutable submitted row commands; retry authorization is fresh and audited.
- `fundraiserPostingRows`: required `jobId`, `studentId`, `grossCents:number`, `expectedRowRevision:number`, `expectedFinancialRevision:number`, `state:pending|committed|held|failed`; optional `revisionId:id(fundraiserAmountRevisions)`, `holdCode:spentOrTransferred|financialStateChanged|projectionUnavailable`, `message:string`. Indexes `[jobId]`, `[jobId,studentId]`. Requested command fields never change; result fields may advance transactionally.

Add optional `ledgerEntries.fundraiserRevisionId` and a distinct source-linked award-reversal movement kind. Do not call a correction a team transfer or mutate the original positive award. The backend owner must name the movement and integrate it in every source/summary consumer before root adds it. Add summary version 3 with optional `knownRaisedCents:number` and `raisedComplete:boolean`, plus aggregate known-raised and unknown-count metrics. New manual net awards without gross provenance invalidate completeness; transfers do not.

### Materialized-source foundation contract

A student-specific revision replaces full-ledger fingerprint scans. Suggested exact storage, pending backend owner's final validator freeze with root:

- `financialAccounts`: student/season IDs, `state:uninitialized|rebuilding|ready|failed`, `generation:number`, `revision:number`, `phase:sources|movements|charges|verify`, `cursor:string|null`, `processed:number`, `updatedAt:number`, optional sanitized `lastError`. Index `[studentId]`.
- `financialSources`: student/season IDs, generation, `sourceEntryId:id(ledgerEntries)`, `kind:payment|fundraiser`, `rootOriginEntryId:id(ledgerEntries)`, received/available cents, revision, `status:available|exhausted`, createdAt; optional fundraiser/revision provenance IDs. Indexes `[studentId,generation,sourceEntryId]`, `[studentId,generation,kind,status]`, `[studentId,generation,fundraiserId,status]`.
- `financialAllocations`: student ID, generation, charge/source-entry IDs, source kind, applied cents and revision. Indexes `[studentId,generation,chargeId]`, `[studentId,generation,sourceEntryId]`, `[studentId,generation,chargeId,sourceEntryId]`.
- Optional `charges.outstanding:boolean` with index `[studentId,outstanding,priority]`.

Backfill reads bounded pages: authoritative sources, source-linked movements, charges and verification. Fence every page with generation/phase/cursor and use nested rollback before marking failure. Block ordinary student financial writes while rebuilding; preserve readable paginated evidence. Do not infer ambiguous historical source assignments. Derived totals must also be accumulated in bounded staged projections, then published only after verification; merely adding source rows while keeping 500-history summary scans does not complete the foundation.

Every source receipt/allocation/release/payout/transfer/withdrawal and charge writer updates materialized balances, net source-charge allocations, outstanding flags, account revision and summary deltas in the same transaction. Large active-source or outstanding-charge fanout still requires bounded processing and an explicit operation state/lock; removing historical scans alone does not prove arbitrary atomic fanout. Backend owner and root must freeze this final processing detail before claiming growing-history support. No enlarged scan cap substitutes for the foundation.

### Frozen API/UI semantics

`create` takes name, split basis points and actor-scoped retry key; `list` is native paginated. `workspace` returns fundraiser policy/revision, aggregate committed gross/team/travel totals, paginated student rows, per-row revisions and current financial readiness/revision, and job state. `previewAmounts` returns a discriminated `ready|hold|updating` result with exact before/after gross/team/travel cents, deltas, expected row/financial revisions and any safe-source shortfall. Bound preview pages independently of the 500-command posting snapshot.

`postAmounts` accepts the fundraiser revision, at most 500 unique immutable row commands, reason and actor-scoped retry key; returns job ID/state. Workers process bounded student transactions, recheck authority, and atomically commit money plus evidence/cursor. Retry mismatches reject. Held rows expose the necessary decision instead of silently skipping or reallocating money. Authoritative API validators/types are shared with UI before implementation.

Role freeze: only Coach may create fundraisers; Coach and Mentor with Travel Lead plus financial-edit may post monetary fundraiser amounts; split changes before posting, closure and exceptional reconciliation are Coach-only. A published split cannot change. No health grant substitutes for financial permission. Post-spend downward corrections are held for Coach resolution without changing balances. Personal/debt season dispositions remain explicit reviewed choices; retention deletion coverage and holds remain separate policy gates.



### Latest user decisions and source foundation freeze

The user explicitly confirmed that downward fundraising corrections whose original funds have been spent or transferred must remain **on hold for Coach resolution, with balances unchanged**. This is the implemented-state target, not a pending question or permission to invent debt/clawbacks. The five-year retention clock restarts at the **most recent actual account archival**; previous statements treating reactivation-clock policy as unresolved are superseded. Preserve append-only archival history while updating the current archival timestamp on a new archival transition. Season closure still does not itself archive an account. Deletion coverage, holds and backups remain unresolved. Root also has a user-authorized Mentor-only test identity; keep account-specific details out of this repository document.

Root integrated the following source-foundation shape locally; it is not yet implementation or deployment evidence:

- `financialAccounts`: student/season IDs; state `uninitialized|rebuilding|ready|failed|allocating`; generation/revision; phase/cursor/processed/updatedAt and optional lastError; `chargedCents`, `paidCents`, `personalAvailableCents`, `fundraisingAvailableCents`, `travelShareCents`, `transferredInCents`, `knownRaisedCents`, `unknownGrossSourceCount`, `ledgerCount`, `sourceCount`, `chargeCount`, `lastLedgerAt:number|null`; optional allocationJobId. Index studentId.
- `financialSources`: student/season/generation/sourceEntryId, kind/rootOriginEntryId, received/available cents, revision/status, `sourceCreatedAt` and `createdAt`. Indexes student/generation/sourceEntryId; student/generation/kind/status; student/generation/sourceCreatedAt; student/generation/status/sourceCreatedAt; student/generation. Wave 1 adds optional fundraiserId/fundraiserRevisionId and student/generation/fundraiserId/status index for original-award reductions.
- `financialAllocations`: student/generation/charge/sourceEntryId, sourceKind, appliedCents/revision and `status:applied|returned`. Indexes student/generation/charge; student/generation/sourceEntryId; student/generation/charge/sourceEntryId; student/generation/charge/status.
- `financialChargeAllocations`: student/generation/charge/appliedCents and `verified:boolean`. Indexes student/generation/charge and student/generation/verified. This accumulator avoids rereading every source pair to verify each charge.
- `financialAllocationJobs`: student/actor/generation, state running/failed/complete, chargeCursor:string|null, step/processed/idempotencyPrefix, optional excludedEventId, updatedAt/lastError. Index student/state.

Allocation pages use at most twenty available sources and twenty scanned outstanding charges. Persist the withdrawal excluded-event ID throughout the job. Persist a bounded charge-scan cursor or equivalent progress so twenty excluded charges cannot permanently hide later eligible charges. Duplicate/stale jobs are fenced by generation/job/step. A page's movements, source/charge balances, summary deltas and cursor commit atomically with nested rollback on failure. Competing financial writers are blocked while allocation is pending; the UI shows allocating/failed and readiness must not claim settled financial readiness. A small operation may finish synchronously; otherwise its credit and durable continuation commit together.

Add a `raised` backfill phase before verify, paginating authoritative current `fundraiserStudentTotals` for the student/season. Do not derive known Raised solely from award ledger entries: a 100%-team fundraiser legitimately has gross Raised and no student-credit ledger entry. Posting updates knownRaised by the exact gross delta even when travel-credit delta is zero. Source-backed sums and charge accumulators remain staged until the whole account generation is verified. Exact generated validators remain root-owned; this document does not authorize independently editing shared schema.

### Operation lock review requirements (implementation in progress)

Durable payout/transfer/withdrawal jobs extend the financial account state with `posting` and an `operationJobId`. An unfinished job retains its lock even when the account/job is failed. Rebuild must refuse any running or failed allocation/operation job, including recipient locks; a missing referenced job fails closed for review. A generation reset must never abandon partially committed money movements. Ready checks also validate that no unfinished lock remains. Only explicit retry resumes the original immutable command.

Transfer pages debit a sender source and credit the recipient with preserved lineage in one transaction. Both accounts are locked before the first page. Recipient automatic allocation starts after transfer posting finishes. Withdrawal participation/capacity changes finalize only when its financial disposition finishes. Progress distinguishes requested, committed and remaining amounts; failures retain committed evidence and prevent a false full-success claim.

Automatic charge allocation has a different authority purpose from discretionary payouts/transfers. Existing student/parent signup and enrollment paths can legitimately create charges; their trusted deterministic allocation jobs must not fail merely because the originating actor lacks a financial-edit grant. Freeze an explicit internal automatic-allocation authority contract while preserving fresh financial-editor checks for discretionary operations. Do not broaden public financial grants as a workaround. Current transfer participant eligibility and source/recipient season scope require checks on every worker page or an explicit lifecycle lock preventing intervening archival.

Required regression: partially committed failed operation followed by Coach rebuild remains refused with job, both locks and balances unchanged; authorized retry completes once. Also exercise real student-triggered signup across several allocation pages, more than twenty excluded withdrawal-event charges before an eligible charge, and source/recipient access changes between pages. Root's family/team report gates must remain updating/failed throughout posting, allocation or rebuilding and publish genuine Raised only with verified completeness.

### Financial source checkpoint review — source cleared, live verification pending

Astra read-only review confirms current source checks unfinished allocation/operation/fundraiser pointers before rebuilding, uses causal ledger creation-order replay, and gates family/team totals while accounts are posting, allocating, rebuilding or failed. Failed jobs retain their locks. Incoming fundraiser transfers preserve their original root, award reductions require matching immutable revision evidence, and rebuilt Gross Raised totals are checked against their latest amount revision.

The previous review findings are resolved in source: fundraiser retry identity uses immutable `originalActorId`, independently of the current processing actor; payout/transfer startup audits distinguish requested from committed amounts and actual balances, with a separate completion audit; gross-only changes update `lastFinancialChangeAt`. Financial detail queries clamp native row budgets before pagination and retain split metadata. Event readiness reads 101 records and explicitly requires review beyond 100 charges or requirements, even if the first 100 are complete. Unfinished fundraiser revision targets are labeled processing/failed rather than committed. The finance page also waits for initial detail pages before rendering empty results.

Root reports the full check passed on 2026-10-13 at 10:00: 194 tests across 34 files, lint, type checking and production build; the build retains an approximately 946 KB bundle warning. The subsequent initial-page loading guard has separate scoped verification pending at the time of this entry. Backend owner additionally reports 26 focused tests passing. These results support an incremental development source checkpoint, subject to root's final changed-file checks; they do not establish deployment, live financial reconciliation, browser behavior or visual approval.

Remaining limits are explicit: existing historical accounts require a Coach rebuild; ambiguous legacy provenance fails closed for review; large operations finish asynchronously with visible committed progress and locks; unknown legacy gross remains unknown. Bounded row pages do not promise a fixed total byte budget or an instantaneous snapshot across pages. Season administration, retention deletion/holds, final role journeys and four-combination visual checks remain separate unfinished goal work. No G1–G7 outcome is closed by this checkpoint.

## Next G6 slice: charge administration and team destination

Contract freeze for root integration review, October 13: implement the complete active-season charge correction/cancellation and fundraising-to-team workflows next, with Coach priority controls in the same wave. This is an implementation contract, not evidence of implementation. Root approves file ownership and exact shared validators before coding. It leaves season transition and retention workflows explicitly queued, not removed from G6.

### Additive charge and operation contract

- Add optional `charges.adjustedCents:number` (signed safe integer, default zero) and `revision:number` (nonnegative integer, default zero). Keep original amount immutable. Centralize effective obligation as `amountCents + adjustedCents - cancelledCents`; require effective obligation nonnegative and at least applied cents. Do not introduce debt carry fields until the season contract is integrated.
- Add immutable `chargeRevisions` with charge/student/season IDs; `kind:adjustment|cancellation|priority`; before/after adjustment, cancellation, effective obligation, applied amount and priority; `requestedTargetCents?`, `releasedCents`, actor/time/reason, immutable creator-scoped retry key/hash, and optional job ID. Index charge/time and creator/retry key. A pending command is distinguishable from a completed receipt; no history row calls an unfinished target committed.
- Reuse `financialOperationJobs` and the account's operation lock for `chargeCorrection` and `teamTransfer`. New optional fields: `chargeId`, `chargeRevisionId`, `correctionKind:adjustment|cancellation`, `targetEffectiveCents`, `originalEffectiveCents`, `releaseRequiredCents`, and immutable `originalActorId`/`operationHash`. Existing job shapes remain valid. Root and the financial backend owner choose the final discriminated validators; do not create competing independent locks.
- Add operation kind `teamTransfer` to public operation receipts and a literal team destination. Use existing source-linked `transferOut` movements; no recipient student or synthetic team student is created. Preserve each original root, source kind, reason, actor and time. No team bank balance or bank transaction is represented.
- Every charge writer, including withdrawal, updates charge revision through the shared charge-change helper. Update all effective-charge consumers together: allocation, rebuild/verification, withdrawal, readiness, family detail, summaries and correction previews. The account financial revision fences changes to the source/charge set.

### Public API contract

All operations derive the actor server-side, validate active season/student and require ready projections. Coach controls correction, cancellation and priorities. Team transfers use the existing financial-editor grant. Retry is Coach-authorized with a reason and fresh permission checks; immutable creator identity remains the replay authority after takeover.

- `chargeAdmin.previewCorrection({chargeId,targetEffectiveCents,kind})`: return `ready|updating|hold`, expected charge and financial revisions, original/adjusted/cancelled/effective/applied cents, exact required source release `max(0,applied-target)`, target outstanding amount, and operation restrictions. Cancellation cannot increase obligation. Preview must not fabricate a full future allocation result from a truncated source scan; detailed source evidence is separately paginated.
- `chargeAdmin.correct({chargeId,kind,targetEffectiveCents,expectedChargeRevision,expectedFinancialRevision,reason,idempotencyKey})`: return immutable operation/job identity and state. Exact retries return the original operation; stale or mismatched reuse rejects before any money change.
- `chargeAdmin.history({chargeId,paginationOpts})`: native bounded pagination of readable before/after revisions, creator/current processing actor, reason, dates and committed progress. Family visibility uses existing student access, with financial editing controls absent.
- `financeOperations.previewTeamTransfer({studentId,amountCents})`: return available fundraising balance, expected financial revision and destination `team`; personal funds are excluded.
- `financeOperations.transferToTeam({studentId,amountCents,expectedFinancialRevision,reason,idempotencyKey})`: create the locked durable source-preserving operation, show requested/committed/remaining cents, and reuse status/Coach retry receipts. Amounts are positive safe integer cents, reasons 8–1000 characters, retry keys follow current 8–150 character bounds.
- Priority list/preview is paginated and reports that changes affect future allocations only. Priority commit must compare the expected financial revision and intended charge scope, preserve existing allocations, audit before/after order and trigger normal allocation only after the new order is fully committed. Final ordering API awaits the owners' prototype interpretation; do not silently truncate the outstanding set to 500 or reuse a partial visible page as the full order.

### Bounded correction worker invariants

A downward correction returns only excess applied money, preserving the exact net source allocations; it never turns fundraising into personal funds. Acquire the account lock before the first page, recheck Coach/student/season authority on each page, process at most twenty source pairs per step and fence generation/job/step. Returned funds remain locked until the correction reaches its target and then normal automatic allocation runs. For ordinary corrections the corrected charge participates with its reduced obligation; withdrawal retains its distinct excluded-event rule. No source is released twice after retry.

The backend owner must choose and document one internally consistent intermediate representation: either progressively reduce obligation along with each source release, or retain the old obligation until the last page while accurately marking the entire account pending. In both cases every committed page satisfies applied <= effective, derived totals are maintained, and target completion is published only after the final charge mutation. A failed job preserves source returns, progress and lock for authorized retry. Increasing an obligation adjusts the original charge and starts bounded normal allocation without rewriting past receipts.

Required proof: fully/partly/unpaid charges; increase, decrease and full cancellation; mixed payment/fundraiser sources; more than twenty sources; stale revision and unauthorized/cross-season denial; concurrent exact replay; failure after a committed page and retry; actor revocation; correction after prior withdrawal; no money creation; report/readiness gating until completion; team transfer cannot touch personal funds and cannot masquerade as gross Raised.

### Ownership recommendation and following workflow

Backend Sol owns new charge administration functions/tests, operation worker extensions and every monetary helper integration as one coherent write set. UI Sol owns charge detail/editor/history, priority controls and team transfer preview/progress, using generated server types and shared copy. Root owns schema/generated code, access helpers, LiveApp routing and deployment/Git; Astra reviews invariant coverage. No agent edits another owner's files until root confirms these assignments.

Next after this slice, implement a complete reviewable season plan: target draft season, returning/departing mappings, explicit personal/fundraiser/debt dispositions, immutable decisions and durable per-student jobs, source-preserving paired carry-out/in, read-only history and final activation only after verification. First add active-season identity lookup; current unique `by_userId` assumptions cannot support rollover safely. Per-student choices are part of that workflow, not blanket defaults: hold, authorized carryover, recorded offline personal refund, fundraising-to-team, and explicit debt carry/write-off. Unresolved or incomplete decisions block final activation without changing those balances. No new signature, permission completion or attendance evidence is copied.

In parallel after root assigns ownership, retention can deliver Coach-only paginated candidate review and append-only place/release-hold actions with reason, actor and time. Eligibility uses the most recent actual account archival plus five calendar years, and labels candidates for review rather than automatic deletion. Preview affected record classes and unresolved backup/export coverage; destructive execution stays disabled. An account reactivation or changed archive timestamp invalidates an old candidate decision.

Only genuinely unresolved policy: exact destructive retention coverage (including linked family/adult records, financial and consent evidence), external exports/backups and required retention holds. These do not block non-destructive review/hold scaffolding. Personal/debt choices during season close require explicit Coach selections in the prepared plan; do not invent a disposition when no selection exists. Spent fundraising corrections and the rearchive clock are already resolved and must not be asked again.

### Prototype priority clarification and integration pause

Read-only source verification of `pages-v2-review/prototype.js` lines 73, 114 and 332–335 shows a **season-wide fee definition order**: event fees and extra-fee definitions are ordered once and applied across students. Line 622 appends a newly created extra fee to that order. A per-student reorder alone would not satisfy the prototype or G6. The earlier per-student `setPriorities` proposal is superseded.

Freeze additive `feeDefinitions`: season ID, kind `eventMain|eventExtra|custom`, label, optional event ID, default amount cents, priority safe integer, revision, state `active|cancelled`, createdBy/createdAt/updatedAt. Index season/priority and event/kind. Add optional `charges.feeDefinitionId` plus indexes definition/student and definition. Event extra identity must be stable; do not group legacy records merely by matching labels. Legacy adoption must use provable originating IDs or a Coach-reviewed mapping. Unmapped fees remain explicitly listed for review, not silently omitted.

`feePriorities.list({paginationOpts})` returns the season-wide order and its revision. Coach `move({feeDefinitionId,direction:up|down,expectedOrderRevision,reason,idempotencyKey})` swaps adjacent definitions, then durably propagates their ranks to affected charges under a season financial-maintenance lock before reopening allocations. Pages recheck authority and preserve already committed allocations. Only two adjacent rank values change; the affected student count is paginated rather than a 500-student snapshot limit. New charge creation must honor the current definition rank and may not race partial propagation. Final exact maintenance-lock validator remains root-owned.

Shared custom-fee create/edit/cancel with all-active or explicit-student scope is also part of the remaining workflow. Use immutable command snapshots and the same per-student correction pipeline; scope changes never silently erase old charges. This can follow the single-charge correction slice, but must remain visibly unfinished until delivered. The prototype's literal delete action is represented by audited cancellation, preserving original obligations and allocations.

Root has paused wider Wave 2 edits while a live pre-migration account-state issue is repaired: `operationOptions` must return a typed uninitialized/updating state rather than throw when a historical financial account needs rebuild, so the rebuild control remains reachable. No new source ownership or Wave 2 implementation begins until that fix is reviewed and synced.

### Exact shared-priority coordination schema for root approval

Use one `seasonFinanceControls` row per season with `seasonId`, `revision:number`, `state:ready|draining|applying|failed`, optional `priorityJobId`, and `updatedAt`; index seasonId. Missing rows mean legacy ready/revision zero until first mutation initializes one. `feePriorityJobs` stores seasonId, immutable originalActorId, current actorId, immutable creator retry key/hash and reason, state `draining|applying|failed|complete`, step, cursor nullable string, phase `drain|firstFee|secondFee|verify`, the two definition IDs, both prior ranks and both prior revisions, processed count, createdAt/updatedAt and optional sanitized lastError. Index creator/key and season/state. Add financial-account index season/state to inspect outstanding work without reading ledger histories.

Starting a move atomically validates Coach, current order revision and the adjacent definitions, snapshots both ranks, and changes control state to draining. New financial commands and fee-producing membership/event commands refuse with an explicit maintenance state; already-running locked operations may drain under their existing generation/step checks. The drain phase waits until no account is rebuilding, allocating, posting or failed with an unfinished lock. Failed operations remain actionable for reasoned Coach retry; do not silently release them or begin priority propagation around them. A held fundraiser row with no money lock is not an unfinished financial movement.

After draining, set applying and swap definition ranks in one transaction, then paginate charges for each definition, updating rank and charge revision with audit evidence while existing applied amounts remain unchanged. Process at most twenty charges per nested transaction, preserving cursor and step. On failure retain the control lock; Coach retry resumes the same immutable pair. Verify both scopes before publishing the new order revision and returning ready. Financial reports may keep showing accurate unchanged money totals, but must expose maintenance and block edits; readiness cannot claim a financial maintenance operation completed before verification. No new charge may appear behind the propagation cursor because all fee-producing writers honor the season control.

This is a proposed additive coordination contract for root approval, not permission to silently widen edit ownership. Root owns the central gate integration and shared effective-charge consumers; backend Sol owns the new worker/API/tests once assigned. A priority move does not reallocate settled charges. Rebalancing existing allocations would be a separately previewed source-preserving command, not an incidental effect of changing rank.

### Active Wave 2 ownership override

Root launched the single-charge correction/cancellation and fundraising-to-team slice after the live preparation-state fix. Backend Sol now owns **all financial writers/helpers, additive charge/job/revision schema changes, and effective-charge read-model integration** for this slice; root has explicitly delegated that schema ownership and will not edit shared schema concurrently. UI Sol owns new `ChargeAdministration`, `FinanceOperations`, and LiveApp finance integration. Astra owns this plan and read-only contract/source review. This overrides the earlier root-schema ownership recommendation only for the currently assigned slice.

Freeze the intermediate correction representation: retain the old obligation until the final source-release page. Each page reduces actual applied funds and restores their exact source balances while the account remains locked and reports unavailable/pending. After all excess applied funds have been released, commit the target adjustment/cancellation, append the completed revision evidence, and start normal bounded allocation. Every page must still satisfy applied <= effective and update projections consistently. Failed processing retains its lock and precise committed progress.

Shared fee definitions, season-wide priorities and custom-fee bulk workflows are the next required slice; they are not replaced by single-charge controls. Season carryover/transition, historical access/corrections and retention review/holds remain required subsequent G6 work. Root continues live fundraising and permission verification independently; no source implementation counts as live or visual evidence.

### Wave 2 review evidence and current boundary

The first charge/team slice now has source implementation and owner-reported 24 focused backend tests (charge administration 8, finance operations 10, withdrawals 6). Astra verified bounded mixed-source releases preserve the old obligation until finalization; failed jobs retain locks; creator-scoped replay survives Coach takeover; team transfers consume fundraising only and retain origin references. Native correction/source pagination preserves split metadata and smaller caller budgets. Withdrawal previews show corrected effective charges alongside original/adjusted/cancelled amounts. Exact-cent formatting covers correction, team transfer and family charge/history views.

Ordinary correction cannot edit archived-event charges. Archival between pages stops processing, retains committed releases and the failed lock, and requires explicit historical review; neither rebuild nor retry bypasses it. Correction previews also hold targets whose sum with prior cancellations exceeds the supported exact-cent range, before creating a job or lock. The final generic operation-status `canRetry` mismatch is also resolved: archived correction jobs do not expose an ordinary retry, and the focused archive regression covers both status APIs. Astra source review is clear for this incremental slice, subject to root final checks. Root is rerunning full checks after a UI test-fixture nullability repair. No Wave 2 deployment, live correction/team-transfer journey or visual approval is claimed here. Shared fees/priorities/bulk, historical correction mode, season transition and retention remain unfinished.
