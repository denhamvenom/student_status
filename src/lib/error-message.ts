import { ConvexError } from 'convex/values'
import { adminContactTopics, type AdminContactTopic } from '../../convex/lib/adminContact'

const defaultMessage = 'Something went wrong. Please try again. If it keeps happening, contact a Coach.'
const networkMessage = 'Could not reach Student Status. Check your connection and try again.'
const sessionMessage = 'Your sign-in may have expired. Sign in again, then try again.'

function safeMessage(value: unknown, maxLength = 180): string | null {
  if (typeof value !== 'string') return null
  const message = value.trim()
  if (!message || message.length > maxLength || Array.from(message).some(char => char.charCodeAt(0) < 32)) return null
  if (/(?:\[CONVEX|\b(?:uncaught|internal|server error|stack|typeerror|referenceerror|syntaxerror|rangeerror|evalerror|aggregateerror)\b|\bat\s+\S+\s*\(|https?:\/\/|[\\/][\w.-]+\.(?:ts|tsx|js|jsx)\b|\b(?:request id|trace id|function name|deployment|failed to fetch|networkerror)\b)/i.test(message)) return null
  return message
}

/** Convert a caught error to copy that is safe to show to a person. */
export function userFacingError(error: unknown, fallback = defaultMessage, allowPlainError = true): string {
  const data = error instanceof ConvexError ? error.data : null
  const explicit = typeof data === 'string' ? data : data && typeof data === 'object' && 'message' in data ? data.message : null
  const fromData = safeMessage(explicit, 500)
  if (fromData) return fromData

  if (error instanceof Error) {
    const message = error.message
    if (/\b(?:failed to fetch|networkerror|network request failed|network error|connection lost|websocket|offline)\b/i.test(message)) return networkMessage
    if (/\b(?:unauthenticated|authentication required|session expired|sign[ -]?in required|not signed in)\b/i.test(message)) return sessionMessage
    // ConvexError.message is serialized data and must not bypass the data check.
    if (allowPlainError && error.constructor === Error) {
      const authored = safeMessage(message)
      if (authored) return authored
    }
  }
  return safeMessage(fallback) ?? defaultMessage
}

/** The Contact admin topic a Coach-only setup error carries, or null for any other error. */
export function adminContactTopic(error: unknown): AdminContactTopic | null {
  const data = error instanceof ConvexError ? error.data : null
  const topic: unknown = data && typeof data === 'object' && 'contactAdmin' in data ? data.contactAdmin : null
  return adminContactTopics.find(known => known === topic) ?? null
}
