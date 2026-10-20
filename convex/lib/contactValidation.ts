import { ConvexError } from 'convex/values';
import * as rules from '../../shared/contact-format';
function validate(run: () => string): string {
  try { return run(); } catch (error) {
    if (error instanceof Error && error.constructor === Error) throw new ConvexError(error.message);
    throw error;
  }
}
export function normalizePhone(...args: Parameters<typeof rules.normalizePhone>) { return validate(() => rules.normalizePhone(...args)); }
export function normalizeEmail(...args: Parameters<typeof rules.normalizeEmail>) { return validate(() => rules.normalizeEmail(...args)); }
export function normalizeChangedPhone(...args: Parameters<typeof rules.normalizeChangedPhone>) { return validate(() => rules.normalizeChangedPhone(...args)); }
export function normalizeChangedEmail(...args: Parameters<typeof rules.normalizeChangedEmail>) { return validate(() => rules.normalizeChangedEmail(...args)); }
