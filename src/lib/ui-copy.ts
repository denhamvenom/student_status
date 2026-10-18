import reference from './ui-copy.reference.json'

// Reference snapshot: Design_Comparison.zip / source/ui-copy.json, October 2026.
// Newer approved workflows retain their wording here rather than modifying the reference.
export const uiCopy = {
  reference,
  brand: { name: '8044 Denham Venom', product: 'STUDENT STATUS' },
  navigation: { more: 'More', close: 'Close menu', account: 'Account', withdrawals: 'Withdrawals' },
  status: {
    notApplicable: reference.options.statusWords[4],
    unavailable: reference.options.statusWords[5],
    ready: reference.options.statusWords[8],
    open: 'Open',
    confirmed: reference.options.participationStatuses[0],
    pending: reference.options.participationStatuses[1],
    waitlist: reference.options.participationStatuses[2],
    notRegistered: reference.options.participationStatuses[3],
    withdrawn: 'Withdrawn',
    declined: 'Declined',
  },
  finance: { editDescription: 'Review a student account and record payments.', readDescription: 'Review a student account.', description: 'Charges, credits and transaction history.' },
  event: { staffRequirements: 'Review student requirements in Event readiness.', readiness: 'Event readiness', noRequirements: 'No requirements for this event.', participants: 'Signups', requirements: 'Requirements', transport: 'Transport', rooming: 'Rooming', overview: 'Overview' },
  readiness: { noEvents: 'No events yet.', noStudents: 'No students are registered for this event.', allComplete: 'All applicable requirements are complete.', students: 'Students', transportation: 'Transportation', rooming: 'Rooming' },
  theme: { dark: 'Dark mode', light: 'Light mode', failed: 'Appearance could not be saved. Please try again.' },
  wizard: { steps: reference.options.newEventSteps, cancel: 'Cancel', back: 'Back', continue: 'Continue', create: 'Create event' },
  // Three categories supersede the reference's older four-choice workflow.
  audiences: { travelTeam: 'Travel Team', wholeTeam: 'Whole Team', open: 'Open Registration' },
  errors: { pageTitle: 'Something went wrong', pageBody: 'The page could not load. Please try again.', reload: 'Reload page', signIn: 'Sign-in could not be completed. Please try again.', rooming: 'Room selection is unavailable for this view. Return to the event or try again.', retry: 'Try again', returnEvent: 'Return to event' },
} as const

export function statusLabel(value: string | null | undefined): string {
  if (!value) return uiCopy.status.notRegistered
  const labels: Record<string, string> = uiCopy.status
  return labels[value] ?? value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())
}

export function percentageLabel(value: number | null | undefined): string {
  return value == null ? '—' : `${value}%`
}

export function phoneLabel(role: string, index: number, fallback: string): string {
  const labels = reference.navigation.phoneBottomNav as Record<string, string[] | string>
  const label = Array.isArray(labels[role]) ? labels[role][index] ?? fallback : fallback
  return label === 'Status' ? 'Home' : label === 'Finances' ? 'Money' : label
}
