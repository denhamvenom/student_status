/** Shared entry rules. Optional empties stay empty; callers enforce required fields. */
export function normalizePhone(value: string, label = 'Phone'): string {
  const text = value.trim()
  if (!text) return ''
  if (!/^\+?[\d\s().-]+$/.test(text)) throw new Error(`${label}: enter a 10-digit phone number, with an optional leading 1.`)
  let digits = text.replace(/\D/g, '')
  if (text.startsWith('+') && (digits.length !== 11 || !digits.startsWith('1'))) throw new Error(`${label}: enter a 10-digit phone number, with an optional leading 1.`)
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length !== 10 || (text.startsWith('+') && !text.startsWith('+1'))) throw new Error(`${label}: enter a 10-digit phone number, with an optional leading 1.`)
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
export function normalizeEmail(value: string, label = 'Email'): string {
  const text = value.trim().toLowerCase()
  if (!text) return ''
  const parts = text.split('@')
  const local = parts[0] ?? '', domain = parts[1] ?? ''
  if (text.length > 254 || parts.length !== 2 || local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !domain.includes('.') || domain.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) throw new Error(`${label}: enter a valid email address.`)
  return text
}
/** Untouched legacy contacts must not block unrelated profile edits. */
export function normalizeChangedPhone(value: string, previous?: string | null, label = 'Phone'): string {
  return previous !== undefined && previous !== null && value.trim() === previous.trim() ? previous : normalizePhone(value, label)
}
export function normalizeChangedEmail(value: string, previous?: string | null, label = 'Email'): string {
  return previous !== undefined && previous !== null && value.trim() === previous.trim() ? previous : normalizeEmail(value, label)
}
