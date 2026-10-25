import { ConvexError } from "convex/values";
import { env } from "../_generated/server";
import { tokenHash } from "./invitationIdentity";

/** The only backend that may ever accept developer sign-in. Production and any other deployment refuse it. */
export const DEVELOPER_SIGN_IN_CLOUD_URL = "https://third-bandicoot-18.convex.cloud";
/** Reserved for fictional developer accounts; `.invalid` can never receive mail or belong to a Google account. */
export const DEVELOPER_EMAIL_DOMAIN = "developer.example.invalid";
const MIN_KEY_LENGTH = 32;

export type DeveloperPersona = {
  id: "coach" | "mentor" | "travelLead" | "parent" | "parentStaff" | "student";
  label: string;
  name: string;
  description: string;
  role: "coach" | "mentor" | "parent" | "student";
  travelLead: boolean;
  financialEdit: boolean;
  healthExport: boolean;
  parentStaffAccess?: "mentor" | "travelLead";
};

export const DEVELOPER_PERSONAS: readonly DeveloperPersona[] = [
  { id: "coach", label: "Coach", name: "Dev Coach", description: "Full Coach access, including money and health exports.", role: "coach", travelLead: false, financialEdit: true, healthExport: true },
  { id: "mentor", label: "Mentor", name: "Dev Mentor", description: "Mentor without travel or money grants.", role: "mentor", travelLead: false, financialEdit: false, healthExport: false },
  { id: "travelLead", label: "Travel Lead", name: "Dev Travel Lead", description: "Mentor with Travel Lead access; no money-edit grant.", role: "mentor", travelLead: true, financialEdit: false, healthExport: false },
  { id: "parent", label: "Parent", name: "Dev Parent", description: "Parent linked to Dev Student.", role: "parent", travelLead: false, financialEdit: false, healthExport: false },
  { id: "parentStaff", label: "Parent with staff access", name: "Dev Parent Staff", description: "Parent linked to Dev Student who can switch to Mentor or Travel Lead.", role: "parent", travelLead: false, financialEdit: false, healthExport: false, parentStaffAccess: "travelLead" },
  { id: "student", label: "Student", name: "Dev Student", description: "Student in the active season, linked to both Dev Parents.", role: "student", travelLead: false, financialEdit: false, healthExport: false },
];

export const developerEmail = (persona: DeveloperPersona["id"]) => `${persona.toLowerCase()}@${DEVELOPER_EMAIL_DOMAIN}`;
export const isDeveloperEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${DEVELOPER_EMAIL_DOMAIN}`);
export const findPersona = (id: string) => DEVELOPER_PERSONAS.find(persona => persona.id === id) ?? null;

/** Every guard must pass; any missing or different value disables developer sign-in entirely. */
export function developerSignInEnabled() {
  return env.CONVEX_CLOUD_URL === DEVELOPER_SIGN_IN_CLOUD_URL
    && env.DEVELOPER_SIGN_IN_ENABLED === "true"
    && (env.DEVELOPER_SIGN_IN_KEY?.length ?? 0) >= MIN_KEY_LENGTH;
}

export async function developerKeyMatches(candidate: string) {
  const expected = env.DEVELOPER_SIGN_IN_KEY;
  if (!developerSignInEnabled() || !expected || candidate.length < MIN_KEY_LENGTH || candidate.length > 512) return false;
  return await tokenHash(candidate) === await tokenHash(expected);
}

/** Reserved-domain sessions stop working the moment any guard is removed. */
export function requireDeveloperAccountAllowed(email: string) {
  if (isDeveloperEmail(email) && !developerSignInEnabled()) throw new ConvexError("Developer sign-in is not available on this deployment.");
}
