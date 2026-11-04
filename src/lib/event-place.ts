import { eventLocation as storedLocation, onsiteLocation, transportationLabel as storedTransportationLabel } from '../../convex/lib/transportation'

// On-site events store "On site" as their destination and travel; families read these plainer words instead.
export const onsitePlace = 'DSHS STEM Center (on site)'
export const onsiteTravel = 'No team ride – families drop off at DSHS STEM Center'
/** Virtual events meet in the team Discord; no link is shown in the app. */
export const virtualPlace = 'Virtual (Discord)'

/** Where the event happens, in family-facing words. Stored values are unchanged. */
export const eventLocation = (event: { destination: string; onsite?: boolean; locationType?: string }) => event.locationType === 'virtual' ? virtualPlace : event.onsite ? onsitePlace : storedLocation(event)

/** Virtual events have no ride, room or overnight stay to plan. */
export const hasTravel = (event: { onsite?: boolean; locationType?: string }) => !event.onsite && event.locationType !== 'virtual'

/** How students get there, in family-facing words. Stored values are unchanged. */
export const transportationLabel = (travel: string) => travel === onsiteLocation ? onsiteTravel : storedTransportationLabel(travel)
