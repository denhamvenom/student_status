import type { WhatsLeftKind } from './contract'

/*
 * Every Student Home string. Owner wording decisions of 2026-10-27 and docs/LANGUAGE.md apply:
 * sentence case, "signup" (noun) / "sign up" (verb), "Waiting for …" instead of Pending,
 * "Balance due" never "Balance" alone, no Tasks / To-do / Paid up / All clear.
 */

const plural = (count: number, one: string, many: string) => count === 1 ? one : many

export const homeCopy = {
  greeting: {
    hey: (name: string) => `Hey, ${name}`,
    phone: (date: string, name: string) => `${date} · Hey, ${name}`,
    needsAttention: (date: string) => `${date} — Here's what needs your attention`,
    allSet: (date: string) => `${date} — You're all set`,
  },

  hero: {
    region: 'Highlights',
    previous: 'Previous card',
    next: 'Next card',
    showCard: (position: number, count: number) => `Show card ${position} of ${count}`,
    slide: (position: number, count: number) => `${position} of ${count}`,
    empty: 'Nothing new from the team right now.',
  },

  room: {
    title: 'Room choice',
    closesOn: (day: string) => `Closes ${day}`,
    closesToday: 'Closes today',
    daysLeft: (days: number) => days <= 0 ? 'Last day' : `${days} ${plural(days, 'day', 'days')} left`,
    dateLine: (date: string, left: string) => `${date} · ${left}`,
    eventLine: (event: string, dates: string) => `${event} · ${dates}`,
    yourGroup: 'Your room group',
    notChosen: 'Not chosen yet',
    notChosenHint: 'Start a group, accept an invitation or ask to be assigned.',
    groupFallback: 'Your group',
    inGroup: (group: string, names: string[]) => names.length ? `${group}: ${names.join(', ')}` : group,
    assignmentRequested: 'Assignment requested',
    final: 'Final',
    invitations: 'Invitations',
    invitedYou: (name: string) => `${name} invited you`,
    waitingForReply: 'Waiting for your reply',
    noInvitations: 'No invitations yet',
    deadline: (date: string) => `No changes after the ${date} deadline`,
    choose: 'Choose your room',
  },

  announcement: {
    coach: 'Coach announcement',
    travelLead: 'Travel Lead announcement',
    showFull: 'Show full message',
  },

  countdown: {
    label: 'Countdown',
    unit: (unit: 'days' | 'hours', value: number) => unit === 'days' ? plural(value, 'day', 'days') : plural(value, 'hour', 'hours'),
    toKickoff: 'to kickoff',
    toEvent: (name: string) => `to ${name}`,
    now: 'Now',
    kickoff: 'Kickoff',
    target: (name: string, date: string) => `${name} · ${date}`,
    milestones: 'Upcoming milestones',
  },

  signups: {
    title: 'Open signups',
    closingSoon: (count: number) => `${count} closing soon`,
    open: (count: number) => `${count} open`,
    closes: (date: string) => `Closes ${date}`,
    starts: (date: string) => `Starts ${date}`,
    signUp: 'Sign up',
    signUpFor: (name: string) => `Sign up for ${name}`,
    showMore: 'Show more signups',
    allTitle: 'Open signups',
    empty: 'No open signups right now. New events show up here.',
  },

  signupSheet: {
    when: 'When',
    fee: 'Fee',
    noFee: 'No fee',
    spots: 'Spots',
    spotsLeft: (count: number) => `${count} ${plural(count, 'spot', 'spots')} left`,
    full: 'Full',
    whatHappens: 'What happens',
    outcome: {
      signedUp: "You're signed up when you press Sign up. The fee is added to Money.",
      signedUpNoFee: "You're signed up when you press Sign up.",
      waitingForApproval: "A Coach or Travel Lead reviews your signup. Any fee is charged when you're confirmed.",
      waitlisted: "You'll join the waitlist.",
      closed: 'Signup for this event has closed. Ask a Coach or Travel Lead if you still need to go.',
      // Only a Coach can change signups on an assigned event (participation.setParticipation).
      assigned: 'A Coach assigns students to this event, so it has no signup. Ask a Coach if you still need to go.',
    },
    signUp: 'Sign up',
    signingUp: 'Signing up…',
    loading: 'Loading…',
    loadFailed: 'Signup details could not load. Close this and try again. If it keeps happening, contact a Coach.',
    failed: "Your signup didn't go through. Try again. If it keeps happening, contact a Coach.",
    result: {
      confirmed: "You're signed up.",
      waitlist: "You're waitlisted.",
      pending: 'Your signup is waiting for Coach or Travel Lead approval.',
    },
    done: 'Done',
  },

  whatsLeft: {
    title: "What's left",
    overdue: 'Overdue',
    dueSoon: (count: number) => `${count} due soon`,
    allSet: "You're all set",
    due: (date: string) => `Due ${date}`,
    leftForYou: (count: number) => `${count} left for you`,
    nothingForYou: 'Nothing for you right now',
    showAll: 'Show all',
    groups: {
      student: 'For you',
      parent: 'Waiting for your parent',
      coach: 'Waiting for Coach approval',
      coachOrTravelLead: 'Waiting for Coach or Travel Lead approval',
    },
    emptySheet: "Nothing left. You're all set.",
    kinds: {
      inviteParent: 'Invite a parent',
      studentSetup: 'Finish your setup',
      healthProfile: 'Health information',
      firstRegistration: 'FIRST registration',
      firstVerification: 'FIRST registration',
      requiredPayment: 'Balance due',
      permissionForm: 'Permission form',
      permissionReview: 'Permission form',
      roomChoice: 'Choose your room',
      requirement: 'Event requirement',
      signupApproval: 'Your signup',
      staffReview: 'Event records',
    } satisfies Record<WhatsLeftKind, string>,
  },

  balance: {
    label: 'Balance due',
    parentReview: 'Your parent needs to review the payment due.',
    fundraise: 'Fundraise',
    allSet: "You're all set",
    available: (amount: string) => `Available funds ${amount}`,
    updating: 'Money is updating. Check back in a few minutes.',
    failed: 'Balance due could not load. Try again. If it keeps happening, contact a Coach.',
  },

  participation: {
    title: 'Participation',
    meetings: 'Meetings',
    outreach: 'Outreach',
    buildHours: 'Build hours',
    percent: (value: number) => `${value}%`,
    attended: (attended: number, held: number) => `${attended} / ${held} attended`,
    noMeetings: 'No meetings yet',
    ofEvents: (held: number) => `of ${held} ${plural(held, 'event', 'events')}`,
    hours: (value: string) => `${value}h`,
    ofTarget: (target: number) => `of ${target} target`,
    sinceKickoff: 'since kickoff',
    startsAtKickoff: 'Starts at kickoff',
    updating: 'Updating',
    unavailable: 'Participation shows here once meetings start.',
    ringsLabel: (meetings: string, outreach: string, build: string) => `Meetings ${meetings}. Outreach ${outreach}. Build hours ${build}.`,
  },

  states: {
    loading: (title: string) => `Loading ${title}…`,
    tileFailed: (title: string) => `${title} could not load. Try again. If it keeps happening, contact a Coach.`,
    tryAgain: 'Try again',
  },
} as const
