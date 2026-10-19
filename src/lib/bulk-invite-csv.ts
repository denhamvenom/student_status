export type InviteCsvRow = { firstName: string; lastName: string }

const HEADER = ['First Name', 'Last Name']
export const MAX_INVITE_CSV_BYTES = 128 * 1024
export const MAX_INVITE_ROWS = 100

export function readCsvCells(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let closed = false
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') { quoted = false; closed = true }
      else cell += char
      continue
    }
    if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell)
      cell = ''
      closed = false
      if (char !== ',') {
        if (char === '\r' && input[i + 1] === '\n') i++
        rows.push(row)
        row = []
      }
    } else if (char === '"' && !cell && !closed) quoted = true
    else if (char === '"' || closed) throw new Error('The CSV has a misplaced quote.')
    else cell += char
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted value.')
  if (cell || row.length || !rows.length) { row.push(cell); rows.push(row) }
  return rows
}

export function parseInviteCsv(input: string): InviteCsvRow[] {
  if (new TextEncoder().encode(input).length > MAX_INVITE_CSV_BYTES) throw new Error('The CSV is too large. Use a file under 128 KB.')
  const rows = readCsvCells(input.replace(/^\uFEFF/, ''))
  if (rows[0]?.length !== 2 || rows[0][0].trim().toLowerCase() !== HEADER[0].toLowerCase() || rows[0][1].trim().toLowerCase() !== HEADER[1].toLowerCase()) {
    throw new Error('The first row must be First Name,Last Name.')
  }
  const data = rows.slice(1).filter(row => row.some(value => value.trim()))
  if (!data.length) throw new Error('Add at least one student below the header.')
  if (data.length > MAX_INVITE_ROWS) throw new Error(`Upload at most ${MAX_INVITE_ROWS} students at a time.`)
  return data.map((row, index) => {
    if (row.length !== 2) throw new Error(`Row ${index + 2} must have two columns.`)
    const firstName = row[0].trim()
    const lastName = row[1].trim()
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) throw new Error(`Row ${index + 2} needs a first and last name, each at most 80 characters.`)
    return { firstName, lastName }
  })
}

function safeCell(value: string): string {
  const firstVisible = [...value].find(character => character.charCodeAt(0) > 32)
  const guarded = firstVisible && ['=', '+', '@', '-'].includes(firstVisible) ? `'${value}` : value
  return `"${guarded.replaceAll('"', '""')}"`
}

export function inviteCsv(rows: Array<{ firstName: string; lastName: string; code?: string }>, withCodes = false): string {
  const header = withCodes ? [...HEADER, 'Invitation Code'] : HEADER
  return '\uFEFF' + [header.map(safeCell).join(','), ...rows.map(row => [row.firstName, row.lastName, ...(withCodes ? [row.code ?? ''] : [])].map(safeCell).join(','))].join('\r\n') + '\r\n'
}

export function downloadInviteCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
