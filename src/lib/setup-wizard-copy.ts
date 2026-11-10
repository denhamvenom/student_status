import { subteamOptions } from './subteams'

export const setupWizardCopy = {
  loading: 'Loading setup…', unavailable: 'Setup is unavailable. Try again or contact a Coach.',
  parentTitle: 'Complete student information', studentTitle: 'Set up your profile',
  // Health information is four short steps, one topic each (Allergies, Medications, Health insurance, Physician).
  parentSteps: ['Student details', 'Contacts', 'Allergies', 'Medications', 'Health insurance', 'Physician', 'FIRST registration', 'Review'],
  studentSteps: ['About you', 'Team details', 'Parent connection & FIRST', 'Review'],
  back: 'Back', continue: 'Save and continue', later: 'Finish later', savesEachStep: 'Your answers save after each step.',
  review: 'Check your answers. Choose Edit to change anything.', edit: 'Edit', saveConfirm: 'Save and confirm',
  laterNote: "Finish later takes you to Home. Finish setup there picks up where you stopped.", finish: 'Finish setup', saveProfile: 'Save profile', editProfile: 'Edit profile', home: 'Go to Home',
  saving: 'Saving…', saved: 'Saved', reload: 'Reload latest information', changed: 'This information was changed somewhere else. Reload to see the latest, then try again.',
  saveFailed: 'We could not confirm that this step saved. Your answers are still here. Try again; if it keeps failing, contact a Coach.',
  teamCoachNote: 'Ask a Coach to change your subteam or Travel Team.',
  roomingCorrectionNote: 'To change your room type, use Request a correction on your Profile.',
  shirt: 'Shirt size',
  travelTeamHelp: 'The Travel Team is chosen by mentors and Coaches through an application. Travel Team students go to all out-of-state events and our local event.',
  healthSection: 'Health information',
  medicalNote: 'Your health answers save when you finish the Physician step.',
  healthChoose: 'Choose an answer to continue.',
  health: {
    allergies: { title: 'Allergies', question: (name: string) => `Does ${name} have any allergies?`, none: 'No allergies', add: 'Yes, add details' },
    prescriptions: { title: 'Medications', question: (name: string) => `Does ${name} take any medications?`, none: 'No medications', add: 'Yes, add details' },
    insurance: { title: 'Health insurance', question: (name: string) => `Can you share ${name}'s health insurance?`, none: 'No insurance', add: 'Yes, add details', unknown: "I don't know" },
    physician: { title: 'Physician', question: (name: string) => `Can you share ${name}'s physician?`, none: 'No physician', add: 'Yes, add details', unknown: "I don't know" },
  },
  correctionLink: "Something wrong that you can't change here?",
  contactsParentHeading: (student: string) => `Parent or guardian on ${student}'s profile`,
  contactsParentNote: "This is the parent or guardian contact kept on the student's profile and the permission form. It can be a different person or email than the account you signed in with.",
  accountEmail: 'Signed-in account',
  accountEmailNote: (email: string) => `You are signed in as ${email}. This email is not the contact above. To change the contact, edit it here. To change the email you sign in with, ask a Coach.`,
  firstTitle: 'FIRST registration and Consent & Release',
  consentReleaseExplanation: "FIRST's yearly form that a parent signs on the FIRST website.",
  firstAdultGuide: 'Use the team invitation to register with FIRST and sign this season\'s Consent & Release. Your Coach checks both.',
  firstMinorStudent: 'Your parent completes FIRST registration.',
  firstUnavailable: "Waiting for the Coach to send the FIRST invitation link. You'll see it here when it's ready.",
  firstReportWaiting: 'You can report that you are done once the invitation link is available.',
  firstOfficial: 'Read FIRST youth-registration instructions', firstOpen: 'Open FIRST team invitation', firstCopy: 'Copy invitation link', firstCopied: 'Link copied',
  firstReport: "I've done both in FIRST", firstAwaiting: 'Waiting for Coach approval', firstCoachConfirm: 'Your Coach will confirm it.', firstVerified: 'Verified for this season', firstNeeds: 'Needs completion',
  firstReopened: 'Your Coach reopened this. Check both in FIRST, then report again.',
  reloadFirst: 'Reload FIRST status',
  studentDone: 'Your setup is saved. Parent information and Coach verification may still be needed before Competition readiness is clear.',
  parentEarlierComplete: 'Student details, contacts and health information are already complete. Use Back to review them.',
  parentDone: (status: string) => `Saved. FIRST registration: ${status}.`,
  firstChecking: 'Checking status', firstUnknown: 'Status unavailable',
  shirtSizes: ['XS','S','M','L','XL','2XL','3XL'] as const,
  subteams: subteamOptions,
} as const

/** Step numbers in the Parent wizard (see parentSteps). */
export const PARENT_STEP = { details: 0, contacts: 1, allergies: 2, medications: 3, insurance: 4, physician: 5, first: 6, review: 7 } as const

export type HealthTopic = 'allergies' | 'prescriptions' | 'insurance' | 'physician'
const HEALTH_TOPICS: readonly HealthTopic[] = ['allergies', 'prescriptions', 'insurance', 'physician']
/** The health topic a Parent wizard step asks about, or null for any other step. */
export const healthTopicAt = (step: number): HealthTopic | null => step >= PARENT_STEP.allergies && step <= PARENT_STEP.physician ? HEALTH_TOPICS[step - PARENT_STEP.allergies] : null
