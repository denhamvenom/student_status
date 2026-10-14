import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { ConsentSnapshotV2 } from '../../convex/lib/consentSnapshotV2'
import { appendFieldTripSignature, renderFieldTripPdf } from './field-trip-pdf'

const synthetic = {
  format: 2, synthetic: true, templateVersion: 'field-trip-v2',
  version: { versionId: 'version', version: 'TEST-1', title: 'Synthetic Field Trip Form', wording: 'The parent permits the listed trip and minor first aid. This synthetic text has no real effect.', schoolName: 'Denham Springs High School', teamName: 'FIRST Team 8044, Denham Venom', acknowledgmentText: 'I reviewed this synthetic form and confirm its contents.' },
  student: { studentId: 'student', seasonId: 'season', legalName: 'Test Student', preferredName: 'Test', email: 'student@example.test', subteam: 'Programming', grade: '10', dateOfBirth: '2010-01-01', profileRevision: 1 },
  profile: { grade: '10', dateOfBirth: '2010-01-01', guardian: { name: 'Test Guardian', relationship: 'Parent', phone: '555-0100', email: 'guardian@example.test' }, emergency: { name: 'Test Alternate', relationship: 'Aunt', phone: '555-0101' }, allergies: { state: 'reported', entries: [{ allergen: 'Synthetic allergen', severity: 'Reported', reaction: 'Synthetic reaction', response: 'Contact guardian' }] }, prescriptions: { state: 'none', entries: [] }, insurance: { state: 'unavailable', provider: null, policy: null }, physician: { state: 'none', name: null, phone: null } },
  events: [{ eventId: 'event', name: 'Synthetic Event', type: 'Competition', startsAt: 1_900_000_000_000, endsAt: 1_900_086_400_000, destination: 'Test venue', travel: 'Family transport', overnight: false, feeCents: 0, independentTravel: false, transportEnabled: false, busSeats: null, additionalAdults: null, trailerRequired: false, signupMode: 'assigned', capacity: null, signupClosesAt: null, roomingEnabled: false, roomDeadline: null, permissionRequired: true, firstRequired: false, sponsorName: null, sponsorPhone: null, lodging: null }],
  priorCoverage: [{ eventId: 'event', revision: 1, submissionId: null }], signer: { source: 'electronic', accountId: 'parent', name: 'Test Guardian', email: 'guardian@example.test', recordedBy: 'parent' }, typedName: null, acknowledged: false, signedAt: null, recordedAt: null, paper: null,
} as unknown as ConsentSnapshotV2

describe('field trip PDF renderer', () => {
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
    const long = { ...synthetic, events: Array.from({ length: 20 }, (_, index) => ({ ...synthetic.events[0], eventId: `event-${index}`, name: `Synthetic event ${index + 1}` })) } as ConsentSnapshotV2
    const document = await PDFDocument.load(await renderFieldTripPdf(long))
    expect(document.getPages().length).toBeGreaterThan(2)
  })
})
