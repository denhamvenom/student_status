import { uiCopy } from './ui-copy'

// Approved three-audience creation flow. The older reference options remain
// available in uiCopy.reference; these labels describe the current safe fields.
export const eventCopy = {
  enrollment: {
    running: 'Adding the Whole Team',
    failed: 'Team enrollment needs attention',
    description: 'Participation and event fees are being prepared. Event arrangements will be available when enrollment is complete.',
    progress: (processed: number, assigned: number) => `${processed} profiles reviewed · ${assigned} members assigned`,
    retry: 'Retry enrollment', retrying: 'Retrying…', retryError: 'Enrollment could not be restarted.',
  },
  title: 'New event',
  description: 'Set up a competition, outreach event or team activity.',
  backToEvents: '← Events',
  stepCount: (step: number, total: number) => `New event · step ${step} of ${total}`,
  steps: uiCopy.wizard.steps,
  actions: uiCopy.wizard,
  types: { competition: 'Competition', outreach: 'Outreach', team: 'Team' },
  fields: {
    name: 'Name', type: 'Type', starts: 'Starts', ends: 'Ends', destination: 'Destination',
    capacity: 'Participant limit (optional)', fee: 'Event fee (USD)',
    permission: 'Permission accepted', first: 'FIRST registration',
    travelArrangement: 'Travel arrangement', overnight: 'Overnight event',
    rooming: 'Enable room selection', roomDeadline: 'Room selection deadline',
  },
  placeholders: {
    name: 'Event name', destination: 'City, venue', capacity: 'No limit',
    travel: 'Vehicles, charter bus, or families',
  },
  audiences: {
    group: 'Who’s going',
    travelTeam: uiCopy.audiences.travelTeam,
    travelTeamDetail: 'Active Travel Team students are assigned when the event is created.',
    wholeTeam: uiCopy.audiences.wholeTeam,
    wholeTeamDetail: 'Every active member is included. New members join upcoming events automatically.',
    open: uiCopy.audiences.open,
    openDetail: 'Students may sign up; set an optional capacity below.',
    individualNote: 'Individual student selection is not available in this creation flow.',
  },
  notes: {
    fee: 'Pending signups are charged only when confirmed. Additional charges can be added from student finances after creation.',
    requiredPayment: 'Required payment is tracked because this event has a fee.',
    drivers: 'Drivers and passenger seats are assigned from the event page after creation.',
  },
  review: {
    event: 'Event', type: 'Type', dates: 'Dates', destination: 'Destination',
    audience: 'Who’s going', fee: 'Fee', travel: 'Travel', rooming: 'Rooming',
    notEntered: 'Not entered', enabled: 'Enabled', notEnabled: 'Not enabled', currency: 'USD',
  },
  workspace: { roomingSummary: 'Room groups, assignments and adult review' },
  errors: {
    required: 'Complete the event name, dates, destination and travel details.',
    fee: 'Enter a valid fee.',
  },
} as const
