import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { isCoachOrTravelLead, requireCoachOrTravelLead } from "./access";

describe("Coach or Travel Lead staff rule", () => {
  it.each([
    { role: "coach", travelLead: false, allowed: true },
    { role: "mentor", travelLead: true, allowed: true },
    { role: "mentor", travelLead: false, allowed: false },
    { role: "parent", travelLead: true, allowed: false },
    { role: "student", travelLead: true, allowed: false },
  ] as const)("$role with travelLead=$travelLead -> allowed=$allowed", ({ role, travelLead, allowed }) => {
    expect(isCoachOrTravelLead({ role, travelLead })).toBe(allowed);
    if (allowed) expect(() => requireCoachOrTravelLead({ role, travelLead })).not.toThrow();
    else expect(() => requireCoachOrTravelLead({ role, travelLead })).toThrow(ConvexError);
  });
});
