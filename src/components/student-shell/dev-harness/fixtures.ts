import type { FixtureTable } from './fixtureClient'

const day = 24 * 60 * 60 * 1000
const at = (iso: string) => Date.parse(iso)

/** Synthetic Student data for the development harness. Fictional people only; example.invalid addresses. */
export function harnessFixtures({ theme, fail, roles }: { theme: 'light' | 'dark'; fail: string | null; roles: number }) {
  const studentId = 'fixture-student'
  const student = { _id: studentId, preferredName: 'Dev', legalName: 'Dev Student', subteam: 'Programming', travelTeam: true, active: true, roomCategory: 'Boys', email: 'dev.student@example.invalid', shirtSize: 'M', profileRevision: 1, fundraiserConnected: false, allergies: { state: 'none' }, medications: { state: 'unknown' } }
  let viewer = {
    status: 'active',
    availableRoles: roles > 1 ? ['parent', 'mentor'] : [],
    operatingRole: 'parent',
    roleSelectionRequired: false,
    user: { id: 'fixture-user', name: 'Dev Student', email: 'dev.student@example.invalid', role: 'student', travelLead: false, financialEdit: false, healthExport: false, accessRevision: 0, theme: theme as string },
    students: [student],
    season: { _id: 'fixture-season', name: '2026–27 season', year: 2027 },
  }
  const base = { travel: 'Team bus', overnight: false, roomingEnabled: false, signupMode: 'open', allowWithdrawal: true, archived: false, cancelled: false, mediaSupportRequested: false, enrollmentState: 'complete' }
  const events = [
    { ...base, _id: 'event-invitational', name: 'Pacific Robotics Invitational', type: 'Competition', startsAt: at('2026-11-21T14:00:00Z'), endsAt: at('2026-11-23T23:00:00Z'), destination: 'Example Arena, Portland', overnight: true, roomingEnabled: true, feeCents: 18500 },
    { ...base, _id: 'event-skills', name: 'Skills Competition', type: 'Competition', startsAt: at('2026-11-14T15:00:00Z'), endsAt: at('2026-11-14T23:00:00Z'), destination: 'Example High School', feeCents: 2500, signupMode: 'approval' },
    { ...base, _id: 'event-outreach', name: 'Outreach Night', type: 'Outreach', startsAt: at('2026-11-06T23:00:00Z'), endsAt: at('2026-11-07T02:00:00Z'), destination: 'Example Library', travel: 'Own transport', feeCents: 0 },
    { ...base, _id: 'event-team-day', name: 'Team photo day', type: 'Team', startsAt: at('2026-11-10T23:00:00Z'), endsAt: at('2026-11-11T01:00:00Z'), destination: 'Shop', travel: '', feeCents: 0, signupMode: 'assigned' },
  ]
  const participation: Record<string, string | null> = { 'event-invitational': 'confirmed', 'event-skills': null, 'event-outreach': 'pending', 'event-team-day': 'confirmed' }
  const readiness = (id: string) => id === 'event-invitational' ? { state: 'open', open: ['Permission accepted', 'Room selection'] } : id === 'event-team-day' ? { state: 'ready', open: [] } : { state: 'notApplicable', open: [] }
  const phase = { tuesdayHeld: 12, tuesdayAttended: 10, tuesdayPercent: 83, thursdayAttended: 6, outreachAttended: 3, buildWeekdayHeld: 0, buildWeekdayAttended: 0, buildSaturdayHeld: 0, buildSaturdayAttended: 0, buildSundayHeld: 0, updatedAt: at('2026-10-26T15:00:00Z') }
  const session = (n: number, state: 'open' | 'closed', qualifies: boolean | null) => ({ sessionId: `session-${n}`, title: n % 2 ? 'Tuesday meeting' : 'Thursday meeting', scheduledStart: at('2026-10-20T23:00:00Z') - n * 3 * day, state, provisional: false, needsReview: false, reportState: 'ready', totalMs: 2.5 * 60 * 60 * 1000, scheduledMs: 2 * 60 * 60 * 1000, earlyMs: 15 * 60 * 1000, extendedMs: 15 * 60 * 1000, longestScheduledMs: 2 * 60 * 60 * 1000, qualifies })
  const page = <T,>(rows: T[]) => ({ page: rows, isDone: true, continueCursor: '' })
  const eventDetail = (args: Record<string, unknown>) => {
    const event = events.find(row => row._id === args.eventId) ?? events[0]
    return { event, participation: participation[event._id], requirements: [], readiness: args.studentId ? { participation: participation[event._id], ...readiness(event._id) } : null }
  }

  const queries: FixtureTable = {
    'app:viewer': () => viewer,
    'app:listEvents': () => events.filter(event => event.signupMode !== 'assigned' || participation[event._id]).map(event => ({ event, participation: participation[event._id] })),
    'app:eventDetail': eventDetail,
    'app:studentDashboard': () => ({
      student,
      todos: [
        { eventId: 'event-invitational', eventName: 'Pacific Robotics Invitational', label: 'Choose your room', dueAt: at('2026-11-06T23:00:00Z'), href: '/events/event-invitational/rooming', responsible: 'student', blocked: false },
        { eventId: null, eventName: 'FIRST registration and Consent & Release', label: 'Your parent completes FIRST registration.', dueAt: null, href: null, responsible: 'parent', blocked: true },
      ],
      events: events.filter(event => event.signupMode !== 'assigned' || participation[event._id]).map(event => ({ event, participation: participation[event._id], readiness: readiness(event._id) })),
    }),
    'app:studentFinances': () => ({ state: 'ready', summary: { dueCents: 8500, chargedCents: 21000, paidCents: 12500, travelBalanceCents: 4000, personalAvailableCents: 1500, fundraisingAvailableCents: 2500 } }),
    'app:studentProfile': () => student,
    'financeDetails:charges': () => page([
      { _id: 'charge-1', eventId: 'event-invitational', label: 'Pacific Robotics Invitational', amountCents: 18500, adjustedCents: 0, cancelledCents: 0, appliedCents: 10000 },
      { _id: 'charge-2', eventId: null, label: 'Season fee', amountCents: 2500, adjustedCents: 0, cancelledCents: 0, appliedCents: 2500 },
    ]),
    'financeDetails:history': () => page([
      { _id: 'history-1', recordedAt: at('2026-10-02T15:00:00Z'), safeDescription: 'Payment', method: 'check', amountCents: 10000 },
      { _id: 'history-2', recordedAt: at('2026-09-12T15:00:00Z'), safeDescription: 'Fundraising credit', method: null, amountCents: 2500 },
    ]),
    'dashboardReports:familyFinance': () => ({ state: 'ready', maintenance: null, dueCents: 8500, raisedCents: 35000, travelShareCents: 17500, fundraisingAvailableCents: 2500, paidCents: 12500, transferredInCents: 0, travelBalanceCents: 4000, updatedAt: at('2026-10-26T15:00:00Z') }),
    'dashboardReports:familyAttendance': () => ({
      state: 'ready', message: '', nextRefreshAt: null,
      phaseBoundary: { state: 'available', competitionYear: 2027, kickoffDate: '2027-01-09', currentPhase: 'offseason' },
      phases: { offseason: phase, buildSeason: { ...phase, tuesdayHeld: 0, tuesdayAttended: 0, tuesdayPercent: null, thursdayAttended: 0, outreachAttended: 0, updatedAt: null } },
      verified: { updatedAt: at('2026-10-26T15:00:00Z') },
      legacy: { tuesdayPercent: 80, tuesdayAttended: 8, tuesdayHeld: 10, thursdayAttended: 4, outreachAttended: 2 },
      sessions: [session(1, 'closed', true), session(2, 'closed', false), session(3, 'open', null)],
      isDone: true, continueCursor: '',
    }),
    'fundraiserLinks:forStudent': () => 'https://fundraiser.example.invalid/dev-student',
    'withdrawals:withdrawalPreview': (args: Record<string, unknown>) => ({ status: participation[String(args.eventId)] ?? null, eventName: events.find(row => row._id === args.eventId)?.name ?? '', studentName: 'Dev Student', wholeTeam: false, wholeTeamLeft: false, allowWithdrawal: true, requestStatus: null, requestId: null, progress: null, canRetry: false, paidMainCents: 10000, paidExtraCents: 0 }),
    'travel:ownTravel': () => ({ transportEnabled: true, eligible: true, independentTravel: false }),
    'parentInvites:invitationSettings': () => ({ enabled: true }),
    'parentInvites:listStudentInvites': () => [{ _id: 'invite-1', parentEmail: 'parent.one@example.invalid', status: 'pending', expiresAt: Date.now() + 5 * day, resendAvailableAt: 0, emailStatus: 'sent' }],
    'parentInvites:listFamilyLinks': () => [{ _id: 'link-1', parentName: 'Jordan W.', parentEmail: 'jordan.w@example.invalid', active: true }],
    'rooms:mine': () => ({ group: null, requestedAssignment: false, roomDeadline: at('2026-11-07T05:59:00Z'), invites: [{ _id: 'room-invite-1', groupName: 'Room 4', invitedBy: 'Jordan W.' }], sentInvites: [] }),
    'rooms:eligiblePeers': () => [{ studentId: 'peer-1', legalName: 'Jordan W.', preferredName: 'Jordan' }, { studentId: 'peer-2', legalName: 'Sam Example', preferredName: 'Sam' }],
    'profileSetup:get': () => ({ studentId }),
    'setupWizard:get': () => ({ revision: 1, student: { legalName: 'Dev Student', preferredName: 'Dev', grade: '10', dateOfBirth: '2010-05-01', shirtSize: 'M', roomCategory: 'Boys', roomCategoryLocked: true, subteam: 'Programming', travelTeam: true } }),
  }
  const mutations: FixtureTable = {
    'setupWizard:summary': () => ({ students: [{ studentId, needsSetup: false }] }),
    'app:setTheme': args => { if (fail === 'theme') return new Error('Fixture: theme save failed'); viewer = { ...viewer, user: { ...viewer.user, theme: String(args.theme) } }; return null },
  }
  const actions: FixtureTable = {
    'auth:signOut': () => fail === 'signOut' ? new Error('Fixture: sign out failed') : null,
  }
  return { queries, mutations, actions }
}
