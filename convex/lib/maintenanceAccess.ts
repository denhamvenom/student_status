import { env } from '../_generated/server';

/** Temporary operator-controlled closure during a reviewed production changeover. */
export function requireMaintenanceAccess(email: string) {
  const allowed = env.SIGN_IN_MAINTENANCE_COACH_EMAIL;
  if (allowed !== undefined && email.trim().toLowerCase() !== allowed.trim().toLowerCase()) {
    throw new Error('Sign-in is temporarily closed for maintenance. Please try again later.');
  }
}
