import { getFunctionName } from 'convex/server'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../convex/_generated/dataModel'
import { FinanceOperations } from './features/operations/FinanceOperations'
import { Fundraising } from './Fundraising'
import { StudentWithdrawal, WithdrawalQueue } from './Withdrawals'
import { AttendanceReportRebuild } from './DashboardReports'
import { PendingJoinView } from './PendingJoinView'

const mock = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  pages: {} as Record<string, unknown[]>,
}))

vi.mock('convex/react', () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => args === 'skip' ? undefined : mock.queries[getFunctionName(reference)],
  usePaginatedQuery: (reference: Parameters<typeof getFunctionName>[0]) => ({
    results: mock.pages[getFunctionName(reference)] ?? [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
  useMutation: () => vi.fn(),
  useConvex: () => ({query: vi.fn()}),
}))

beforeEach(() => { mock.queries = {}; mock.pages = {} })

const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element)
const studentId = 'synthetic-student' as Id<'students'>
const eventId = 'synthetic-event' as Id<'events'>

describe('synthetic review states', () => {
  it('shows committed finance progress and a guarded retry after a failed operation', () => {
    mock.queries = {
      'financeOperations:operationOptions': {state:'failed',personalAvailableCents:100,fundraisingAvailableCents:200,recipients:[]},
      'financialOperationsWorker:status': {job:{_id:'synthetic-job',kind:'payout',state:'failed',committedCents:100,amountCents:200,lastError:'Synthetic processing stopped'},canRetry:true},
    }
    const view = html(createElement(FinanceOperations,{studentId}))
    expect(view).toContain('Needs Coach review')
    expect(view).toContain('Amount already saved: $1.00 of $2.00')
    expect(view).toContain('The rest is still waiting to finish')
    expect(view).toContain('Retry remaining work')
    expect(view).toContain('Synthetic processing stopped')
  })

  it('shows partial withdrawal processing and Coach-only retry prerequisites', () => {
    mock.queries['withdrawals:withdrawalPreview'] = {status:'confirmed',allowWithdrawal:true,requestStatus:'processing',eventName:'Synthetic event',progress:{jobId:'synthetic-job',state:'failed',committedCents:100,totalCents:200,lastError:'Synthetic return failed'}}
    const view = html(createElement(StudentWithdrawal,{eventId,studentId}))
    expect(view).toContain('Needs Coach review')
    expect(view).toContain('Returned to travel accounts: $1.00 of $2.00')
    expect(view).toContain('Participation and room placement remain unchanged')
    expect(view).not.toContain('Retry remaining withdrawal work')
  })

  it('offers a guarded retry to a Coach when withdrawal processing fails', () => {
    mock.queries = {
      'withdrawals:pendingWithdrawals': [{requestId:'synthetic-request',eventId,studentId}],
      'withdrawals:wholeTeamLeaveNotices': [],
      'withdrawals:withdrawalPreview': {studentName:'Synthetic student',eventName:'Synthetic event',requestStatus:'processing',canRetry:true,progress:{jobId:'synthetic-job',state:'failed',committedCents:100,totalCents:200,lastError:'Synthetic return failed'}},
    }
    const view = html(createElement(WithdrawalQueue))
    expect(view).toContain('Retry remaining withdrawal work')
    expect(view).toContain('Reason for retry (at least 8 characters)')
    expect(view).toMatch(/<button[^>]*disabled[^>]*>Retry remaining withdrawal work<\/button>/)
  })

  it('shows failed attendance recalculation with an available retry action', () => {
    mock.queries['attendanceReportMaintenance:status'] = {state:'failed',processed:3,lastError:'Synthetic attendance job stopped'}
    const view = html(createElement(AttendanceReportRebuild))
    expect(view).toContain('Attendance needs review. Sessions checked: 3')
    expect(view).toContain('Synthetic attendance job stopped')
    expect(view).toContain('Recalculate attendance')
  })

  it.each(['held','failed'] as const)('shows %s fundraiser posting and the guarded retry route', state => {
    const fundraiser = {_id:'synthetic-fundraiser',name:'Synthetic fundraiser',teamBps:5000,studentBps:5000,state,revision:2}
    mock.pages['fundraisers:list'] = [fundraiser]
    mock.queries['fundraisers:list'] = {capabilities: {canPost: false, canCreate: false, canChangePolicy: false}}
    mock.queries['fundraisers:workspace'] = {
      fundraiser,
      totals:{grossCents:100,teamCents:50,travelCreditCents:50},
      capabilities:{canPost:false,canCreate:false,canChangePolicy:true},
      job:{_id:'synthetic-posting',state,committed:1,held:1,processed:2,lastError:state==='failed'?'Synthetic posting stopped':null},
    }
    const view = html(createElement(Fundraising))
    expect(view).toContain(state==='held'?'Some amounts need Coach review':'Posting stopped; a Coach needs to review it')
    expect(view).toContain('1 saved · 1 need review · 2 checked')
    expect(view).toContain(state==='held'?'Amounts on hold have not changed':'Remaining rows have not been posted yet')
    expect(view).toContain('Retry remaining rows')
    expect(view).toContain('Reason for retry')
  })

  it('keeps sign-out and individual invitation entry available on Join and Waiting', () => {
    for (const submitted of [false,true]) {
      const view = html(createElement(PendingJoinView,{submitted,busy:false,signOutError:'',onSignOut:vi.fn(),children:createElement('p',null,'Synthetic join form')}))
      expect(view).toContain(submitted?'Waiting':'Join the team')
      expect(view).toContain('Sign out')
      expect(view).toContain('Google account')
      expect(view).toContain('type="button"')
      expect(view).toContain('Synthetic join form')
    }
  })
})
