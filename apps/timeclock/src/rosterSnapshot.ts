import { eventQueryTime } from './eventClock';

/** A selected event owns its snapshot across Chicago midnight. */
export function rosterSnapshotScope(sessionId: string | null, now: number) {
  return sessionId ? `event:${sessionId}` : `day:${eventQueryTime(now)}`;
}

/** Memory-only requests: switching scopes fences late responses from earlier events. */
export function createRosterSnapshot<T>(fetch: () => Promise<T>) {
  let generation = 0;
  let state: { scope: string; data?: T; error: boolean; pending: boolean } = { scope: '', error: false, pending: false };
  let idleCache: typeof state | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel: () => { generation++; },
    async load(scope: string) {
      if (state.scope === scope && state.pending) return;
      const request = ++generation;
      if (idleCache?.scope === scope) { publish(idleCache); return; }
      publish({ scope, error: false, pending: true });
      try {
        const data = await fetch();
        if (request === generation) {
          const ready = { scope, data, error: false, pending: false };
          if (scope.startsWith('day:')) idleCache = ready;
          publish(ready);
        }
      } catch {
        if (request === generation) publish({ scope, error: true, pending: false });
      }
    },
  };
}
