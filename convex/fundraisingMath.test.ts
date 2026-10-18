import { describe, expect, it } from "vitest";
import { fundraisingCapabilities, fundraisingSplit } from "./lib/fundraisingMath";

describe("fundraiser exact money policy", () => {
  it("floors the student credit and conserves the team's remainder even at the safe integer boundary", () => {
    expect(fundraisingSplit(29, 3333, 6667)).toEqual({ grossCents: 29, travelCreditCents: 9, teamCents: 20 });
    for (const gross of [0, 1, 999999, Number.MAX_SAFE_INTEGER]) {
      const result = fundraisingSplit(gross, 3333, 6667);
      expect(result.travelCreditCents + result.teamCents).toBe(gross);
      expect(BigInt(result.travelCreditCents)).toBe(BigInt(gross) * 3333n / 10000n);
    }
    expect(fundraisingSplit(29, 0, 10000)).toEqual({ grossCents: 29, travelCreditCents: 0, teamCents: 29 });
    expect(() => fundraisingSplit(0.5, 5000, 5000)).toThrow("exact cents");
  });
  it("reserves creation and policy changes for Coach while allowing granted Travel Lead posting", () => {
    expect(fundraisingCapabilities({ role: "mentor", travelLead: true, financialEdit: true })).toEqual({ canCreate: false, canChangePolicy: false, canPost: true });
    expect(fundraisingCapabilities({ role: "parent", travelLead: true, financialEdit: true }).canPost).toBe(false);
    expect(fundraisingCapabilities({ role: "mentor", travelLead: true, financialEdit: false }).canPost).toBe(false);
  });
});
