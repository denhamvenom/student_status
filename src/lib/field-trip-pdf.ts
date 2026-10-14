import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ConsentSnapshotV2 } from '../../convex/lib/consentSnapshotV2'
import { fieldTripFontBase64 } from './field-trip-font'

export type FieldTripSignature = { typedName: string; signedAt: number; reviewedSha256: string }

/** Preserve every reviewed page and append signature evidence to those exact PDF bytes. */
export async function appendFieldTripSignature(reviewedBytes: Uint8Array, signature: FieldTripSignature & { source: 'electronic' | 'paper' }): Promise<Uint8Array> {
  if (!/^[a-f0-9]{64}$/i.test(signature.reviewedSha256)) throw new Error('Reviewed PDF hash is invalid.')
  const document = await PDFDocument.load(reviewedBytes, { updateMetadata: false })
  document.registerFontkit(fontkit)
  const fontBytes = bytesFromBase64(fieldTripFontBase64)
  const characterMap = fontkit.create(fontBytes)
  for (const character of signature.typedName) {
    const point = character.codePointAt(0)!
    if (point > 31 && characterMap.glyphForCodePoint(point).id === 0) throw new Error(`Field trip PDF font cannot render character U+${point.toString(16).toUpperCase()}.`)
  }
  const body = await document.embedFont(fontBytes, { subset: true })
  const heading = await document.embedFont(StandardFonts.HelveticaBold)
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = TOP
  page.drawText('DENHAM VENOM 8044', { x: LEFT, y, font: heading, size: 11, color: PURPLE })
  y -= 20
  page.drawRectangle({ x: LEFT, y, width: RIGHT - LEFT, height: 2, color: GOLD })
  y -= 30
  page.drawText('SYNTHETIC SIGNATURE EVIDENCE', { x: LEFT, y, font: heading, size: 15, color: PURPLE })
  y -= 31
  const rows = [
    ['Evidence source', signature.source === 'paper' ? 'Paper record' : 'Verified electronic signer'],
    ['Signer', signature.typedName],
    ['Signed', signedDate(signature.signedAt)],
    ['Reviewed PDF SHA-256', signature.reviewedSha256],
  ] as const
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), { x: LEFT, y, font: heading, size: 8, color: MUTED })
    y -= 17
    for (const line of wrap(value, body, 10, RIGHT - LEFT)) {
      page.drawText(line, { x: LEFT, y, font: body, size: 10, color: INK })
      y -= 16
    }
    y -= 16
  }
  page.drawText('The preceding pages are the prepared PDF reviewed before signing.', { x: LEFT, y, font: body, size: 9, color: MUTED })
  return document.save({ useObjectStreams: false })
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const LEFT = 42
const RIGHT = PAGE_WIDTH - LEFT
const TOP = PAGE_HEIGHT - 45
const BOTTOM = 49
const PURPLE = rgb(0.28, 0.12, 0.48)
const GOLD = rgb(0.92, 0.69, 0.1)
const INK = rgb(0.1, 0.1, 0.12)
const MUTED = rgb(0.36, 0.36, 0.39)
const PALE = rgb(0.96, 0.96, 0.97)

const date = (value: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric' }).format(value)
const signedDate = (value: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(value)

function bytesFromBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0))
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.length === 0) { lines.push(''); continue }
    let line = ''
    for (const word of raw.split(/(\s+)/).filter(Boolean)) {
      const candidate = line + word
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue }
      if (line.trim()) { lines.push(line.trimEnd()); line = '' }
      if (font.widthOfTextAtSize(word, size) <= width) { line = word.trimStart(); continue }
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > width && line) { lines.push(line); line = '' }
        line += char
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

