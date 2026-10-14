import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import FeeAdministration, { BulkJobSummary, BulkRowEvidence, FeeDefinitionDraftForm, FeeMaintenanceNotice, LiveMappingReceipt, FeePriorityReceipt, FeePriorityRows, UnmappedFeeEvidence } from './FeeAdministration'
import type { Doc, Id } from '../convex/_generated/dataModel'

const queryState = vi.hoisted(() => ({ loaded: true, queryCount: 0, mapping: null as null | { job: { state: string; processed: number; mapped: number; unmapped: number; reason: string }; originalActorName: string; processingActorName: string; canRetry: boolean; canCancel: boolean } }))
vi.mock('convex/react', () => ({
  useQuery: () => { queryState.queryCount += 1; return queryState.mapping ?? (queryState.loaded ? { control: null, mappingState: 'reviewRequired', hasUnmapped: true, canManageFees: false, canMove: false, canMap: false } : undefined) },
  usePaginatedQuery: () => ({ results: [], status: queryState.loaded ? 'Exhausted' : 'LoadingFirstPage', loadMore: vi.fn() }),
  useMutation: () => vi.fn(),
}))

describe('shared fee presentation', () => {
  it('exposes only authorized mapping recovery and labels cancelled receipts accurately', () => {
    const receipt = { job: { state: 'failed', processed: 4, mapped: 2, unmapped: 2, reason: 'Synthetic mapping review' }, originalActorName: 'Coach', processingActorName: 'Coach', canRetry: true, canCancel: true }
    try {
      queryState.mapping = receipt
      const failed = renderToStaticMarkup(createElement(LiveMappingReceipt, { jobId: 'synthetic-mapping' as Id<'feeMappingJobs'> }))
      expect(failed).toContain('Cancel mapping review')
      expect(failed).toContain('Existing verified fee identities are preserved')
      expect(failed).toContain('type="button"')
      queryState.mapping = { ...receipt, canCancel: false }
      expect(renderToStaticMarkup(createElement(LiveMappingReceipt, { jobId: 'synthetic-mapping' as Id<'feeMappingJobs'> }))).not.toContain('Cancel mapping review')
      queryState.mapping = { ...receipt, job: { ...receipt.job, state: 'cancelled' }, canRetry: false, canCancel: false }
      const cancelled = renderToStaticMarkup(createElement(LiveMappingReceipt, { jobId: 'synthetic-mapping' as Id<'feeMappingJobs'> }))
      expect(cancelled).toContain('This mapping review was cancelled')
      expect(cancelled).not.toContain('<form')
    } finally { queryState.mapping = null }
  })
  it('keeps a finance reader out of Coach-only mapping queries and commands', () => {
    queryState.loaded = true; queryState.queryCount = 0
    const html = renderToStaticMarkup(createElement(FeeAdministration, { isCoach: false }))
    expect(queryState.queryCount).toBe(1)
    expect(html).toContain('Some earlier charges still need a Coach to match them to shared fees')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('Match earlier charges')
  })
  it('does not label an initially loading fee page as an empty season', () => {
    queryState.loaded = false
    const html = renderToStaticMarkup(createElement(FeeAdministration, { isCoach: true }))
    expect(html).toContain('Loading shared fees')
    expect(html).not.toContain('No shared fee definitions')
    queryState.loaded = true
  })
  it('labels custom charge preparation as zero-money review and requires explicit submit', () => {
    const html = renderToStaticMarkup(createElement(FeeDefinitionDraftForm, { scopeFields: null, scopeValid: false, disabled: false, onPrepare: async () => undefined }))
    expect(html).toContain('Preparation records the proposed scope for review and changes no money')
    expect(html).toContain('type="submit"')
    expect(html).toContain('disabled')
    expect(html).not.toContain('successfully')
  })
  it('does not display an unfinished scope as zero members or a prepared target as committed', () => {
    const job: Doc<'feeBulkJobs'> = { _id: 'synthetic-bulk' as Id<'feeBulkJobs'>, _creationTime: 1, seasonId: 'synthetic-season' as Id<'seasons'>, feeDefinitionId: 'synthetic-fee' as Id<'feeDefinitions'>, originalActorId: 'synthetic-original' as Id<'appUsers'>, actorId: 'synthetic-processor' as Id<'appUsers'>, kind: 'create', scope: 'allActive', targetAmountCents: 10001, definitionBeforeJson: null, snapshotHash: 'synthetic-scope', snapshotCount: 0, snapshotComplete: false, expectedDefinitionRevision: 0, state: 'preparing', phase: 'snapshot', step: 1, cursor: null, processed: 0, committed: 0, held: 0, supersededRows: 0, idempotencyKey: 'synthetic-key', operationHash: 'synthetic-hash', reason: 'Synthetic bulk review', createdAt: 1, updatedAt: 2 }
    const preparing = renderToStaticMarkup(createElement(BulkJobSummary, { job, originalActorName: 'Original Coach', processingActorName: 'Processing Coach' }))
    expect(preparing).toContain('Scope rows: Preparing exact scope')
    expect(preparing).not.toContain('Scope rows: 0')
    expect(preparing).toContain('Planned obligation per row: $100.01')
    const prepared = renderToStaticMarkup(createElement(BulkJobSummary, { job: { ...job, state: 'prepared', snapshotComplete: true, snapshotCount: 650 }, originalActorName: 'Original Coach', processingActorName: 'Processing Coach' }))
    expect(prepared).toContain('Scope rows: 650')
    expect(prepared).toContain('No money has changed; confirmation is still required')
    const held = renderToStaticMarkup(createElement(BulkJobSummary, { job: { ...job, state: 'held', snapshotComplete: true, snapshotCount: 650, committed: 648, held: 2 }, originalActorName: 'Original Coach', processingActorName: 'Processing Coach' }))
    expect(held).toContain('definition remains blocked')
    expect(held).toContain('Committed rows: 648')
    expect(held).toContain('Held rows: 2')
    expect(held).not.toContain('operation is complete')
    const replacement = renderToStaticMarkup(createElement(BulkJobSummary, { job: { ...job, kind: 'cancel', targetAmountCents: 0, state: 'prepared', snapshotComplete: true, snapshotCount: 648, priorHeldJobId: 'synthetic-prior' as Id<'feeBulkJobs'>, priorHeldRows: 2, supersededRows: 0 }, originalActorName: 'Original Coach', processingActorName: 'Processing Coach' }))
    expect(replacement).toContain('Earlier held targets proposed for superseding: 2')
    expect(replacement).toContain('Earlier held targets superseded after final cancellation: 0')
    expect(replacement).toContain('earlier targets remain unresolved')
  })
  it('separates committed partial source release from the still-current obligation and frozen target', () => {
    const row: Parameters<typeof BulkRowEvidence>[0]['row'] = { _id: 'synthetic-row' as Id<'feeBulkRows'>, _creationTime: 1, jobId: 'synthetic-bulk' as Id<'feeBulkJobs'>, studentId: 'synthetic-student' as Id<'students'>, chargeId: 'synthetic-charge' as Id<'charges'>, correctionJobId: 'synthetic-child' as Id<'financialOperationJobs'>, name: 'Synthetic student', targetAmountCents: 5000, beforeEffectiveCents: 10000, beforeAppliedCents: 10000, originalExpectedFinancialRevision: 4, originalExpectedChargeRevision: 2, state: 'waiting', financialState: 'failed', currentFinancialRevision: null, currentGeneration: null, currentChargeRevision: 2, currentEffectiveCents: 10000, currentAppliedCents: 7500, releaseRequiredCents: 2500, childState: 'failed', committedReleaseCents: 2500, totalReleaseCents: 5000, childError: 'Synthetic source failure', canRetryChild: true }
    const html = renderToStaticMarkup(createElement(BulkRowEvidence, { row }))
    expect(html).toContain('Planned obligation per row: $50.00')
    expect(html).toContain('Current effective obligation: $100.00')
    expect(html).toContain('Current applied amount: $75.00')
    expect(html).toContain('Committed source release: $25.00 / $50.00')
    expect(html).toContain('Original financial revision: 4')
    expect(html).toContain('Synthetic source failure')
    expect(html).not.toContain('Committed row')
  })
  it('shows display positions and exact cents without inventing actions for readonly roles', () => {
    const html = renderToStaticMarkup(createElement(FeePriorityRows, { disabled: false, rows: [{ key: 'synthetic', label: 'Synthetic shared fee', priority: 40, amountCents: Number.MAX_SAFE_INTEGER, cancelled: false }, { key: 'event', label: 'Event fee', priority: 1815660000000, amountCents: 0, cancelled: false }] }))
    expect(html).toContain('Displayed fee order position 1')
    expect(html).toContain('Displayed fee order position 2')
    expect(html).not.toContain('1815660000000')
    expect(html).toContain('$90,071,992,547,409.91')
    expect(html).not.toContain('<button')
  })
  it('keeps priority actions as non-submit buttons and blocks them during maintenance', () => {
    const html = renderToStaticMarkup(createElement(FeePriorityRows, { disabled: true, rows: [{ key: 'synthetic', label: 'Synthetic shared fee', priority: 40, amountCents: 29, cancelled: false, actions: { up: () => undefined, down: () => undefined } }] }))
    const buttons = Array.from(html.matchAll(/<button\b[^>]*>/g), match => match[0])
    expect(buttons).toHaveLength(2)
    for (const button of buttons) { expect(button).toContain('type="button"'); expect(button).toMatch(/\sdisabled(?:=|\s|>)/) }
  })
  it('keeps recorded operation details readable while monetary actions are blocked', () => {
    const html = renderToStaticMarkup(createElement(FeePriorityRows, { disabled: true, rows: [{ key: 'synthetic', label: 'Synthetic shared fee', priority: 40, amountCents: 29, cancelled: false, actions: { view: () => undefined, edit: () => undefined } }] }))
    const buttons = Array.from(html.matchAll(/<button\b[^>]*>/g), match => match[0])
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toContain('Operation details')
    expect(buttons[0]).not.toMatch(/\sdisabled(?:=|\s|>)/)
    expect(buttons[1]).toMatch(/\sdisabled(?:=|\s|>)/)
  })
  it('does not imply propagation finished while current operations are draining', () => {
    const html = renderToStaticMarkup(createElement(FeeMaintenanceNotice, { state: 'draining' }))
    expect(html).toContain('Waiting for current financial operations to finish')
    expect(html).not.toContain('Records processed: 0')
    expect(html).toContain('New financial changes are unavailable')
  })
  it('shows failed durable progress separately and uses an explicit retry submit', () => {
    const job: Doc<'feePriorityJobs'> = {
      _id: 'synthetic-job' as Id<'feePriorityJobs'>, _creationTime: 1,
      seasonId: 'synthetic-season' as Id<'seasons'>,
      originalActorId: 'synthetic-original' as Id<'appUsers'>, actorId: 'synthetic-processor' as Id<'appUsers'>,
      firstFeeId: 'synthetic-first' as Id<'feeDefinitions'>, secondFeeId: 'synthetic-second' as Id<'feeDefinitions'>,
      firstPriority: 10, secondPriority: 20, firstRevision: 2, secondRevision: 3,
      idempotencyKey: 'synthetic-key', operationHash: 'synthetic-hash', reason: 'Synthetic reviewed priority reason',
      state: 'failed', phase: 'secondFee', step: 4, cursor: null, processed: 17, createdAt: 1, updatedAt: 2, lastError: 'Synthetic processing failure',
    }
    const html = renderToStaticMarkup(createElement(FeePriorityReceipt, { job, originalActorName: 'Original Coach', processingActorName: 'Retry Coach', canRetry: true, retryReason: 'Reviewed retry reason', onRetryReasonChange: () => undefined, onRetry: () => undefined, submitting: false }))
    expect(html).toContain('Records processed: 17')
    expect(html).toContain('Original Coach')
    expect(html).toContain('Retry Coach')
    expect(html).toContain('Synthetic processing failure')
    expect(html).toContain('type="submit"')
    expect(html).not.toContain('applied and verified')
    const readonly = renderToStaticMarkup(createElement(FeePriorityReceipt, { job, originalActorName: 'Original Coach', processingActorName: 'Retry Coach', canRetry: false, retryReason: '', onRetryReasonChange: () => undefined, onRetry: () => undefined, submitting: false }))
    expect(readonly).not.toContain('<form')
  })
  it('keeps unavailable recorded event evidence distinct from a standalone charge', () => {
    const charge: Doc<'charges'> = { _id: 'synthetic-charge' as Id<'charges'>, _creationTime: 1, studentId: 'synthetic-student' as Id<'students'>, eventId: 'synthetic-event' as Id<'events'>, label: 'Synthetic event charge', amountCents: 10001, adjustedCents: 29, cancelledCents: 30, appliedCents: 7500, priority: 70, createdBy: 'synthetic-coach' as Id<'appUsers'>, createdAt: 1, revision: 4 }
    const review: Doc<'feeUnmappedCharges'> = { _id: 'synthetic-review' as Id<'feeUnmappedCharges'>, _creationTime: 1, seasonId: 'synthetic-season' as Id<'seasons'>, chargeId: charge._id, state: 'unmapped', observedAt: 2 }
    const html = renderToStaticMarkup(createElement(UnmappedFeeEvidence, { rows: [{ charge, review, studentName: 'Synthetic student', eventName: null, effectiveCents: 10000, selected: true }], disabled: true, onSelect: () => undefined }))
    expect(html).toContain('Recorded event unavailable')
    expect(html).not.toContain('Not connected to an event')
    expect(html).toContain('Original: $100.01')
    expect(html).toContain('Effective obligation: $100.00')
    expect(html).toContain('Applied: $75.00')
    expect(html).toContain('Charge revision: 4')
  })
})

