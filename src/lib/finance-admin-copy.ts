export const financeAdminCopy = {
  title: 'Student accounts', student: 'Student', charged: 'Charged', paid: 'Paid (personal)', credits: 'Fundraising applied', balance: 'Balance due', travel: 'Fundraising available',
  columnHelp: 'What do these columns mean?',
  explanation: "Paid (personal) is personal payments used on charges. Fundraising applied is fundraising credit used on charges. Fundraising available is credit not used yet. Each account's details show unused personal payments. Money still available is not a cash refund.",
  loading: 'Loading student accounts…', empty: 'No active student accounts in this season.',
  continuing: 'More student records are available. Continue loading to review them.', more: 'More students', loadingMore: 'Loading more students…', unavailable: 'Unavailable',
  updating: 'Account totals are updating.', failed: 'Account totals need Coach review.', uninitialized: 'Account totals need preparation.',
  prepare: 'Prepare account', preparing: 'Preparing…', prepareFor: (name: string) => `Prepare account for ${name}`,
  details: 'Account details', record: 'Record payment', updated: 'Updated',
  viewAccount: (name: string) => `Open account for ${name}`,
  recordFor: (name: string) => `Record payment for ${name}`,
} as const

export const financeChangesCopy = {
  title: 'Recent changes', when: 'When', student: 'Student', change: 'Change', amounts: 'Previous → updated', actor: 'By · reason',
  team: 'Team', other: 'Financial change', unavailable: 'Not recorded', loading: 'Loading financial changes…',
  empty: 'No financial changes are available in the current coverage.', continuing: 'More financial records are available. Continue loading to review them.',
  more: 'More changes', progress: 'Still processing. This amount may still change.', historical: 'Earlier recorded change',
  coverageStarted: 'Historical preparation started', coverageCompleted: 'Historical preparation completed',
  coverageNote: "Each before and after amount is for that one change. It is not the student's balance now. Older amounts show only if the old record has them.",
  coverage: { updating: 'Earlier changes are still being prepared; this list may be incomplete.', ready: 'Available earlier changes are included.', failed: 'Earlier changes need Coach review; this list may be incomplete.' },
  sources: { payment: 'Personal payment', fundraiser: 'Fundraising credit' },
  meanings: { receipt: 'Payment received', obligation: 'Amount owed on this charge', applied: 'Used toward this charge', personalAvailable: 'Unused amount from this personal payment', fundraisingAvailable: 'Unused amount from this fundraising credit', grossRaised: 'Gross fundraiser proceeds', priority: 'Fee order position' },
  kinds: { charge: 'Charge recorded', payment: 'Personal payment', paymentCorrection: 'Payment receipt corrected', fundraisingCredit: 'Fundraising credit', allocation: 'Funds applied', release: 'Funds returned to available balance', chargeAdjustment: 'Charge adjusted', chargeCancellation: 'Charge canceled', payout: 'Personal refund recorded', transferOut: 'Funds transferred', awardReversal: 'Fundraising award reversed', fundraiserGross: 'Fundraiser proceeds recorded', feePriority: 'Fee order changed' },
} as const

export const financeWorkspaceCopy = {
  close: 'Close', accountDetails: 'Account details',
  description: 'Review student accounts, record payments and manage shared fees.',
  unavailable: 'This financial section is unavailable. Try loading it again.', retry: 'Try again',
  prepareHistory: 'Prepare historical changes', preparingHistory: 'Preparing historical changes…',
  accountRequested: 'Account preparation requested. Totals will update when verification finishes.',
  maintenance: 'Financial changes are paused while shared fees are maintained. Existing balances remain visible when verified.',
  maintenanceFailed: 'Shared fee maintenance needs Coach review. Open Fee priority order to review recovery before recording payments.',
  preparationStarted: 'Historical preparation requested. Coverage will update as recorded evidence is processed.',
  failed: 'The request could not be completed. Try again.',
} as const
