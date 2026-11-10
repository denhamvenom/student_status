export function parseChargeTarget(value: string): number | null {
  const text = value.trim()
  if (text.length > 128 || !/^\d+(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null
}

export function chargeCurrency(cents: number) {
  if (!Number.isSafeInteger(cents)) throw new Error('An exact-cent amount is required.')
  const exact = BigInt(cents), absolute = exact < 0n ? -exact : exact
  return `${exact < 0n ? '-' : ''}$${new Intl.NumberFormat('en-US').format(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`
}

export type MoneyInputResult = { ok: true; cents: number } | { ok: false; message: string }
const moneyExample = 'Enter dollars and cents, like 25, 25.50 or $1,250.'
const moneyLimit = 100_000_000_00

/**
 * Reads an amount people type: an optional $, commas between thousands and up to two cents digits.
 * Anything that could mean two different amounts (such as 25,50) is refused with a suggestion
 * instead of being guessed, so a typo never saves a much larger amount.
 */
export function parseMoneyInput(raw: string, options: { allowZero?: boolean } = {}): MoneyInputResult {
  const text = raw.replace(/\s+/g, '')
  if (!text) return { ok: false, message: 'Enter an amount.' }
  if (text.includes('-')) return { ok: false, message: 'Enter an amount greater than $0.00, without a minus sign.' }
  const body = text.startsWith('$') ? text.slice(1) : text
  if (!body || body.length > 32 || !/^[\d,.]+$/.test(body)) return { ok: false, message: moneyExample }
  const decimalComma = /^(\d+),(\d{1,2})$/.exec(body)
  if (decimalComma) {
    const suggestion = chargeCurrency(Number(BigInt(decimalComma[1]) * 100n + BigInt(decimalComma[2].padEnd(2, '0'))))
    return { ok: false, message: `Did you mean ${suggestion}? Use a period before the cents.` }
  }
  const parts = body.split('.')
  if (parts.length > 2) return { ok: false, message: 'Use one period, before the cents, like 25.50.' }
  const [whole, fraction = ''] = parts
  if (fraction.includes(',')) return { ok: false, message: 'Use commas only between thousands and a period before the cents, like $1,234.56.' }
  if (fraction.length > 2) return { ok: false, message: 'Use at most two digits after the period, like 25.50.' }
  if (whole.includes(',') && !/^\d{1,3}(?:,\d{3})+$/.test(whole)) return { ok: false, message: 'Put commas only between groups of three digits, like $1,250, or leave them out.' }
  const digits = whole.replaceAll(',', '') || '0'
  if (!/^\d+$/.test(digits) || (!fraction && !whole)) return { ok: false, message: moneyExample }
  const value = BigInt(digits) * 100n + BigInt(fraction.padEnd(2, '0') || '0')
  if (value > BigInt(moneyLimit)) return { ok: false, message: 'That amount is too large. Check it and enter a smaller amount.' }
  if (value === 0n && !options.allowZero) return { ok: false, message: 'Enter an amount greater than $0.00.' }
  return { ok: true, cents: Number(value) }
}

/** Owner rule (November 9, 2026): ask before a payment leaves a student $1,000 or more over their Balance due. */
export const overpaymentConfirmCents = 100_000
export function overpaymentCents(amountCents: number, balanceDueCents: number | null) {
  const extra = amountCents - Math.max(0, balanceDueCents ?? 0)
  return extra >= overpaymentConfirmCents ? extra : null
}
/** Names the student and the amount over, and asks with the same verb as the button (Record anyway or Save anyway). */
export function overpaymentQuestion(extraCents: number, studentName: string, action: 'record' | 'save') {
  return `This is ${chargeCurrency(extraCents)} more than ${studentName}’s Balance due. ${action === 'record' ? 'Record' : 'Save'} it anyway?`
}
