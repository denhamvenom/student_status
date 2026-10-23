export const transportationOptions = ["Charter Bus", "School Bus", "Team Carpool", "Provide your Own"] as const;

export function teamTransportEnabled(event: { travel: string; transportEnabled?: boolean }): boolean {
  if (["provide your own", "families provide transportation", "none"].includes(event.travel.trim().toLowerCase())) return false;
  return event.transportEnabled ?? true;
}
