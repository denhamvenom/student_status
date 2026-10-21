import { describe, expect, it } from 'vitest';
import { eventQueryTime, eventAvailableAt, calendarStaleAt } from '../apps/timeclock/src/eventClock';

describe('Timeclock stable live-query clock', () => {
  it('reduces 240 different query arguments to one during a quiet hour', () => {
    const start = Date.parse('2026-10-21T15:00:00Z');
    const ticks = Array.from({length: 240}, (_, i) => start + i * 15000);
    expect(new Set(ticks).size).toBe(240);
    expect(new Set(ticks.map(eventQueryTime)).size).toBe(1);
  });
  it('changes the day anchor at Chicago midnight, including DST days', () => {
    for (const midnight of ['2026-10-22T05:00:00Z','2026-11-02T06:00:00Z','2027-03-15T05:00:00Z']) {
      const at = Date.parse(midnight);
      expect(eventQueryTime(at)).toBe(at);
      expect(eventQueryTime(at - 1)).not.toBe(at);
    }
  });
  it('expires buttons and stale-calendar status locally while preserving cancellation and closure', () => {
    const event = { available: true, state: 'unopened', allDay: false, scheduledEnd: 1000, effectiveEnd: null };
    expect(eventAvailableAt(event, 999)).toBe(true);
    expect(eventAvailableAt(event, 1000)).toBe(false);
    expect(eventAvailableAt({...event, allDay: true}, 1000)).toBe(true);
    expect(eventAvailableAt({...event, available: false}, 999)).toBe(false);
    expect(eventAvailableAt({...event, state: 'closed'}, 999)).toBe(false);
    expect(eventAvailableAt({...event, state: 'open', effectiveEnd: 2000}, 1999)).toBe(true);
    expect(eventAvailableAt({...event, state: 'open', effectiveEnd: 2000}, 2000)).toBe(false);
    const calendar = { configured: true, error: null, lastSuccessAt: 1000 };
    expect(calendarStaleAt(calendar, 181000)).toBe(false);
    expect(calendarStaleAt(calendar, 181001)).toBe(true);
    expect(calendarStaleAt({...calendar, lastSuccessAt: 181001}, 181001)).toBe(false);
  });
});
