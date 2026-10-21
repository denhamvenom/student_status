import { ConvexError } from 'convex/values';
const prefix = 'User message: ';
const recovery = 'Processing stopped. Ask a Coach to review the current status before retrying.';
/** Only explicitly public application errors may be saved as user-facing diagnostics. */
export function savedPublicError(error: unknown, fallback = recovery): string {
  const data = error instanceof ConvexError ? error.data : null;
  const message = typeof data === 'string' ? data : data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' ? data.message : fallback;
  return prefix + message.slice(0, 500);
}
export function publicErrorMessage(value: string | null | undefined): string | null {
  return value == null ? null : value.startsWith(prefix) ? value.slice(prefix.length) : recovery;
}
/** Do not expose old unclassified worker diagnostics, even when returning a whole job document. */
export function publicErrorResult<T>(value: T): T {
  if (value instanceof Promise) return value.then(result => publicErrorResult(result)) as T;
  if (Array.isArray(value)) return value.map(item => publicErrorResult(item)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      key === 'lastError' && typeof item === 'string' ? item.startsWith(prefix) ? item.slice(prefix.length) : recovery : publicErrorResult(item)
    ])) as T;
  }
  return value;
}
