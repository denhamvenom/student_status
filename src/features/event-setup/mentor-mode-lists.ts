// The lists the New event wizard reads in Mentor mode: the Mentors to invite, and the Mentor's students when the meeting is
// for specific students. Read with useQueries so a refusal (for example the Mentor list while it is closed to Mentors) is a
// value instead of a thrown error.
import { useMemo } from 'react'
import { useQueries } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * The query set must be memoized: convex/react's useQueries re-subscribes, with a state update during render, whenever it
 * gets a new object. An inline object literal is new on every render, so the wizard re-rendered forever and React stopped
 * it with "Too many re-renders" (Create a meeting crashed, Nov 2026). Staff mode reads nothing here.
 */
export function useMentorModeLists(mentor: boolean, withStudents: boolean): Record<string, unknown> {
  const queries = useMemo(() => mentor
    ? { mentors: { query: api.studentSubteams.listMentorsForInvite, args: {} }, ...(withStudents ? { students: { query: api.app.mentorReport, args: {} } } : {}) }
    : {}, [mentor, withStudents])
  return useQueries(queries)
}