/** Renders only server-sealed form evidence. The prepared rendition is unsigned. */
export async function renderFieldTripPdf(snapshot: ConsentSnapshotV2, signature?: FieldTripSignature): Promise<Uint8Array> {
  if (signature && !/^[a-f0-9]{64}$/i.test(signature.reviewedSha256)) throw new Error('Reviewed PDF hash is invalid.')
  const document = await PDFDocument.create({ updateMetadata: false })
  document.registerFontkit(fontkit)
  const fontBytes = bytesFromBase64(fieldTripFontBase64)
  const characterMap = fontkit.create(fontBytes)
  const renderedValues = JSON.stringify({ version: snapshot.version, student: snapshot.student, profile: snapshot.profile, events: snapshot.events, signer: snapshot.signer, signature })
  for (const character of renderedValues) {
    const point = character.codePointAt(0)!
    if (point > 31 && characterMap.glyphForCodePoint(point).id === 0) throw new Error(`Field trip PDF font cannot render character U+${point.toString(16).toUpperCase()}.`)
  }
  const body = await document.embedFont(fontBytes, { subset: true })
  const heading = await document.embedFont(StandardFonts.HelveticaBold)
  document.setTitle(snapshot.version.title)
  document.setSubject('Field trip permission and medical release')
  document.setCreator('Denham Venom Student Status')
  let page: PDFPage
  let y = TOP

  function newPage() {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = TOP
    page.drawText('DENHAM VENOM 8044', { x: LEFT, y, font: heading, size: 11, color: PURPLE })
    page.drawText('FIELD TRIP PERMISSION & MEDICAL RELEASE', { x: RIGHT - heading.widthOfTextAtSize('FIELD TRIP PERMISSION & MEDICAL RELEASE', 10), y, font: heading, size: 10, color: INK })
    y -= 13
    page.drawRectangle({ x: LEFT, y, width: RIGHT - LEFT, height: 2, color: GOLD })
    y -= 18
    page.drawText('SYNTHETIC DEVELOPMENT FORM - NO REAL CONSENT', { x: LEFT, y, font: heading, size: 9, color: PURPLE })
    y -= 19
  }
  function ensure(height: number) { if (y - height < BOTTOM) newPage() }
  function paragraph(text: string, options: { size?: number; leading?: number; color?: ReturnType<typeof rgb>; inset?: number } = {}) {
    const size = options.size ?? 9.2
    const leading = options.leading ?? 13
    const inset = options.inset ?? 0
    for (const line of wrap(text, body, size, RIGHT - LEFT - inset)) {
      ensure(leading)
      if (line) page.drawText(line, { x: LEFT + inset, y, font: body, size, color: options.color ?? INK })
      y -= leading
    }
  }
  function section(title: string) {
    ensure(37)
    y -= 7
    page.drawRectangle({ x: LEFT, y: y - 2, width: RIGHT - LEFT, height: 19, color: PURPLE })
    page.drawText(title.toUpperCase(), { x: LEFT + 7, y: y + 4, font: heading, size: 10, color: rgb(1, 1, 1) })
    y -= 23
  }
  function field(label: string, value: string) {
    ensure(30)
    page.drawText(label.toUpperCase(), { x: LEFT, y, font: heading, size: 7.4, color: MUTED })
    y -= 11
    paragraph(value || 'Not provided', { size: 9.3, leading: 12.5 })
    y -= 5
  }
  function subheading(title: string) {
    y -= 4
    paragraph(title, { size: 10, leading: 14, color: PURPLE })
    y -= 2
  }
  function smallNote(value: string) { paragraph(value, { size: 8.3, leading: 11.5, color: MUTED }) }

  newPage()
  paragraph(`${snapshot.version.schoolName}  |  ${snapshot.version.teamName}`, { size: 8.5, leading: 12, color: MUTED })
  paragraph(`${snapshot.version.title}  |  Version ${snapshot.version.version}`, { size: 11, leading: 15 })
  section('Student and guardian')
  field('Student name', snapshot.student.legalName)
  field('Grade / date of birth', `${snapshot.profile.grade}  /  ${snapshot.profile.dateOfBirth}`)
  field('Parent or guardian', `${snapshot.profile.guardian.name} (${snapshot.profile.guardian.relationship})`)
  field('Guardian phone / email', `${snapshot.profile.guardian.phone}  /  ${snapshot.profile.guardian.email}`)
  field('Alternate emergency contact', `${snapshot.profile.emergency.name} (${snapshot.profile.emergency.relationship})  /  ${snapshot.profile.emergency.phone}`)
  field('Health insurance', snapshot.profile.insurance.state === 'provided' ? `${snapshot.profile.insurance.provider}  /  Policy ${snapshot.profile.insurance.policy}` : snapshot.profile.insurance.state === 'none' ? 'None reported' : 'Unavailable')
  field('Physician', snapshot.profile.physician.state === 'provided' ? `${snapshot.profile.physician.name}  /  ${snapshot.profile.physician.phone}` : snapshot.profile.physician.state === 'none' ? 'None reported' : 'Unavailable')

  section('Events covered by this form')
  for (const [index, event] of snapshot.events.entries()) {
    ensure(92)
    subheading(`${index + 1}. ${event.name}`)
    paragraph(`Location: ${event.destination}`, { size: 9, leading: 12 })
    paragraph(`Date(s): ${date(event.startsAt)}${event.endsAt !== event.startsAt ? ` - ${date(event.endsAt)}` : ''}`, { size: 9, leading: 12 })
    paragraph(`Transport: ${event.travel}${event.independentTravel ? ' (independent travel recorded)' : ''}`, { size: 9, leading: 12 })
    paragraph(`Lodging: ${event.lodging ?? (event.overnight ? 'Not provided' : 'None scheduled')}`, { size: 9, leading: 12 })
    paragraph(`Sponsor in charge: ${event.sponsorName ?? 'Not provided'}  /  Phone: ${event.sponsorPhone ?? 'Not provided'}`, { size: 9, leading: 12 })
    y -= 10
  }

  section('Permission and release wording')
  smallNote(`The wording below is the exact version presented for this form (${snapshot.version.version}).`)
  y -= 6
  paragraph(snapshot.version.wording, { size: 9, leading: 13.2 })

  section('Allergies')
  if (snapshot.profile.allergies.state === 'none') paragraph('None reported.')
  else for (const [index, entry] of snapshot.profile.allergies.entries.entries()) {
    ensure(84)
    subheading(`${index + 1}. ${entry.allergen}`)
    paragraph(`Severity: ${entry.severity}`)
    paragraph(`Reaction: ${entry.reaction}`)
    paragraph(`Response: ${entry.response}`)
    y -= 5
  }

  section('Prescriptions')
  if (snapshot.profile.prescriptions.state === 'none') paragraph('None reported.')
  else for (const [index, entry] of snapshot.profile.prescriptions.entries.entries()) {
    ensure(97)
    subheading(`${index + 1}. ${entry.name}`)
    paragraph(`Dose: ${entry.dose}`)
    paragraph(`Timing: ${entry.timing}`)
    paragraph(`Reason: ${entry.reason}`)
    paragraph(`Carried by: ${entry.carriedBy}`)
    y -= 5
  }

  section('Guardian acknowledgment and signature')
  paragraph(snapshot.version.acknowledgmentText, { size: 9, leading: 13 })
  y -= 10
  if (signature) {
    field(snapshot.signer.source === 'paper' ? 'Paper signer' : 'Electronic signature', signature.typedName)
    field('Signed', signedDate(signature.signedAt))
    field('Reviewed PDF SHA-256', signature.reviewedSha256)
  } else if (snapshot.signer.source === 'paper') {
    field('Paper signer', snapshot.signer.name)
    smallNote('The paper signature and original document must be verified before this record is accepted.')
  } else {
    field('Signer to review', snapshot.signer.name)
    smallNote('Unsigned review copy. Electronic acknowledgment and typed signature are recorded after this exact form is reviewed.')
  }
  smallNote(`Template ${snapshot.templateVersion}  |  Student ${snapshot.student.studentId}  |  Season ${snapshot.student.seasonId}`)

  const pages = document.getPages()
  pages.forEach((item, index) => {
    item.drawRectangle({ x: LEFT, y: 35, width: RIGHT - LEFT, height: 0.7, color: PALE })
    item.drawText(`Denham Venom 8044  |  ${snapshot.version.version}`, { x: LEFT, y: 24, font: body, size: 7.3, color: MUTED })
    const pageText = `Page ${index + 1} of ${pages.length}`
    item.drawText(pageText, { x: RIGHT - body.widthOfTextAtSize(pageText, 7.3), y: 24, font: body, size: 7.3, color: MUTED })
  })
  return document.save({ useObjectStreams: false })
}
