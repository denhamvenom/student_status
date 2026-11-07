import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { MentorSchedule } from '../mentor-home/MentorSchedule'

/**
 * Schedule (/invited) for Mentors and Travel Leads (a Travel Lead is a Mentor too): Going, Join and Created by me. Invitations
 * are answered from Going (Needs your answer) or on the event page.
 */
export function MentorInvitedEvents({ travelLead = false }: { travelLead?: boolean }) {
  return <MentorSchedule createHint={travelLead ? mentorHomeCopy.schedule.createHint.travelLead : mentorHomeCopy.schedule.createHint.mentor} />
}
