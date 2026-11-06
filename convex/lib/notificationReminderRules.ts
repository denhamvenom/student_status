import type { MeetingMentor } from "./mentorMeetings";
import { chicagoParts, R2_HOUR } from "./reminderSchedule";

/**
 * Mentor reminder rules. M2 (evening before) rides on R1: same 6 PM Chicago pass and the same per-event dedupeKey, so a
 * Mentor who is also a Parent on the event gets one "Tomorrow" notice. M3 (invitation not answered) runs at 5 PM Chicago,
 * like R2, three days before the meeting, once per invitation.
 */
export const M3_HOUR = R2_HOUR;
export const M3_DAYS_BEFORE = 3;

export function mentorInviteReminderDue(nowMs: number): boolean {
  return chicagoParts(nowMs).hour === M3_HOUR;
}

/** M2: Mentors going to the meeting: accepted invitations, self sign-ups, and a Mentor creator who hasn't declined. */
export function remindsMentorTomorrow(mentor: MeetingMentor): boolean {
  return mentor.status === "accepted";
}
