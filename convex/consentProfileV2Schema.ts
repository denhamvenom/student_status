import { v, type Infer } from "convex/values";

const state = v.union(v.literal("none"), v.literal("reported"));
const availability = v.union(v.literal("provided"), v.literal("none"), v.literal("unavailable"));
export const consentProfileV2Validator = v.object({
  grade: v.string(), dateOfBirth: v.string(),
  guardian: v.object({ name: v.string(), relationship: v.string(), phone: v.string(), email: v.string() }),
  emergency: v.object({ name: v.string(), relationship: v.string(), phone: v.string() }),
  allergies: v.object({ state, entries: v.array(v.object({ allergen: v.string(), severity: v.string(), reaction: v.string(), response: v.string() })) }),
  prescriptions: v.object({ state, entries: v.array(v.object({ name: v.string(), dose: v.string(), timing: v.string(), reason: v.string(), carriedBy: v.string() })) }),
  insurance: v.object({ state: availability, provider: v.union(v.string(), v.null()), policy: v.union(v.string(), v.null()) }),
  physician: v.object({ state: availability, name: v.union(v.string(), v.null()), phone: v.union(v.string(), v.null()) }),
});
export type ConsentProfileV2 = Infer<typeof consentProfileV2Validator>;
