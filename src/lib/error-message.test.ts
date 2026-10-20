import { describe, expect, it } from 'vitest'
import { ConvexError } from 'convex/values'
import { userFacingError } from './error-message'

describe('userFacingError', () => {
  it('keeps unexpected rendering errors private while retaining explicit application errors', () => {
    expect(userFacingError(new Error('private rendering detail'), 'Please reload.', false)).toBe('Please reload.')
    expect(userFacingError(new ConvexError('Sign in again.'), 'Please reload.', false)).toBe('Sign in again.')
  })
  it('uses explicit Convex data, including a message object', () => {
    expect(userFacingError(new ConvexError('Profile changed. Reload before saving.'))).toBe('Profile changed. Reload before saving.')
    expect(userFacingError(new ConvexError({ message: 'This event is full. Choose another event.' }))).toBe('This event is full. Choose another event.')
  })

  it('does not show redacted server errors or stack details', () => {
    expect(userFacingError(new Error('[CONVEX M(app:save)] [Request ID: abc] Server Error\nUncaught Error: private details\n at handler (convex/app.ts:3:1)'), 'Unable to save. Try again.')).toBe('Unable to save. Try again.')
    expect(userFacingError(new TypeError('Cannot read properties of undefined'))).toBe('Something went wrong. Please try again.')
  })

  it('offers an action for connection and session failures', () => {
    expect(userFacingError(new Error('Failed to fetch'))).toBe('Could not reach the service. Check your connection and try again.')
    expect(userFacingError(new Error('Unauthenticated'))).toBe('Your session may have expired. Sign in again, then retry.')
  })

  it('preserves short local validation copy', () => {
    expect(userFacingError(new Error('Enter a valid phone number.'))).toBe('Enter a valid phone number.')
    expect(userFacingError(new Error('Bad value\n at save (src/form.ts:9)'))).toBe('Something went wrong. Please try again.')
  })
})
