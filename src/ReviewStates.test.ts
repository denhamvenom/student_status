import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../convex/_generated/dataModel'
import { FinanceOperations } from './features/operations/FinanceOperations'
import { Fundraising } from './Fundraising'
import { StudentWithdrawal, WithdrawalQueue } from './Withdrawals'
import { AttendanceReportRebuild } from './DashboardReports'
import { PendingJoinView } from './PendingJoinView'

const mock = vi.hoisted(() => ({
  queryQueue: [] as unknown[],
  fundraiserWorkspace: null as unknown,
  fundraiserRow: null as unknown,
}))

vi.mock('convex/react', () => ({
  useQuery: (_reference: unknown, args: unknown) => {
    if (mock.fundraiserWorkspace) return args && typeof args === 'object' && 'paginationOpts' in args
      ? {capabilities: {canPost: false, canCreate: false, canChangePolicy: false}}
      : mock.fundraiserWorkspace
    return mock.queryQueue.shift()
  },
  usePaginatedQuery: (_reference: unknown, args: unknown) => ({
    results: mock.fundraiserWorkspace && args && typeof args === 'object' && !('fundraiserId' in args) && !('jobId' in args) ? [mock.fundraiserRow] : [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
  useMutation: () => vi.fn(),
  useConvex: () => ({query: vi.fn()}),
}))

const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element)
const studentId = 'synthetic-student' as Id<'students'>
const eventId = 'synthetic-event' as Id<'events'>

describe('synthetic review states', () => {
  it('shows committed finance progress and a guarded retry after a failed operation', () => {
    mock.queryQueue = [
      {state:'failed',personalAvailableCents:100,fundraisingAvailableCents:200,recipients:[]},
      {job:{_id:'synthetic-job',kind:'payout',state:'failed',committedCents:100,amountCents:200,lastError:'Synthetic processing stopped'},canRetry:true},
      undefined,
      undefined,
    ]
    const view = html(createElement(FinanceOperations,{studentId}))
    expect(view).toContain('Needs Coach review')
    expect(view).toContain('Amount already saved: $1.00 of $2.00')
    expect(view).toContain('The rest is still waiting to finish')
    expect(view).toContain('Retry remaining work')
    expect(view).toContain('Synthetic processing stopped')
  })

  it('shows partial withdrawal processing and Coach-only retry prerequisites', () => {
    mock.queryQueue = [{status:'confirmed',allowWithdrawal:true,requestStatus:'processing',eventName:'Synthetic event',progress:{jobId:'synthetic-job',state:'failed',committedCents:100,totalCents:200,lastError:'Synthetic return failed'}}]
    const view = html(createElement(StudentWithdrawal,{eventId,studentId}))
    expect(view).toContain('Needs Coach review')
    expect(view).toContain('Returned to travel accounts: $1.00 of $2.00')
    expect(view).toContain('Participation and room placement remain unchanged')
    expect(view).not.toContain('Retry remaining withdrawal work')
  })

  it('offers a guarded retry to a Coach when withdrawal processing fails', () => {
    mock.queryQueue = [
      [{requestId:'synthetic-request',eventId,studentId}],
      [],
      {studentName:'Synthetic student',eventName:'Synthetic event',requestStatus:'processing',canRetry:true,progress:{jobId:'synthetic-job',state:'failed',committedCents:100,totalCents:200,lastError:'Synthetic return failed'}},
    ]
    const view = html(createElement(WithdrawalQueue))
    expect(view).toContain('Retry remaining withdrawal work')
    expect(view).toContain('Reason for retry (at least 8 characters)')
    expect(view).toMatch(/<button[^>]*disabled[^>]*>Retry remaining withdrawal work<\/button>/)
  })

  it('shows failed attendance recalculation with an available retry action', () => {
    mock.queryQueue = [{state:'failed',processed:3,lastError:'Synthetic attendance job stopped'}]
    const view = html(createElement(AttendanceReportRebuild))
    expect(view).toContain('Attendance needs review. Sessions checked: 3')
    expect(view).toContain('Synthetic attendance job stopped')
    expect(view).toContain('Recalculate attendance')
  })

  it.each(['held','failed'] as const)('shows %s fundraiser posting and the guarded retry route', state => {
    mock.fundraiserRow = {_id:'synthetic-fundraiser',name:'Synthetic fundraiser',teamBps:5000,studentBps:5000,state,revision:2}
    mock.fundraiserWorkspace = {
      fundraiser: mock.fundraiserRow,
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
    mock.fundraiserWorkspace = null
    mock.fundraiserRow = null
  })

  it('offers sign-out on both Join and Waiting without submitting a request', () => {
    for (const submitted of [false,true]) {
      const view = html(createElement(PendingJoinView,{submitted,busy:false,signOutError:'',onSignOut:vi.fn(),children:createElement('p',null,'Synthetic join form')}))
      expect(view).toContain(submitted?'Waiting':'Join the team')
      expect(view).toContain('Sign out')
      expect(view).toContain('Google account')
      expect(view).toContain('type="button"')
      if (submitted) expect(view).not.toContain('Synthetic join form')
      else expect(view).toContain('Synthetic join form')
    }
  })
})
