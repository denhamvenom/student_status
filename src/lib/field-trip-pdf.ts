import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ConsentSnapshotV2 } from '../../convex/lib/consentSnapshotV2'
import { fieldTripFontBase64 } from './field-trip-font'
import { fieldTripOriginalTemplateBase64 } from './field-trip-original-template'
import { fieldTripApproved } from './field-trip-approved'

export type FieldTripSignature = { typedName: string; signedAt: number; reviewedSha256: string }

/** Preserve every reviewed page and append signature evidence to those exact PDF bytes. */
async function appendLegacyFieldTripSignature(reviewedBytes: Uint8Array, signature: FieldTripSignature & { source: 'electronic' | 'paper' }): Promise<Uint8Array> {
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

type SignatureOptions = FieldTripSignature & { source: 'electronic' | 'paper'; templateVersion?: string }
type Overflow = { label: string; value: string }
const atX = (value: number) => value / 1.5
const atY = (value: number) => PAGE_HEIGHT - value / 1.5
const normalize = (value: string | null | undefined) => value?.trim() || 'Not provided'
const shortDate = (value: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', year: 'numeric' }).format(value)
const birthDate = (value: string) => { const [year, month, day] = value.split('-'); return year && month && day ? `${month}/${day}/${year}` : value }

function assertOriginalVersion(snapshot: ConsentSnapshotV2) {
  const version = snapshot.version
  if (String(snapshot.templateVersion) !== fieldTripApproved.templateVersion ||
      version.title !== fieldTripApproved.title ||
      version.schoolName !== fieldTripApproved.schoolName ||
      version.teamName !== fieldTripApproved.teamName ||
      version.wording !== fieldTripApproved.wording ||
      version.acknowledgmentText !== fieldTripApproved.acknowledgmentText) {
    throw new Error('The prepared form wording does not match the approved original layout.')
  }
}

function fitted(page: PDFPage, font: PDFFont, overflow: Overflow[], label: string, value: string, x: number, y: number, width: number, size = 8, minimum = 5.8) {
  const single = normalize(value).replace(/\s+/g, ' ')
  let chosen = size
  while (chosen > minimum && font.widthOfTextAtSize(single, chosen) > atX(width)) chosen -= 0.2
  if (font.widthOfTextAtSize(single, chosen) > atX(width)) {
    overflow.push({ label, value: single })
    page.drawText('See continuation', { x: atX(x), y: atY(y), font, size: Math.min(7.5, size), color: INK })
    return
  }
  page.drawText(single, { x: atX(x), y: atY(y), font, size: chosen, color: INK })
}

function detailLine(entry: ConsentSnapshotV2['events'][number]) {
  return `${entry.name}; location ${entry.destination}; dates ${date(entry.startsAt)} - ${date(entry.endsAt)}; transport ${entry.travel}; lodging ${entry.lodging ?? 'Not provided'}; sponsor ${entry.sponsorName ?? 'Not provided'}, ${entry.sponsorPhone ?? 'Not provided'}.`
}

function continuation(document: PDFDocument, body: PDFFont, heading: PDFFont, overflow: Overflow[]) {
  if (!overflow.length) return
  let page!: PDFPage
  let y = TOP
  function newPage() {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = TOP
    page.drawText('FIELD TRIP FORM - CONTINUATION', { x: LEFT, y, font: heading, size: 11, color: INK })
    y -= 27
  }
  newPage()
  for (const item of overflow) {
    const lines = wrap(item.value, body, 9, RIGHT - LEFT)
    if (y - 22 - lines.length * 13 < BOTTOM) newPage()
    page.drawText(item.label.toUpperCase(), { x: LEFT, y, font: heading, size: 8, color: MUTED })
    y -= 15
    for (const line of lines) {
      page.drawText(line, { x: LEFT, y, font: body, size: 9, color: INK })
      y -= 13
    }
    y -= 12
  }
}

async function renderOriginalFieldTripPdf(snapshot: ConsentSnapshotV2): Promise<Uint8Array> {
  assertOriginalVersion(snapshot)
  const document = await PDFDocument.create({ updateMetadata: false })
  document.registerFontkit(fontkit)
  const fontBytes = bytesFromBase64(fieldTripFontBase64)
  const characterMap = fontkit.create(fontBytes)
  for (const character of JSON.stringify({ student: snapshot.student, profile: snapshot.profile, events: snapshot.events, signer: snapshot.signer })) {
    const point = character.codePointAt(0)!
    if (point > 31 && characterMap.glyphForCodePoint(point).id === 0) throw new Error(`Field trip PDF font cannot render character U+${point.toString(16).toUpperCase()}.`)
  }
  const body = await document.embedFont(fontBytes, { subset: true })
  const heading = await document.embedFont(StandardFonts.HelveticaBold)
  const background = await document.embedPng(bytesFromBase64(fieldTripOriginalTemplateBase64))
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  page.drawImage(background, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT })
  document.setTitle(fieldTripApproved.title)
  document.setSubject(fieldTripApproved.templateVersion)
  document.setCreator('Denham Venom Student Status')
  const extra: Overflow[] = []
  const draw = (label: string, value: string, x: number, y: number, width: number, size?: number, minimum?: number) => fitted(page, body, extra, label, value, x, y, width, size, minimum)
  draw('Student name', snapshot.student.legalName, 55, 153, 255, 8)
  draw('Grade and date of birth', `${snapshot.profile.grade} / ${birthDate(snapshot.profile.dateOfBirth)}`, 331, 153, 256, 8)
  draw('Parent or guardian', snapshot.profile.guardian.name, 606, 153, 255, 8)
  draw('Guardian phone and email', `${snapshot.profile.guardian.phone} / ${snapshot.profile.guardian.email}`, 55, 191, 255, 7.2)
  draw('Alternate emergency contact', `${snapshot.profile.emergency.name}, ${snapshot.profile.emergency.relationship}, ${snapshot.profile.emergency.phone}`, 331, 191, 256, 7.2)
  const insurance = snapshot.profile.insurance.state === 'provided' ? `${snapshot.profile.insurance.provider}, ${snapshot.profile.insurance.policy}` : snapshot.profile.insurance.state === 'none' ? 'None reported' : 'Unavailable'
  const physician = snapshot.profile.physician.state === 'provided' ? `${snapshot.profile.physician.name}, ${snapshot.profile.physician.phone}` : snapshot.profile.physician.state === 'none' ? 'None reported' : 'Unavailable'
  draw('Insurance and physician', `${insurance} / ${physician}`, 606, 191, 255, 6.2, 4.8)
  const eventRows = snapshot.events.length > 3 ? snapshot.events.slice(0, 2) : snapshot.events
  for (const [index, event] of eventRows.entries()) {
    const rowY = [270, 296, 336][index]
    draw(`Event ${index + 1} name`, event.name, 62, rowY, 188, 7.3)
    draw(`Event ${index + 1} location`, event.destination, 255, rowY, 207, 7.3)
    draw(`Event ${index + 1} dates`, event.startsAt === event.endsAt ? date(event.startsAt) : `${date(event.startsAt)} - ${date(event.endsAt)}`, 471, rowY, 116, 7.3, 5.4)
    draw(`Event ${index + 1} transport`, event.travel, 594, rowY, 116, 7.3)
    draw(`Event ${index + 1} lodging`, event.lodging ?? (event.overnight ? 'Not provided' : 'None'), 718, rowY, 140, 7.3)
  }
  if (snapshot.events.length > 3) {
    draw('Additional events', `${snapshot.events.length - 2} more events - see continuation`, 62, 336, 784, 7.3)
    snapshot.events.slice(2).forEach((event, index) => extra.push({ label: `Additional event ${index + 3}`, value: detailLine(event) }))
  }
  const sponsors = [...new Set(snapshot.events.map(event => `${normalize(event.sponsorName)}, ${normalize(event.sponsorPhone)}`))]
  draw('Sponsor in charge', sponsors.length === 1 ? sponsors[0] : 'See continuation', 170, 362, 177, 7.3)
  if (sponsors.length > 1) snapshot.events.forEach((event, index) => extra.push({ label: `Sponsor for event ${index + 1}`, value: `${event.name}: ${normalize(event.sponsorName)}, ${normalize(event.sponsorPhone)}` }))
  const allergies = snapshot.profile.allergies
  if (allergies.state === 'none') draw('Allergies', 'None reported', 62, 771, 300, 7.5)
  else {
    const rows = allergies.entries.length > 2 ? allergies.entries.slice(0, 1) : allergies.entries
    rows.forEach((entry, index) => {
      const y = index === 0 ? 771 : 813
      draw(`Allergy ${index + 1} allergen`, entry.allergen, 62, y, 91, 7.5)
      draw(`Allergy ${index + 1} severity`, entry.severity, 158, y, 67, 7.5)
      if (index === 0) {
        draw(`Allergy ${index + 1} reaction`, entry.reaction, 229, y, 143, 7.1, 5.2)
        draw(`Allergy ${index + 1} response`, entry.response, 229, y + 15, 143, 7.1, 5.2)
      } else draw(`Allergy ${index + 1} reaction and response`, `${entry.reaction}; ${entry.response}`, 229, y, 143, 7.1, 5.2)
    })
    if (allergies.entries.length > 2) {
      draw('Additional allergies', 'Additional allergies: see continuation', 62, 813, 307, 7)
      allergies.entries.slice(1).forEach((entry, index) => extra.push({ label: `Additional allergy ${index + 2}`, value: `${entry.allergen}; severity ${entry.severity}; reaction ${entry.reaction}; response ${entry.response}` }))
    }
  }
  const prescriptions = snapshot.profile.prescriptions
  if (prescriptions.state === 'none') draw('Prescriptions', 'None reported', 400, 771, 460, 7.3)
  else {
    const rows = prescriptions.entries.length > 2 ? prescriptions.entries.slice(0, 1) : prescriptions.entries
    rows.forEach((entry, index) => {
      const y = index === 0 ? 771 : 796
      draw(`Prescription ${index + 1} name`, entry.name, 400, y, 119, 7)
      draw(`Prescription ${index + 1} dose`, entry.dose, 523, y, 74, 7)
      draw(`Prescription ${index + 1} timing`, entry.timing, 601, y, 84, 7)
      draw(`Prescription ${index + 1} reason`, entry.reason, 690, y, 91, 7)
      draw(`Prescription ${index + 1} carried by`, entry.carriedBy, 786, y, 73, 7)
    })
    if (prescriptions.entries.length > 2) {
      draw('Additional prescriptions', 'Additional prescriptions: see continuation', 400, 796, 460, 7)
      prescriptions.entries.slice(1).forEach((entry, index) => extra.push({ label: `Additional prescription ${index + 2}`, value: `${entry.name}; dose ${entry.dose}; timing ${entry.timing}; reason ${entry.reason}; carried by ${entry.carriedBy}` }))
    }
  }
  draw('Printed signer name', snapshot.signer.name, 372, 1110, 184, 8)
  draw('Signer relationship', snapshot.profile.guardian.relationship, 576, 1110, 139, 8)
  if (snapshot.synthetic) page.drawText('SYNTHETIC DEVELOPMENT FORM - NO REAL CONSENT', { x: atX(55), y: atY(875), font: heading, size: 7, color: INK })
  continuation(document, body, heading, extra)
  return document.save({ useObjectStreams: false })
}

async function signOriginalFieldTripPdf(reviewedBytes: Uint8Array, signature: SignatureOptions): Promise<Uint8Array> {
  const document = await PDFDocument.load(reviewedBytes, { updateMetadata: false })
  if (document.getSubject() !== fieldTripApproved.templateVersion || document.getPageCount() < 1) throw new Error('Reviewed PDF does not match the approved original layout.')
  document.registerFontkit(fontkit)
  const fontBytes = bytesFromBase64(fieldTripFontBase64)
  const characterMap = fontkit.create(fontBytes)
  for (const character of signature.typedName) {
    const point = character.codePointAt(0)!
    if (point > 31 && characterMap.glyphForCodePoint(point).id === 0) throw new Error(`Field trip PDF font cannot render character U+${point.toString(16).toUpperCase()}.`)
  }
  const body = await document.embedFont(fontBytes, { subset: true })
  const heading = await document.embedFont(StandardFonts.HelveticaBold)
  const page = document.getPage(0)
  const extra: Overflow[] = []
  fitted(page, body, extra, 'Typed signature', signature.typedName, 67, 1110, 285, 8, 5.8)
  fitted(page, body, extra, 'Date signed', shortDate(signature.signedAt), 738, 1110, 110, 8, 6)
  continuation(document, body, heading, extra)
  return document.save({ useObjectStreams: false })
}

/** A new approved form uses the original scanned layout; older stored forms retain their renderer. */
export async function renderFieldTripPdf(snapshot: ConsentSnapshotV2, signature?: FieldTripSignature): Promise<Uint8Array> {
  if (String(snapshot.templateVersion) !== fieldTripApproved.templateVersion) return renderLegacyFieldTripPdf(snapshot, signature)
  const reviewed = await renderOriginalFieldTripPdf(snapshot)
  return signature ? signOriginalFieldTripPdf(reviewed, { ...signature, source: snapshot.signer.source, templateVersion: fieldTripApproved.templateVersion }) : reviewed
}

/** The server passes the sealed template version explicitly when signing stored reviewed bytes. */
export async function appendFieldTripSignature(reviewedBytes: Uint8Array, signature: SignatureOptions): Promise<Uint8Array> {
  if (!/^[a-f0-9]{64}$/i.test(signature.reviewedSha256)) throw new Error('Reviewed PDF hash is invalid.')
  if (signature.templateVersion === fieldTripApproved.templateVersion) return signOriginalFieldTripPdf(reviewedBytes, signature)
  if (signature.templateVersion && signature.templateVersion !== 'field-trip-v2') throw new Error('Unknown field trip PDF template.')
  return appendLegacyFieldTripSignature(reviewedBytes, signature)
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
async function renderLegacyFieldTripPdf(snapshot: ConsentSnapshotV2, signature?: FieldTripSignature): Promise<Uint8Array> {
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
