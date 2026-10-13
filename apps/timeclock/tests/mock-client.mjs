// Served only through Playwright route interception. Never imported by the app.
import React from '/node_modules/.vite/deps/react.js';
const { useSyncExternalStore } = React;
const now = Date.now();
const listeners = new Set();
let version = 0;
const students = [
  { studentId: 'student-a', displayName: 'Alex A.', subteam: null, collision: false },
  { studentId: 'student-b', displayName: 'Blair B.', subteam: null, collision: false },
  { studentId: 'student-c', displayName: 'Casey C.', subteam: 'Build', collision: true },
];
const event = { occurrenceId: 'occurrence-a', title: 'Synthetic build meeting', allDay: false, scheduledStart: now - 3600000, scheduledEnd: now + 3600000, effectiveEnd: now + 3600000, sessionId: 'session-a', state: 'open', available: true, revision: 1, needsReview: false };
const state = { authenticated: true, allowed: true, selected: null, revision: 0, statuses: {}, calls: [], failNext: false, stale: false, closed: false, conflict: false };
function emit() { version++; listeners.forEach(f => f()); }
function subscribe(f) { listeners.add(f); return () => listeners.delete(f); }
function watch() { useSyncExternalStore(subscribe, () => version); }
function name(ref) { return ref[Symbol.for('functionName')]; }
function read(ref, args) {
  switch (name(ref)) {
    case 'timeclock:previewGroup': return { ok: true, sessionRevision: event.revision, expected: args.studentIds.map(studentId => ({ studentId, intervalId: state.conflict ? 'other-interval' : state.statuses[studentId] === 'in' ? `interval-${studentId}` : null, sessionId: state.conflict ? 'other-session' : state.statuses[studentId] === 'in' ? 'session-a' : null })), conflicts: state.conflict ? args.studentIds.map(studentId => ({ studentId, sessionId: 'other-session', intervalId: 'other-interval' })) : [] };
    case 'timeclockRoster:operatorStatus': return { allowed: state.allowed, role: state.allowed ? 'mentor' : null };
    case 'timeclockRoster:list': return { students, unreviewedCount: 1 };
    case 'calendarState:status': return { configured: true, lastSuccessAt: now, lastAttemptAt: now, stale: state.stale, error: null };
    case 'timeclock:todayEvents': return [event, { ...event, occurrenceId: 'occurrence-b', sessionId: null, title: 'Synthetic all-day outreach', allDay: true, scheduledStart: null, scheduledEnd: null, effectiveEnd: null, state: 'unopened' }, { ...event, occurrenceId: 'occurrence-c', title: 'Finished synthetic meeting', state: 'closed', available: false }];
    case 'timeclock:consoleStatus': return { revision: state.revision, selectedSessionId: state.closed ? null : state.selected, session: state.selected && !state.closed ? { state: 'open', scheduledStart: event.scheduledStart, scheduledEnd: event.scheduledEnd, effectiveEnd: event.effectiveEnd, revision: event.revision } : null };
    case 'timeclockRoster:clockStatus': return { sessionId: args.sessionId, state: state.closed ? 'closed' : 'open', revision: event.revision, students: students.map(s => ({ studentId: s.studentId, status: state.statuses[s.studentId] || 'no_activity', activeSessionId: state.statuses[s.studentId] === 'in' ? args.sessionId : null, activeIntervalId: state.statuses[s.studentId] === 'in' ? `interval-${s.studentId}` : null, hasConflict: false })) };
    default: throw new Error(`Unmocked query ${name(ref)}`);
  }
}
const remembered = new Map();
async function mutate(ref, args) {
  const method = name(ref);
  state.calls.push({ method, args: { ...args, pin: args.pin ? '[entered]' : undefined } });
  if (args.key && remembered.has(args.key)) return remembered.get(args.key);
  let result;
  if (args.pin !== undefined && args.pin !== 'test-pin') return { ok: false, code: 'PIN_INVALID' };
  switch (method) {
    case 'timeclock:openOccurrence': result = { ok: true, sessionId: 'session-a' }; break;
    case 'timeclock:createUnscheduled': result = { ok: true, sessionId: 'session-a', occurrenceId: 'occurrence-a' }; break;
    case 'timeclock:selectConsole': state.selected = args.selectedSessionId || null; state.revision++; result = { ok: true, revision: state.revision, selectedSessionId: state.selected }; break;
    case 'timeclock:previewGroup': result = { ok: true, sessionRevision: event.revision, expected: args.studentIds.map(studentId => ({ studentId, intervalId: state.statuses[studentId] === 'in' ? `interval-${studentId}` : null, sessionId: state.statuses[studentId] === 'in' ? 'session-a' : null })), conflicts: [] }; break;
    case 'timeclock:clockGroup': args.expected.forEach(s => { state.statuses[s.studentId] = args.mode === 'out' ? 'out' : 'in'; }); state.conflict = false; result = { ok: true, count: args.expected.length, at: Date.now() }; break;
    case 'timeclock:clockOutAll': students.forEach(s => { if (state.statuses[s.studentId] === 'in') state.statuses[s.studentId] = 'out'; }); result = { ok: true, count: 1, at: Date.now() }; break;
    case 'timeclock:extend': event.effectiveEnd += args.halfHours * 1800000; event.revision++; result = { ok: true, effectiveEnd: event.effectiveEnd, extensionMs: event.effectiveEnd - event.scheduledEnd, revision: event.revision }; break;
    case 'timeclockPinControl:authorizeSignOutControl': result = { ok: true }; break;
    default: throw new Error(`Unmocked mutation ${method}`);
  }
  if (args.key) remembered.set(args.key, result);
  emit();
  if (state.failNext) { state.failNext = false; throw new Error('Synthetic response lost after commit'); }
  return result;
}
export function useQuery(ref, args) { watch(); return args === 'skip' ? undefined : read(ref, args); }
export function useMutation(ref) { return React.useCallback(args => mutate(ref, args), [name(ref)]); }
export function useAction(ref) { return useMutation(ref); }
export function useConvex() { return { query: async (ref, args) => read(ref, args), mutation: mutate }; }
export function useConvexAuth() { watch(); return { isAuthenticated: state.authenticated, isLoading: false }; }
export function useConvexConnectionState() { watch(); return { isWebSocketConnected: !state.offline, hasInflightRequests: false }; }
export class ConvexReactClient {}
export function ConvexAuthProvider({ children }) { return children; }
export function useAuthActions() { return { signIn: async () => { state.authenticated = true; emit(); }, signOut: async () => { state.authenticated = false; emit(); } }; }
window.__clockTest = { state, emit, close: () => { state.closed = true; emit(); } };
