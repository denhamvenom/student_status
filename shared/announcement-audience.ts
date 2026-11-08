/** Who an announcement reaches. The backend enforces it and the staff form mirrors it, so both import this one rule. */
export type Audience = 'students' | 'parents' | 'both' | 'staff' | 'everyone'
export type AudienceDestination = 'students' | 'parents' | 'staff'

/** Both = Students + Parents; Everyone = Students + Parents + staff (Coaches, Mentors, Travel Leads, Parents with staff access). */
export const reaches = (audience: Audience, destination: AudienceDestination) => audience === 'everyone' || audience === destination || audience === 'both' && destination !== 'staff'

/** Anything reaching Parents is Coach-only; Travel Leads may post to Students or staff. */
export const coachOnly = (audience: Audience) => reaches(audience, 'parents')
