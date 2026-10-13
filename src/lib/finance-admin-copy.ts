export const financeAdminCopy = {
  title: 'Student accounts', student: 'Student', charged: 'Charged', paid: 'Paid', credits: 'Credits', balance: 'Balance', travel: 'Travel acct.',
  explanation: 'Paid is personal money applied to charges. Credits are fundraising money applied. Travel acct is available fundraising credit; unused personal payments appear in account details.',
  loading: 'Loading student accounts...', empty: 'No active student accounts in this season.',
  continuing: 'More student records are available. Continue loading to review them.', more: 'More students', loadingMore: 'Loading more students...', unavailable: 'Unavailable',
  updating: 'Account totals are updating.', failed: 'Account totals need Coach review.', uninitialized: 'Account totals need preparation.',
  prepare: 'Prepare account', preparing: 'Preparing...', prepareFor: (name: string) => `Prepare account for ${name}`,
  details: 'Account details', record: 'Record', updated: 'Updated',
  viewAccount: (name: string) => `Open account for ${name}`,
  recordFor: (name: string) => `Record payment for ${name}`,
} as const

export const financeChangesCopy = {
  title: 'Recent changes', when: 'When', student: 'Student', change: 'Change', amounts: 'Previous → updated', actor: 'By · reason',
  team: 'Team', other: 'Financial change', unavailable: 'Not recorded', loading: 'Loading financial changes...',
  empty: 'No financial changes are available in the current coverage.', continuing: 'More financial records are available. Continue loading to review them.',
  more: 'More changes', progress: 'Partial progress recorded; this entry is not a completion receipt.', historical: 'Historical evidence',
  coverageStarted: 'Historical preparation started', coverageCompleted: 'Historical preparation completed',
  coverageNote: 'Amounts describe the recorded change and its stated scope, not a current account balance. Historical values are shown only where supported by recorded evidence.',
  coverage: { updating: 'Historical change coverage is updating.', ready: 'Available historical evidence has been prepared.', failed: 'Historical change coverage needs Coach review.' },
  sources: { payment: 'Personal payment', fundraiser: 'Fundraising credit' },
  meanings: { receipt: 'Recorded receipt', obligation: 'Charge obligation', applied: 'Applied to this charge', personalAvailable: 'Available in this personal-payment source', fundraisingAvailable: 'Available in this fundraising source', grossRaised: 'Student fundraiser gross proceeds', priority: 'Fee priority' },
  kinds: { charge: 'Charge recorded', payment: 'Personal payment', paymentCorrection: 'Payment receipt corrected', fundraisingCredit: 'Fundraising credit', allocation: 'Funds applied', release: 'Applied funds released', chargeAdjustment: 'Charge adjusted', chargeCancellation: 'Charge cancelled', payout: 'Personal refund recorded', transferOut: 'Funds transferred', awardReversal: 'Fundraising award reversed', fundraiserGross: 'Fundraiser proceeds recorded', feePriority: 'Fee priority changed' },
} as const

export const financeWorkspaceCopy = {
  close: 'Close', accountDetails: 'Account details',
  description: 'Review student accounts, record payments and manage shared fees.',
  unavailable: 'This financial section is unavailable. Try loading it again.', retry: 'Try again',
  prepareHistory: 'Prepare historical changes', preparingHistory: 'Preparing historical changes...',
  accountRequested: 'Account preparation requested. Totals will update when verification finishes.',
  maintenance: 'Financial changes are paused while shared fees are maintained. Existing balances remain visible when verified.',
  maintenanceFailed: 'Shared fee maintenance needs Coach review. Open Fee priority order to review recovery before recording payments.',
  preparationStarted: 'Historical preparation requested. Coverage will update as recorded evidence is processed.',
  failed: 'The request could not be completed. Try again.',
} as const
