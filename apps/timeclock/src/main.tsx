import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { ConvexReactClient, useConvex, useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { ThemeProvider, useTheme } from "next-themes";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import "./theme.css";
import "./style.css";

type SessionId = Id<"timeclockSessions">;
type StudentId = Id<"students">;
type EventRow = FunctionReturnType<typeof api.timeclock.todayEvents>[number];
type Preview = Extract<FunctionReturnType<typeof api.timeclock.previewGroup>, { ok: true }>;
type ClockRequest = { sessionId: SessionId; mode: "in" | "out"; preview: Preview; transfer: boolean };
type Retry = { label: string; execute: () => Promise<void> };
const newKey = () => crypto.randomUUID();
const time = (n: number | null) => n === null ? "To be set" : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(n);
const dateTime = (n: number | null) => n === null ? "Never" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(n);
const errors: Record<string, string> = {
  EXPIRED: "This event has ended. Choose another event.", FINISHED: "This event has finished.", UNAVAILABLE: "This event is unavailable.",
  STALE_SESSION: "The event changed. Review its current status and try again.", STALE_STUDENT: "A student's clock status changed. Review the roster and try again.", STALE_CONSOLE: "Another tab changed this console. Review its current event and try again.",
  TRANSFER_REQUIRED: "A student is clocked into another event. Review and confirm a transfer.", TRANSFER_CONFLICT: "A selected student is already in this event.", ALREADY_IN: "A selected student is already clocked in.", NOT_IN_EVENT: "A selected student is not in this event.",
  PIN_REQUIRED: "Enter the operator PIN.", PIN_INVALID: "That PIN was not accepted.", PIN_RATE_LIMITED: "Too many PIN attempts. Wait before trying again.", PIN_UNCONFIGURED: "The operator PIN is not configured. Contact the Coach.",
  EVENT_CAPACITY: "This event has reached its clock-in capacity.", GROUP_TOO_LARGE: "Select fewer students.", INVALID_GROUP: "Review the selected students.", EXTENSION_LIMIT: "The extension exceeds the limit.", INVALID_WINDOW: "Choose a valid time or duration.", KEY_REUSED: "This request changed. Start a new action."
};
const errorText = (code?: string) => errors[code ?? ""] ?? `The action could not finish (${code ?? "unknown"}). Review the current state and try again.`;

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  return now;
}
function useProfileId() {
  const [id, setId] = useState<string | null>(null);
  const [warning, setWarning] = useState("");
  useEffect(() => {
    let active = true;
    const storageKey = `timeclock:profile:${import.meta.env.VITE_CONVEX_URL}`;
    const create = () => {
      const existing = localStorage.getItem(storageKey);
      if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing;
      const next = crypto.randomUUID();
      localStorage.setItem(storageKey, next);
      return next;
    };
    void (async () => {
      try {
        if (!navigator.locks) throw new Error("Web Locks unavailable");
        const value = await navigator.locks.request(storageKey, create);
        if (active) setId(value);
      } catch { if (active) setWarning("Browser storage or tab coordination is unavailable. Enable it to share event selection across tabs."); }
    })();
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey && event.newValue && /^[A-Za-z0-9_-]{16,128}$/.test(event.newValue)) setId(event.newValue); };
    addEventListener("storage", onStorage);
    return () => { active = false; removeEventListener("storage", onStorage); };
  }, []);
  return { id, warning };
}
function Button({ children, onClick, disabled, primary, danger, pressed }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; pressed?: boolean }) {
  return <button type="button" className={`tc-button ${primary ? "tc-button-primary" : ""} ${danger ? "tc-button-danger" : ""}`} aria-pressed={pressed} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Dialog({ title, children, close, feedback }: { title: string; children: React.ReactNode; close: () => void; feedback?: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    const trigger = document.activeElement;
    node?.showModal();
    return () => { node?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={ref} className="tc-dialog" aria-label={title} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={event => { event.preventDefault(); close(); }}><h2>{title}</h2>{children}{feedback}</dialog>;
}
function Pin({ value, change }: { value: string; change: (value: string) => void }) {
  return <label className="tc-label">Operator PIN<input className="tc-input" type="password" inputMode="numeric" autoComplete="off" value={value} onChange={e => change(e.target.value)} /></label>;
}
function Access() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const status = useQuery(api.timeclockRoster.operatorStatus, isAuthenticated ? {} : "skip");
  const [error, setError] = useState("");
  if (isLoading) return <section className="tc-panel">Checking sign-in…</section>;
  if (!isAuthenticated) return <section className="tc-panel"><h2>Operator sign-in</h2><p>Sign in with an approved Coach or Mentor Google account.</p><Button primary onClick={() => { setError(""); void signIn("google", { redirectTo: `${location.origin}/` }).catch(() => setError("Sign-in could not start. Please try again.")); }}>Sign in with Google</Button>{error && <p role="alert" className="tc-banner">{error}</p>}</section>;
  if (status === undefined) return <section className="tc-panel">Checking access…</section>;
  if (!status.allowed) return <section className="tc-panel"><h2>Access unavailable</h2><p role="alert">Timeclock is available only to approved Coaches and Mentors. Contact the Coach if you need access.</p></section>;
  return <Timeclock role={status.role!} />;
}
function Timeclock({ role }: { role: "coach" | "mentor" }) {
  const now = useNow();
  const convex = useConvex();
  const { signOut } = useAuthActions();
  const { resolvedTheme, setTheme } = useTheme();
  const connection = useConvexConnectionState();
  const { id: profileId, warning } = useProfileId();
  const events = useQuery(api.timeclock.todayEvents, { asOf: now });
  const calendar = useQuery(api.calendarState.status, { now });
  const roster = useQuery(api.timeclockRoster.list, {});
  const consoleState = useQuery(api.timeclock.consoleStatus, profileId ? { profileId } : "skip");
  const sessionId = consoleState?.selectedSessionId ?? null;
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;
  const clock = useQuery(api.timeclockRoster.clockStatus, sessionId ? { sessionId } : "skip");
  const openMutation = useMutation(api.timeclock.openOccurrence);
  const createMutation = useMutation(api.timeclock.createUnscheduled);
  const selectMutation = useMutation(api.timeclock.selectConsole);
  const groupMutation = useMutation(api.timeclock.clockGroup);
  const outAllMutation = useMutation(api.timeclock.clockOutAll);
  const extendMutation = useMutation(api.timeclock.extend);
  const signOutAuthorization = useMutation(api.timeclockPinControl.authorizeSignOutControl);
  const [checked, setChecked] = useState<Set<StudentId>>(new Set());
  const [rosterMode, setRosterMode] = useState<"individual" | "group">("individual");
  const [dialog, setDialog] = useState<"allDay" | "unscheduled" | "switch" | "extend" | "outAll" | "signOut" | null>(null);
  const [opening, setOpening] = useState<EventRow | null>(null);
  const [target, setTarget] = useState<SessionId | null>(null);
  const [transfer, setTransfer] = useState<ClockRequest | null>(null);
  const [pin, setPin] = useState("");
  const [allDayEnd, setAllDayEnd] = useState("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);
  const [halfHours, setHalfHours] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState<Retry | null>(null);
  const uncertainRef = useRef(false);
  const elapsed = !!sessionId && (!consoleState?.session || now >= consoleState.session.effectiveEnd || (clock !== undefined && clock.state !== "open"));
  const active = !!sessionId && !elapsed;
  const selectedEvent = events?.find(event => event.sessionId === sessionId);
  const statuses = useMemo(() => new Map(clock?.students.map(s => [s.studentId, s]) ?? []), [clock]);
  const inCount = clock?.students.filter(s => s.status === "in").length ?? 0;
  useEffect(() => { setChecked(new Set()); setTransfer(null); setDialog(null); setPin(""); }, [sessionId]);
  useEffect(() => { if (elapsed) { setDialog(null); setTransfer(null); setPin(""); } }, [elapsed]);
  const close = () => { setDialog(null); setTransfer(null); setPin(""); setError(""); };
  const run = async <T extends { ok: boolean; code?: string }>(label: string, command: () => Promise<T>, success?: (result: T) => void | Promise<void>, retrying = false) => {
    if (uncertainRef.current && !retrying) return;
    setBusy(true); setError(""); setRetry(null);
    try {
      const result = await command();
      uncertainRef.current = false;
      if (!result.ok) { setError(errorText(result.code)); return; }
      await success?.(result); setNotice(`${label} completed.`);
    } catch {
      uncertainRef.current = true;
      setError("The connection was interrupted. This action may have completed. Retry the same request to check safely.");
      setRetry({ label, execute: () => run(label, command, success, true) });
    } finally { setBusy(false); }
  };
  const select = async (next?: SessionId, enteredPin?: string) => {
    if (!profileId || !consoleState) return;
    setBusy(true); setError("");
    try {
      const result = await selectMutation({ profileId, expectedRevision: consoleState.revision, selectedSessionId: next, pin: enteredPin });
      if (!result.ok) { setError(errorText(result.code)); return; }
      close(); setNotice(next ? "Event selected." : "Returned to event selection.");
    } catch { setError("Could not change the selected event. Check the connection and try again."); }
    finally { setBusy(false); }
  };
  const choose = (next?: SessionId) => {
    setError("");
    if (active && consoleState?.selectedSessionId !== next) { setTarget(next ?? null); setPin(""); setDialog("switch"); }
    else void select(next);
  };
  const open = (item: EventRow) => {
    if (item.sessionId && item.state === "open") { choose(item.sessionId); return; }
    if (item.allDay) { setOpening(item); setAllDayEnd(""); setDialog("allDay"); return; }
    const commandKey = newKey();
    void run("Event opening", () => openMutation({ occurrenceId: item.occurrenceId, key: commandKey }), async result => { close(); if (result.sessionId) await select(result.sessionId); });
  };
  const create = () => {
    const cleaned = title.trim();
    if (!cleaned || cleaned.length > 160 || !Number.isInteger(duration) || duration <= 0) { setError("Enter a title and a positive whole-minute duration."); return; }
    const commandKey = newKey();
    void run("Unscheduled event creation", () => createMutation({ title: cleaned, durationMs: duration * 60000, key: commandKey }), async result => { close(); if (result.sessionId) await select(result.sessionId); });
  };
  const submitClock = async (request: ClockRequest, enteredPin?: string) => {
    if (!active || sessionRef.current !== request.sessionId) { setError("The selected event changed. Preview the students again."); return; }
    const commandKey = newKey();
    const args = { sessionId: request.sessionId, mode: request.transfer ? "transfer" as const : request.mode, expectedRevision: request.preview.sessionRevision, expected: request.preview.expected, pin: enteredPin, key: commandKey };
    await run(request.mode === "in" ? "Clock-in" : "Clock-out", () => groupMutation(args), () => { setChecked(new Set()); setTransfer(null); setPin(""); });
  };
  const preview = async (mode: "in" | "out", ids: StudentId[]) => {
    if (!sessionId || !active || !ids.length || uncertainRef.current) return;
    const previewSession = sessionId;
    setBusy(true); setError(""); setRetry(null);
    try {
      const result = await convex.query(api.timeclock.previewGroup, { sessionId, studentIds: ids });
      if (sessionRef.current !== previewSession) return;
      if (!result.ok) { setError(errorText(result.code)); return; }
      const request = { sessionId: previewSession, mode, preview: result, transfer: mode === "in" && result.conflicts.length > 0 };
      if (request.transfer) { setPin(""); setTransfer(request); }
      else await submitClock(request);
    } catch { setError("Could not preview current clock status. Check the connection and try again."); }
    finally { setBusy(false); }
  };
  const selected = [...checked];
  const selectedIn = selected.filter(id => statuses.get(id)?.status === "in");
  const selectedOut = selected.filter(id => statuses.get(id)?.status !== "in");
  const commandLocked = busy || !!retry || !connection.isWebSocketConnected;
  const dialogFeedback = <>{error && <p className="tc-banner" role="alert">{error}</p>}{retry && <div className="tc-banner" role="alert">The last request may have reached the server. <Button disabled={busy || !connection.isWebSocketConnected} onClick={() => void retry.execute()}>Retry same {retry.label.toLowerCase()} request</Button></div>}</>;
  return <div className="tc-shell">
    <div className="tc-toolbar"><span className="tc-status">Connected as {role === "coach" ? "Coach" : "Mentor"}</span><div className="tc-actions"><Button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>Switch theme</Button><Button disabled={commandLocked} onClick={() => { setPin(""); setDialog("signOut"); }}>Sign out</Button></div></div>
    {warning && <p className="tc-banner" role="alert">{warning}</p>}
    {!connection.isWebSocketConnected && <p className="tc-banner" role="status">Connection interrupted. Clocking is paused until the server reconnects. Any submitted request may still be completing.</p>}
    {calendar && (!calendar.configured || calendar.stale || calendar.error) && <p className="tc-banner" role="status">Calendar {calendar.configured ? "updates are delayed" : "is not configured"}. {calendar.lastSuccessAt ? `Last updated ${dateTime(calendar.lastSuccessAt)}.` : "No successful update yet."} Open events may use the last confirmed schedule.</p>}
    {error && <p className="tc-banner" role="alert">{error}</p>}{notice && <p className="tc-banner" role="status">{notice}</p>}
    {retry && <div className="tc-banner">The last request may have reached the server. <Button disabled={busy || !connection.isWebSocketConnected} onClick={() => void retry.execute()}>Retry same {retry.label.toLowerCase()} request</Button></div>}
    {!profileId || !consoleState ? <section className="tc-panel"><p>Preparing this browser's shared console…</p></section> : !active ? <section className="tc-panel"><div className="tc-title"><div><p className="eyebrow">Event selection</p><h2>Today's events</h2></div><Button primary disabled={commandLocked} onClick={() => { setTitle(""); setDuration(60); setDialog("unscheduled"); }}>Create unscheduled event</Button></div>
      {elapsed && <p className="tc-banner" role="status">The selected event has ended. Select another event to continue.</p>}
      {events === undefined ? <p>Loading events…</p> : events.length === 0 ? <p>No events are listed for today. You can create an unscheduled event.</p> : <div className="tc-card-grid">{events.map(item => <article className="tc-card" key={item.occurrenceId}><p className="eyebrow">{item.allDay ? "All day" : "Scheduled"} · {item.state}</p><h3>{item.title}</h3><p className="tc-meta">{item.allDay && item.scheduledStart === null ? "Set an end time when opening" : `${time(item.scheduledStart)} – ${time(item.effectiveEnd ?? item.scheduledEnd)}`}</p>{item.needsReview && <p className="tc-banner">Calendar change needs review</p>}<Button primary disabled={!item.available || commandLocked} onClick={() => open(item)}>{item.sessionId && item.state === "open" ? "Select event" : "Open event"}</Button></article>)}</div>}
    </section> : <><section className="tc-panel"><div className="tc-title"><div><p className="eyebrow">Current event</p><h2>{selectedEvent?.title ?? "Selected event"}</h2><p className="tc-meta">Scheduled {time(consoleState.session?.scheduledStart ?? null)} – {time(consoleState.session?.scheduledEnd ?? null)} · Closes {time(consoleState.session?.effectiveEnd ?? null)} (Chicago time)</p></div><span className="tc-status">{inCount} clocked in</span></div><div className="tc-actions"><Button disabled={commandLocked} onClick={() => choose()}>Change event</Button><Button disabled={commandLocked} onClick={() => { setPin(""); setHalfHours(1); setDialog("extend"); }}>Extend event</Button><Button danger disabled={commandLocked || inCount === 0} onClick={() => setDialog("outAll")}>Clock out all</Button></div></section>
      <section className="tc-panel"><div className="tc-title"><div><p className="eyebrow">Live roster</p><h2>Clock students</h2></div><span className="tc-meta">{rosterMode === "group" ? `${checked.size} selected` : "Individual"}</span></div>{roster?.unreviewedCount ? <p className="tc-banner">{roster.unreviewedCount} student name{roster.unreviewedCount === 1 ? " needs" : "s need"} Coach review before clocking. Contact the Coach for name review.</p> : null}<div className="tc-actions" role="group" aria-label="Clocking mode"><Button primary={rosterMode === "individual"} pressed={rosterMode === "individual"} onClick={() => { setRosterMode("individual"); setChecked(new Set()); }}>Individual</Button><Button primary={rosterMode === "group"} pressed={rosterMode === "group"} onClick={() => setRosterMode("group")}>Group</Button></div>{rosterMode === "group" && <div className="tc-actions"><Button primary disabled={commandLocked || !!retry || selectedOut.length === 0} onClick={() => void preview("in", selectedOut)}>Clock in selected ({selectedOut.length})</Button><Button disabled={commandLocked || !!retry || selectedIn.length === 0} onClick={() => void preview("out", selectedIn)}>Clock out selected ({selectedIn.length})</Button><Button disabled={checked.size === 0} onClick={() => setChecked(new Set())}>Clear selection</Button></div>}
        {roster === undefined || clock === undefined ? <p>Loading live roster…</p> : roster.students.length === 0 ? <p>No reviewed students are available for clocking.</p> : <div className="tc-roster">{roster.students.map(student => { const state = statuses.get(student.studentId); const isIn = state?.status === "in"; return <div className="tc-roster-row" key={student.studentId}>{rosterMode === "group" ? <label className="tc-check"><input type="checkbox" disabled={student.collision} checked={checked.has(student.studentId)} onChange={() => setChecked(previous => { const next = new Set(previous); if (next.has(student.studentId)) next.delete(student.studentId); else next.add(student.studentId); return next; })} aria-label={`Select ${student.displayName}${student.subteam ? ` · ${student.subteam}` : ""}`} /><span><strong>{student.displayName}</strong>{student.subteam && <small> · {student.subteam}</small>}{student.collision && <small> · Name collision needs review</small>}</span></label> : <span><strong>{student.displayName}</strong>{student.subteam && <small> · {student.subteam}</small>}{student.collision && <small> · Name collision needs review</small>}</span>}<span className="tc-status">{isIn ? "In" : state?.status === "out" ? "Out" : "No activity"}{state?.hasConflict ? " · In another event" : ""}</span>{rosterMode === "individual" && <Button disabled={commandLocked || !!retry || !state || student.collision} onClick={() => void preview(isIn ? "out" : "in", [student.studentId])}>{isIn ? "Clock out" : state?.hasConflict ? "Transfer in" : "Clock in"}</Button>}</div>; })}</div>}
      </section></>}
    {dialog === "allDay" && opening && <Dialog title="Open all-day event" close={close} feedback={dialogFeedback}><p>{opening.title} starts when you confirm. Choose an end time in Chicago time.</p><label className="tc-label">Event end (Chicago)<input className="tc-input" type="datetime-local" value={allDayEnd} onChange={e => setAllDayEnd(e.target.value)} /></label><div className="tc-dialog-actions"><Button onClick={close}>Cancel</Button><Button primary disabled={commandLocked || !allDayEnd} onClick={() => { const end = chicagoInputToEpoch(allDayEnd); if (end === null || end <= Date.now()) { setError("Choose a future Chicago end time."); return; } const commandKey = newKey(); void run("Event opening", () => openMutation({ occurrenceId: opening.occurrenceId, allDayEnd: end, key: commandKey }), async result => { close(); if (result.sessionId) await select(result.sessionId); }); }}>Open event</Button></div></Dialog>}
    {dialog === "unscheduled" && <Dialog title="Create unscheduled event" close={close} feedback={dialogFeedback}><label className="tc-label">Event name<input className="tc-input" maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="tc-label">Duration in minutes<input className="tc-input" type="number" min={1} step={1} value={duration} onChange={e => setDuration(Number(e.target.value))} /></label><div className="tc-dialog-actions"><Button onClick={close}>Cancel</Button><Button primary disabled={commandLocked || !title.trim() || duration <= 0} onClick={create}>Create event</Button></div></Dialog>}
    {dialog === "switch" && <Dialog title="Change selected event" close={close} feedback={dialogFeedback}><p>Enter the operator PIN to leave this active event. The change appears in every tab of this browser profile.</p><Pin value={pin} change={setPin} /><div className="tc-dialog-actions"><Button onClick={close}>Cancel</Button><Button primary disabled={commandLocked || !pin} onClick={() => void select(target ?? undefined, pin)}>Confirm change</Button></div></Dialog>}
    {transfer && <Dialog title="Confirm student transfer" close={close} feedback={dialogFeedback}><p>The following students are clocked into another event. Confirming clocks them out there and into this event. Free selected students are also clocked in.</p><ul>{transfer.preview.conflicts.map(conflict => { const student = roster?.students.find(row => row.studentId === conflict.studentId); return <li key={conflict.studentId}>{student ? `${student.displayName}${student.subteam ? ` · ${student.subteam}` : ""}` : "Selected student"}</li>; })}</ul><Pin value={pin} change={setPin} /><div className="tc-dialog-actions"><Button onClick={close}>Cancel</Button><Button danger disabled={commandLocked || !!retry || !pin || !active} onClick={() => void submitClock(transfer, pin)}>Confirm transfer</Button></div></Dialog>}
    {dialog === "extend" && <Dialog title="Extend event" close={close} feedback={dialogFeedback}><p>Add time in half-hour increments. The total extension limit is four hours.</p><label className="tc-label">Half-hour increments<select className="tc-select" value={halfHours} onChange={e => setHalfHours(Number(e.target.value))}>{Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>{(i + 1) * 30} minutes</option>)}</select></label><Pin value={pin} change={setPin} /><div className="tc-dialog-actions"><Button onClick={close}>Cancel</Button><Button primary disabled={commandLocked || !pin || !active} onClick={() => { if (!sessionId || !consoleState?.session) return; const commandKey = newKey(); const revision = consoleState.session.revision; const args = { sessionId, halfHours, expectedRevision: revision, pin, key: commandKey }; void run("Extension", () => extendMutation(args), close); }}>Extend event</Button></div></Dialog>}
    {dialog === "outAll" && <Dialog title="Clock out all students" close={close} feedback={dialogFeedback}><p>Clock out everyone currently in this event?</p><div className="tc-dialog-actions"><Button onClick={close}>Cancel</Button><Button danger disabled={commandLocked || !active} onClick={() => { if (!sessionId || !consoleState?.session) return; const commandKey = newKey(); const revision = consoleState.session.revision; void run("Clock-out all", () => outAllMutation({ sessionId, expectedRevision: revision, key: commandKey }), close); }}>Clock out all</Button></div></Dialog>}
    {dialog === "signOut" && <Dialog title="Sign out" close={close} feedback={dialogFeedback}><p>Enter the operator PIN to sign out of Timeclock.</p><Pin value={pin} change={setPin} /><div className="tc-dialog-actions"><Button onClick={close}>Cancel</Button><Button primary disabled={commandLocked || !pin} onClick={() => { setBusy(true); setError(""); void signOutAuthorization({ pin }).then(result => { if (!result.ok) { setError(errorText(result.code)); return; } setPin(""); return signOut(); }).catch(() => setError("Sign-out authorization could not be completed. Check the connection and try again.")).finally(() => setBusy(false)); }}>Sign out</Button></div></Dialog>}
  </div>;
}
// Interpret the all-day end in the team's time zone, including daylight-saving transitions.
function chicagoInputToEpoch(input: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = (epoch: number) => Object.fromEntries(formatter.formatToParts(epoch).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  for (const offset of [5, 6]) {
    const candidate = desired + offset * 3600000;
    const p = parts(candidate);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) return candidate;
  }
  return null;
}
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <section className="tc-panel"><p role="alert">Unable to connect. Reload this page to try again.</p></section> : this.props.children; }
}
const convexUrl = import.meta.env.VITE_CONVEX_URL;
const client = convexUrl ? new ConvexReactClient(convexUrl) : null;
const app = <main className="tc-app"><header className="tc-header"><img src="/assets/logos/logo-mark-white-text.png" alt="Denham Venom" className="tc-brand" /><div><p className="eyebrow">FIRST TEAM 8044 · DEVELOPMENT</p><h1>Timeclock</h1></div></header><Boundary>{client ? <ConvexAuthProvider client={client} storageNamespace={`timeclock:${convexUrl}`}><Access /></ConvexAuthProvider> : <section className="tc-panel"><p role="alert">Set VITE_CONVEX_URL in this workspace's .env.local to connect development.</p></section>}</Boundary><footer className="tc-footer">Denham Venom · Timeclock</footer></main>;
const router = createBrowserRouter([{ path: "*", element: app }]);
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange><RouterProvider router={router} /></ThemeProvider></React.StrictMode>);
