# Proposed finance and administration implementation

October 13, 2026. **Proposal only: no G6 code, schema, money movement or deployment is authorized by this document.** This is the next-wave contract recommendation for root/Astra review. Existing consent implementation files remain frozen while their checkpoint is reviewed. The seven-goal acceptance map remains authoritative; this proposal does not close G4 or G6.

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
6. Five-year retention starts at actual account archival. Season archival is a separate lifecycle event. Reactivation clock treatment, holds/deletion coverage and backups/export policy remain unresolved. Do not reset the clock, start it merely by closing a season, or implement deletion here.

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
| `fundraisers` | `seasonId`, `name`, normalized `nameKey`, `teamBps`, `studentBps`, `state:draft|posting|posted|failed|closed`, integer `revision`, `createdBy`, `createdAt`, `updatedAt`; optional current posting-job pointer | `by_seasonId_and_nameKey`, `by_seasonId_and_updatedAt` |
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

- If previously awarded fundraising proceeds are corrected downward after that credit was spent, transferred or carried over, which explicit reconciliation should apply: unwind affected allocations/transfers, record a recoverable obligation, or another approved disposition? Do not invent new debt or seize another student's allocation. Positive awards and reductions covered by still-available original sources can proceed independently once the safe correction contract is frozen.
- Personal-payment and unpaid-debt dispositions at season close require explicit per-student reviewed choices. The prototype suggests carry/write-off/hold and offline-refund options; implementation must preserve source restrictions and record actual choices rather than silently applying one default.
- Account-retention reactivation clock and deletion coverage remain policy gates. They do not block building finance review/previews or holds, and they do not justify deleting historical ledger/receipt records.

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
