import { describe, expect, it, vi } from 'vitest'
import { decodePDFRawStream, PDFArray, PDFDocument, PDFPage, PDFRawStream } from 'pdf-lib'
import type { ConsentSnapshotV2 } from '../../convex/lib/consentSnapshotV2'
import { appendFieldTripSignature, renderFieldTripPdf } from './field-trip-pdf'
import { fieldTripApproved } from './field-trip-approved'

const synthetic = {
  format: 2, synthetic: true, templateVersion: 'field-trip-v2',
  version: { versionId: 'version', version: 'TEST-1', title: 'Synthetic Field Trip Form', wording: 'The parent permits the listed trip and minor first aid. This synthetic text has no real effect.', schoolName: 'Denham Springs High School', teamName: 'FIRST Team 8044, Denham Venom', acknowledgmentText: 'I reviewed this synthetic form and confirm its contents.' },
  student: { studentId: 'student', seasonId: 'season', legalName: 'Test Student', preferredName: 'Test', email: 'student@example.test', subteam: 'Programming', grade: '10', dateOfBirth: '2010-01-01', profileRevision: 1 },
  profile: { grade: '10', dateOfBirth: '2010-01-01', guardian: { name: 'Test Guardian', relationship: 'Parent', phone: '555-0100', email: 'guardian@example.test' }, emergency: { name: 'Test Alternate', relationship: 'Aunt', phone: '555-0101' }, allergies: { state: 'reported', entries: [{ allergen: 'Synthetic allergen', severity: 'Reported', reaction: 'Synthetic reaction', response: 'Contact guardian' }] }, prescriptions: { state: 'none', entries: [] }, insurance: { state: 'unavailable', provider: null, policy: null }, physician: { state: 'none', name: null, phone: null } },
  events: [{ eventId: 'event', name: 'Synthetic Event', type: 'Competition', startsAt: 1_900_000_000_000, endsAt: 1_900_086_400_000, destination: 'Test venue', travel: 'Family transport', overnight: false, feeCents: 0, independentTravel: false, transportEnabled: false, busSeats: null, additionalAdults: null, trailerRequired: false, signupMode: 'assigned', capacity: null, signupClosesAt: null, roomingEnabled: false, roomDeadline: null, permissionRequired: true, firstRequired: false, sponsorName: null, sponsorPhone: null, lodging: null }],
  priorCoverage: [{ eventId: 'event', revision: 1, submissionId: null }], signer: { source: 'electronic', accountId: 'parent', name: 'Test Guardian', email: 'guardian@example.test', recordedBy: 'parent' }, typedName: null, acknowledged: false, signedAt: null, recordedAt: null, paper: null,
} as unknown as ConsentSnapshotV2
const approved = { ...synthetic, templateVersion: fieldTripApproved.templateVersion, version: { ...synthetic.version, ...fieldTripApproved }, events: [{ ...synthetic.events[0], sponsorName: fieldTripApproved.sponsorName, sponsorPhone: fieldTripApproved.sponsorPhone }] } as ConsentSnapshotV2

// Observe real drawing calls without replacing PDF output. Metrics check physical
// page bounds; saved stream checks prove the encoded text survived serialization.
// This does not establish visual legibility or detect text overlapping other text.
async function renderWithTextEvidence(snapshot: ConsentSnapshotV2) {
  const lines: string[] = []
  const encoded: string[] = []
  const drawText = PDFPage.prototype.drawText
  const spy = vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, options = {}) {
    const { font, size, x, y } = options
    expect(font).toBeDefined()
    expect(size).toBeDefined()
    expect(x).toBeDefined()
    expect(y).toBeDefined()
    if (!font || size === undefined || x === undefined || y === undefined) throw new Error('Missing text metrics')
    const ascent = font.heightAtSize(size, { descender: false })
    const descent = font.heightAtSize(size) - ascent
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x + font.widthOfTextAtSize(text, size)).toBeLessThanOrEqual(this.getWidth() + 0.01)
    expect(y - descent).toBeGreaterThanOrEqual(0)
    expect(y + ascent).toBeLessThanOrEqual(this.getHeight() + 0.01)
    lines.push(text)
    encoded.push(font.encodeText(text).toString())
    return drawText.call(this, text, options)
  })
  try {
    const bytes = await renderFieldTripPdf(snapshot)
    // Running page headers interrupt continued paragraphs but are not part of
    // their content. Keep them in encoded evidence; omit them for prose checks.
    const runningHeaders = new Set(['DENHAM VENOM 8044', 'FIELD TRIP PERMISSION & MEDICAL RELEASE', 'SYNTHETIC DEVELOPMENT FORM - NO REAL CONSENT'])
    return { bytes, text: lines.filter(line => !runningHeaders.has(line)).join(' ').replace(/\s+/g, ' '), encoded }
  } finally {
    spy.mockRestore()
  }
}

async function expectSavedText(bytes: Uint8Array, encoded: string[]) {
  const document = await PDFDocument.load(bytes)
  const streams = document.getPages().flatMap(page => {
    const contents = page.node.Contents()
    const objects = contents instanceof PDFArray ? contents.asArray().map(ref => document.context.lookup(ref)) : [contents]
    return objects.flatMap(object => object instanceof PDFRawStream
      ? [new TextDecoder().decode(decodePDFRawStream(object).decode())] : [])
  })
    .join('\n')
  for (const value of encoded) expect(streams).toContain(`${value} Tj`)
  return document
}

