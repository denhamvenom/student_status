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
