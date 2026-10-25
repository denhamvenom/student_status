import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { PendingJoin } from './PendingJoin'
import { BulkConnectionQueue } from './BulkConnectionQueue'

const fixture = vi.hoisted(() => ({ connections: [] as unknown[], queue: [] as unknown[] }))
vi.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signOut: vi.fn() }) }))
vi.mock('convex/react', () => ({
  useMutation: () => vi.fn(),
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference)
    if (name === 'app:joinStatus') return { status: 'none' }
    if (name === 'bulkInvites:myConnectionRequests') return fixture.connections
    if (name === 'bulkInvites:listConnectionRequests') return fixture.queue
    return undefined
  },
}))

beforeEach(() => { fixture.connections = []; fixture.queue = [] })
describe('account connection approval presentation', () => {
  it('keeps an applicant waiting for a Coach without showing the target student or requesting names', () => {
    fixture.connections = [{ requestId: 'synthetic-request', status: 'pending', createdAt: 1, studentName: 'Private target' }]
    const html = renderToStaticMarkup(createElement(PendingJoin))
    expect(html).toContain('Account connection requested')
    expect(html).toContain('Your account will connect only after Coach approval.')
    expect(html).not.toContain('Private target')
    expect(html).not.toContain('Travel Lead')
    expect(html).not.toContain('<input')
  })
  it('asks only for the invitation code before the server says which kind it is', () => {
    const html = renderToStaticMarkup(createElement(PendingJoin))
    expect(html).toContain('Invitation code')
    expect(html).not.toContain('First name')
    expect(html).not.toContain('Last name')
  })
  it('offers a new-code path after a declined or unavailable request', () => {
    fixture.connections = [{ requestId: 'synthetic-request', status: 'declined', createdAt: 1 }]
    const html = renderToStaticMarkup(createElement(PendingJoin))
    expect(html).toContain('Ask your Coach for a new code.')
    expect(html).toContain('<input')
    expect(html).not.toContain('First name')
  })
  it('shows the Coach both the target record and Google identity for review', () => {
    fixture.queue = [{ requestId: 'synthetic-request', studentName: 'Synthetic North', googleName: 'Synthetic Google', googleEmail: 'synthetic@example.test', createdAt: 1 }]
    const html = renderToStaticMarkup(createElement(BulkConnectionQueue))
    expect(html).toContain('Synthetic North')
    expect(html).toContain('Synthetic Google')
    expect(html).toContain('synthetic@example.test')
    expect(html).toContain('Approve connection')
    expect(html).toContain('Decline connection')
  })
})
