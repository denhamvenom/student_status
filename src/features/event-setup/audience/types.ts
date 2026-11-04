// Shared shapes for the event audience, mentor invite, location and repeat pickers.
// Prop-driven only: no Convex imports, so these can be wired to the backend later.

export type AudienceKind = 'everyone' | 'subteams' | 'students' | 'mentors'

/** Who an event is for. `required` means everyone in the group is signed up automatically. */
export type AudienceValue = {
  kind: AudienceKind
  subteams: string[]
  studentIds: string[]
  required: boolean
}

export type StudentOption = { id: string; name: string; subteam: string }
export type MentorOption = { id: string; name: string; subteams: string[] }

export type MentorInviteValue = {
  mentorIds: string[]
  /** Only applies when the audience is Subteams. */
  includeSubteamMentors: boolean
}

export type LocationType = 'inPerson' | 'virtual'

/** The one Where question: our shop, somewhere else (destination and travel), or Virtual (Discord). */
export type Where = 'shop' | 'elsewhere' | 'virtual'

/** Event setup sections that do not apply to a virtual (Discord) event. */
export type InPersonSection = 'transport' | 'rooming' | 'overnight' | 'travel'

/** 0 = Sunday … 6 = Saturday, matching Date#getUTCDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type RepeatEnd = 'onDate' | 'afterCount'

export type RepeatValue = {
  repeats: boolean
  /** Every N weeks, 1 to 8. */
  intervalWeeks: number
  weekdays: Weekday[]
  ends: RepeatEnd
  /** YYYY-MM-DD, used when `ends` is 'onDate'. */
  endDate: string
  /** Number of meetings, used when `ends` is 'afterCount'. */
  count: number
}

export type SeriesScope = 'this' | 'thisAndFuture'
export type SeriesScopeMode = 'edit' | 'cancel'

/** A problem with a picker's value; `field` is the id suffix to focus. */
export type PickerIssue = { field: string; message: string }
