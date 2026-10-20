import { describe, it, expect } from 'vitest';
import { ConvexError } from 'convex/values';
import { savedPublicError, publicErrorResult } from './lib/publicErrors';
import { normalizeEmail, normalizePhone, normalizeChangedPhone } from './lib/contactValidation';
describe('public error boundaries', () => {
  it('retains explicit errors while keeping unexpected and legacy diagnostics private', async () => {
    const known = savedPublicError(new ConvexError('Reload the changed profile before saving.'));
    expect(publicErrorResult({job:{lastError:known},amount:42})).toEqual({job:{lastError:'Reload the changed profile before saving.'},amount:42});
    expect(publicErrorResult({lastError:savedPublicError(new Error('private internal detail'), 'Ask a Coach to retry.')})).toEqual({lastError:'Ask a Coach to retry.'});
    expect(publicErrorResult({lastError:'old private stack detail'}).lastError).not.toContain('private');
    expect((await publicErrorResult(Promise.resolve({lastError:known}))).lastError).toBe('Reload the changed profile before saving.');
  });
  it('exposes contact validation as deliberate Convex errors without changing legacy handling', () => {
    for (const validate of [()=>normalizeEmail('broken'),()=>normalizePhone('123')]) {
      try { validate(); throw new Error('Expected rejection'); } catch(error) {
        expect(error).toBeInstanceOf(ConvexError);
        expect((error as ConvexError<string>).data).toMatch(/enter a/);
      }
    }
    expect(normalizeChangedPhone('legacy','legacy')).toBe('legacy');
    expect(normalizePhone('')).toBe('');
  });
});
