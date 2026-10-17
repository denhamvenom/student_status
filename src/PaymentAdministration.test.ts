import { expect, it } from 'vitest'
import { parsePaymentCsv } from './PaymentAdministration'
it('parses exact cents and quoted receipt references on team local dates, rejects ambiguous CSV', () => {
  const header = 'studentEmail,amount,method,reference,date,rowReference\r\n'
  const [row] = parsePaymentCsv(header + 'synthetic@example.invalid,10.01,check,"Check, ""123""",2026-10-13,1')
  expect(row).toMatchObject({ amountCents: 1001, reference: 'Check, "123"', occurredAt: Date.parse('2026-10-13T05:00:00Z') })
  expect(() => parsePaymentCsv(header + 'synthetic@example.invalid,10.001,cash,Reference,2026-10-13,1')).toThrow('positive amount')
  expect(() => parsePaymentCsv(header + 'synthetic@example.invalid,10,cash,"Reference"tail,2026-10-13,1')).toThrow('invalid quoting')
})
