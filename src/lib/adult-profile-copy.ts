export const adultProfileCopy = {
  title: 'Profile',
  mentor: 'Mentor', travelLead: 'Travel Lead',
  setup: 'Add your shirt size to finish setting up.',
  about: 'About you', name: 'Name', phone: 'Phone', googleAccount: 'Google account', shirt: 'Shirt size (adult)',
  driving: 'Driving', canDrive: 'I can drive students', vehicle: 'Vehicle', passengerSeats: 'Passenger seats (not counting you)', tow: 'I can tow the team trailer',
  drivingNote: 'Adds you to the Drivers list. A Coach or Travel Lead assigns drivers to each event.',
  awaitingApproval: 'Your driving details are awaiting Coach or Travel Lead approval before event assignment.',
  coachReview: 'A driver record already uses your Google email. Ask a Coach to reconcile it before this profile can add driving details. You can still save the other fields.',
  capacityReview: 'The current season driver list needs Coach review before this profile can add driving details. You can still save the other fields.',
  seasonUnavailable: 'Driving details need an active season. You can still save the other fields.',
  emergency: 'Emergency contact (optional)', relationship: 'Relationship',
  save: 'Save profile', saving: 'Saving…', saved: 'Profile saved.', savedNeedsReview: 'Personal profile saved. Ask a Coach to reconcile your driver record before driving details can be added.',
  loading: 'Loading your profile…', failed: 'Profile could not be saved.',
  sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
} as const

export const driverReconciliationCopy = {
  title: 'Driver ownership review',
  description: "Link a driver to a Mentor when the driver's email matches one Mentor's Google email. Check other cases by hand.",
  empty: 'No matching unowned drivers are ready to link.',
  loading: 'Loading driver reconciliation...',
  failed: 'The driver could not be linked.',
  matchingMentor: 'Matching Mentor',
  linkNote: 'Linking preserves the driver record and requires fresh approval before event assignment.',
  stale: 'Driver or Mentor details changed. Review the current match before linking.',
  reason: 'Reason for linking', review: 'Review current match',
  linking: 'Linking...', link: 'Link driver to Mentor',
} as const
