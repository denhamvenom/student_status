import { describe, expect, it } from 'vitest'
import { inviteCsv, parseInviteCsv } from './bulk-invite-csv'

describe('bulk invitation CSV', () => {
  it('reads BOM, CRLF, quoted commas and escaped quotes', () => {
    expect(parseInviteCsv('\uFEFFFirst Name,Last Name\r\n"Ana, Jr.","O""Neil"\r\n'))
      .toEqual([{ firstName: 'Ana, Jr.', lastName: 'O"Neil' }])
  })

  it('requires the exact two-column header and bounded names', () => {
    expect(() => parseInviteCsv('Name,Last Name\nA,B')).toThrow(/first row/i)
    expect(() => parseInviteCsv('First Name,Last Name\nA,B,C')).toThrow(/two columns/i)
    expect(() => parseInviteCsv('First Name,Last Name\n,Student')).toThrow(/first and last name/i)
    expect(() => parseInviteCsv(`First Name,Last Name\n${'A'.repeat(81)},Student`)).toThrow(/80 characters/i)
  })

  it('rejects malformed quotes and excess rows', () => {
    expect(() => parseInviteCsv('First Name,Last Name\n"Ana,Smith')).toThrow(/unclosed/i)
    expect(() => parseInviteCsv('First Name,Last Name\nAna"",Smith')).toThrow(/misplaced/i)
    expect(() => parseInviteCsv('First Name,Last Name\n' + 'A,B\n'.repeat(101))).toThrow(/at most 100/i)
  })

  it('escapes formula cells in exported codes and names', () => {
    const csv = inviteCsv([{ firstName: '=2+2', lastName: 'O"Neil', code: '+HYPERLINK(1)' }], true)
    expect(csv).toContain('"\'=2+2"')
    expect(csv).toContain('"O""Neil"')
    expect(csv).toContain('"\'+HYPERLINK(1)"')
  })
})