describe('field trip PDF renderer', () => {
  it('keeps the approved original layout to one reviewed and signed page for ordinary values', async () => {
    const reviewed = await renderFieldTripPdf(approved)
    expect(await renderFieldTripPdf(approved)).toEqual(reviewed)
    const signed = await appendFieldTripSignature(reviewed, { typedName: 'Test Guardian', signedAt: 1_900_000_000_000, reviewedSha256: 'a'.repeat(64), source: 'electronic', templateVersion: approved.templateVersion })
    const reviewedDocument = await PDFDocument.load(reviewed)
    const signedDocument = await PDFDocument.load(signed)
    expect(signed).not.toEqual(reviewed)
    expect(reviewedDocument.getPageCount()).toBe(1)
    expect(signedDocument.getPageCount()).toBe(1)
    expect(reviewedDocument.getSubject()).toBe(fieldTripApproved.templateVersion)
    expect(reviewedDocument.getPage(0).getSize()).toEqual({ width: 612, height: 792 })
  })

  it('refuses a version whose text disagrees with the fixed approved page', async () => {
    const changed = { ...approved, version: { ...approved.version, wording: 'Different wording with minor first aid.' } } as ConsentSnapshotV2
    await expect(renderFieldTripPdf(changed)).rejects.toThrow('does not match')
  })

  it('preserves excess events on continuation pages without clipping', async () => {
    const long = { ...approved, events: Array.from({ length: 8 }, (_, index) => ({ ...approved.events[0], eventId: `event-${index}`, name: `Fictional event ${index + 1}`, destination: `Venue ${index + 1}`, travel: `Bus ${index + 1}`, lodging: `Hotel ${index + 1}`, sponsorName: `Sponsor ${index + 1}`, sponsorPhone: `555-010${index}`, startsAt: approved.events[0].startsAt + index * 86_400_000, endsAt: approved.events[0].endsAt + index * 86_400_000 })) } as ConsentSnapshotV2
    const { bytes: reviewed, text, encoded } = await renderWithTextEvidence(long)
    const dates = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric' })
    for (const event of long.events) {
      for (const value of [event.name, event.destination, event.travel, event.lodging!, event.sponsorName!, event.sponsorPhone!, dates.format(event.startsAt), dates.format(event.endsAt)]) expect(text).toContain(value)
    }
    const signed = await appendFieldTripSignature(reviewed, { typedName: 'Test Guardian', signedAt: 1_900_000_000_000, reviewedSha256: 'a'.repeat(64), source: 'electronic', templateVersion: long.templateVersion })
    const reviewedDocument = await expectSavedText(reviewed, encoded)
    const signedDocument = await expectSavedText(signed, encoded)
    expect(reviewedDocument.getPageCount()).toBeGreaterThan(1)
    expect(signedDocument.getPageCount()).toBe(reviewedDocument.getPageCount())
  })

  it('produces deterministic letter-size reviewed pages and appends signature evidence', async () => {
    const reviewed = await renderFieldTripPdf(synthetic)
    expect(await renderFieldTripPdf(synthetic)).toEqual(reviewed)
    const signed = await appendFieldTripSignature(reviewed, { typedName: 'Test Guardian', signedAt: 1_900_000_000_000, reviewedSha256: 'a'.repeat(64), source: 'electronic' })
    expect(new TextDecoder().decode(reviewed.subarray(0, 8))).toContain('%PDF-')
    expect(new TextDecoder().decode(signed.subarray(0, 8))).toContain('%PDF-')
    expect(signed).not.toEqual(reviewed)
    const document = await PDFDocument.load(reviewed)
    const signedDocument = await PDFDocument.load(signed)
    expect(document.getPages().length).toBeGreaterThan(0)
    expect(signedDocument.getPages().length).toBe(document.getPages().length + 1)
    expect(document.getPages()[0].getSize()).toEqual({ width: 612, height: 792 })
  })

  it('continues long event and health details onto additional pages', async () => {
    const health = Array.from({ length: 90 }, (_, index) => `Health instruction ${index + 1}: contact guardian and follow the recorded care plan.`).join(' ')
    const long = { ...synthetic, profile: { ...synthetic.profile, allergies: { state: 'reported', entries: [{ allergen: 'Long health fixture', severity: 'Reported', reaction: health, response: 'Final allergy response retained' }] } }, events: Array.from({ length: 20 }, (_, index) => ({ ...synthetic.events[0], eventId: `event-${index}`, name: `Synthetic event ${index + 1}` })) } as ConsentSnapshotV2
    const { bytes, text, encoded } = await renderWithTextEvidence(long)
    for (const event of long.events) expect(text).toContain(event.name)
    expect(text).toContain(health)
    expect(text).toContain('Final allergy response retained')
    const document = await expectSavedText(bytes, encoded)
    expect(document.getPages().length).toBeGreaterThan(2)
  })
})
