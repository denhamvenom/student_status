import { describe, expect, it } from 'vitest'
import { normalizePhone, normalizeEmail, normalizeChangedPhone, normalizeChangedEmail } from '../../shared/contact-format'
describe('contact entry formatting', () => {
  it('normalizes US numbers and optional country prefix; empty stays optional', () => {
    for (const phone of ['2025550123', '(202) 555-0123', '202.555.0123', '+1 (202) 555-0123', '1-202-555-0123']) expect(normalizePhone(phone)).toBe('(202) 555-0123')
    expect(normalizePhone(' ')).toBe('')
    for (const phone of ['5550123', '20255501234', '+442025550123', '+1234567890', '2025550123 ext 5', 'abc2025550123']) expect(() => normalizePhone(phone)).toThrow('10-digit')
  })
  it('normalizes structurally valid email while rejecting common malformed forms', () => {
    expect(normalizeEmail(' Parent+Trip@Example.ORG ')).toBe('parent+trip@example.org')
    expect(normalizeEmail('')).toBe('')
    for (const email of ['a@b', 'a@@example.org', '.a@example.org', 'a..b@example.org', 'a@-example.org', 'a@example..org', 'a b@example.org', 'a@exam_ple.org', 'a'.repeat(65) + '@example.org']) expect(() => normalizeEmail(email)).toThrow('valid email')
  })
  it('preserves unchanged legacy fields but rejects new malformed edits', () => {
    expect(normalizeChangedPhone('555-0100', '555-0100')).toBe('555-0100')
    expect(normalizeChangedEmail('old@localhost', 'old@localhost')).toBe('old@localhost')
    expect(() => normalizeChangedPhone('555-0101', '555-0100')).toThrow()
    expect(() => normalizeChangedEmail('new@localhost', 'old@localhost')).toThrow()
  })
})
