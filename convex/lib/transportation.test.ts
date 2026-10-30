import { describe, expect, it } from "vitest";
import { eventLocation, teamTransportEnabled, transportationLabel } from "./transportation";

describe("transportation display", () => {
  it.each([
    ["Provide your Own", "Provide your Own Ride"],
    ["Charter Bus", "Charter Bus"],
    ["Team Carpool", "Team Carpool"],
    ["Families provide transportation", "Families provide transportation"],
  ])("shows %s as %s", (stored, shown) => expect(transportationLabel(stored)).toBe(shown));

  it("keeps the stored own-ride value turning team transport off", () => {
    expect(teamTransportEnabled({ travel: "Provide your Own" })).toBe(false);
    expect(teamTransportEnabled({ travel: "Charter Bus", onsite: true })).toBe(false);
  });

  it("shows On site in place of an on-site event's location", () => {
    expect(eventLocation({ destination: "Calendar room 12", onsite: true })).toBe("On site");
    expect(eventLocation({ destination: "Example arena" })).toBe("Example arena");
  });
});
