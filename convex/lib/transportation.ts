export const transportationOptions = ["Charter Bus", "School Bus", "Team Carpool", "Provide your Own"] as const;
// Stored values stay as above so existing events keep working; only the shown text differs.
const transportationLabels: Record<string, string> = { "Provide your Own": "Provide your Own Ride" };
export const transportationLabel = (travel: string) => transportationLabels[travel] ?? travel;

/** On-site events happen at the DSHS STEM Center: no destination, transport or overnight stay. */
export const onsiteLocation = "On site";
export const eventLocation = (event: { destination: string; onsite?: boolean }) => event.onsite ? onsiteLocation : event.destination;

export function teamTransportEnabled(event: { travel: string; transportEnabled?: boolean; onsite?: boolean }): boolean {
  if (event.onsite) return false;
  if (["provide your own", "families provide transportation", "none", "on site"].includes(event.travel.trim().toLowerCase())) return false;
  return event.transportEnabled ?? true;
}
