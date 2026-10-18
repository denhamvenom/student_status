import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EventEnrollmentNotice } from './EventEnrollmentNotice'
import type { Id } from '../convex/_generated/dataModel'
const state = vi.hoisted(() => ({ canRetry: false }))
vi.mock('convex/react', () => ({
  useQuery: () => ({ state: 'failed', processed: 1, assigned: 1, lastError: null, canRetry: state.canRetry }),
  useMutation: () => vi.fn(),
}))
describe('enrollment recovery capability', () => {
  it('disables Coach retry while server financial coordination blocks it', () => {
    const render = (coach = true) => renderToStaticMarkup(createElement(EventEnrollmentNotice, { eventId: 'synthetic-event' as Id<'events'>, staff: true, coach, failed: true }))
    state.canRetry = false
    expect(render()).toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/)
    state.canRetry = true
    expect(render()).not.toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/)
    expect(render(false)).not.toContain('<button')
    state.canRetry = false
  })
})
