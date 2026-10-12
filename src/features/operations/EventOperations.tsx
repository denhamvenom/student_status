import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

type Row = { participantId: string; studentId: Id<"students">; name: string; status: string; signedUpAt: number; active: boolean };
type Requirement = { key: string; label: string; instructions?: string; url?: string; dueAt?: number };

function when(value?: number | null) { return value ? new Date(value).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }) : "Not set"; }
function localDate(value?: number | null) { if (!value) return ""; const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function EventOperations({ eventId }: { eventId: Id<"events"> }) {
  const data = useQuery(api.eventOperations.workspace, { eventId });
  const review = useMutation(api.eventOperations.reviewSignup);
  const settings = useMutation(api.eventOperations.updateSettings);
  const saveRequirement = useMutation(api.eventOperations.saveRequirement);
  const removeRequirement = useMutation(api.eventOperations.removeRequirement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reason, setReason] = useState("");
  const [capacity, setCapacity] = useState<string | null>(null);
  const [signupDeadline, setSignupDeadline] = useState<string | null>(null);
  const [roomDeadline, setRoomDeadline] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [url, setUrl] = useState("");
  const [dueAt, setDueAt] = useState("");

  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await fn(); setSuccess(message); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  if (!data) return <p role="status">Loading event operations…</p>;
  const event = data.event;
  const canEdit = data.canEdit;
  const capacityValue = capacity ?? (event.capacity?.toString() ?? "");
  const signupValue = signupDeadline ?? localDate(event.signupClosesAt);
  const roomValue = roomDeadline ?? localDate(event.roomDeadline);
  const participants = data.participants as Row[];
  const waitlist = data.waitlist as Row[];
  const requirements = data.requirements as Requirement[];
  const pending = participants.filter(p => p.status === "pending");
  const confirmed = participants.filter(p => p.status === "confirmed");
  const submitSettings = (e: FormEvent) => {
    e.preventDefault();
    const parsed = capacityValue.trim() ? Number(capacityValue) : null;
    const signup = signupValue ? Date.parse(signupValue) : null;
    const room = roomValue ? Date.parse(roomValue) : null;
    if (parsed !== null && (!Number.isSafeInteger(parsed) || parsed < 1) || signup !== null && !Number.isFinite(signup) || room !== null && !Number.isFinite(room)) { setError("Enter valid capacity and deadlines."); return; }
    void act(() => settings({ eventId, capacity: parsed, ...(event.signupMode !== "assigned" ? { signupClosesAt: signup } : {}), ...(event.overnight && event.roomingEnabled ? { roomDeadline: room } : {}) }), "Event settings saved.");
  };
  const submitRequirement = (e: FormEvent) => {
    e.preventDefault();
    const due = dueAt ? Date.parse(dueAt) : null;
    if (due !== null && !Number.isFinite(due)) { setError("Enter a valid due date."); return; }
    void act(async () => { await saveRequirement({ eventId, key: key.trim(), label: label.trim(), instructions: instructions.trim(), url: url.trim(), dueAt: due }); setKey(""); setLabel(""); setInstructions(""); setUrl(""); setDueAt(""); }, "Requirement saved.");
  };
  return <section aria-label="Event operations" className="space-y-4">
    <Card><CardHeader><CardTitle>Signups and capacity</CardTitle></CardHeader><CardContent className="space-y-4">
      <p>{data.reserved} places reserved{event.capacity !== undefined ? ` of ${event.capacity}` : ""}{data.available !== null ? ` · ${data.available} available` : ""}. Pending signups reserve a place; charges begin at confirmation.</p>
      <p>Signup closes: {when(event.signupClosesAt)}. Waitlisted students are promoted manually in signup order.</p>
      {pending.length > 0 && <div><h3 className="font-semibold">Awaiting approval</h3><div className="space-y-2">{pending.map(p => <div className="flex flex-wrap items-center gap-2" key={p.participantId}><span className="min-w-40">{p.name}</span><Button disabled={busy} onClick={() => void act(() => review({ eventId, studentId: p.studentId, decision: "approve" }), `${p.name} approved.`)}>Approve</Button><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void act(() => review({ eventId, studentId: p.studentId, decision: "decline", reason: reason.trim() }), `${p.name} declined.`)}>Decline</Button></div>)}</div></div>}
      {waitlist.length > 0 && <div><h3 className="font-semibold">Waitlist</h3><ol className="space-y-2">{waitlist.map((p, i) => <li className="flex flex-wrap items-center gap-2" key={p.participantId}><span className="min-w-40">{i + 1}. {p.name} · {when(p.signedUpAt)}</span><Button disabled={busy || i !== 0 || data.available === 0} onClick={() => void act(() => review({ eventId, studentId: p.studentId, decision: "promote" }), `${p.name} promoted and confirmed.`)}>Promote</Button><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void act(() => review({ eventId, studentId: p.studentId, decision: "decline", reason: reason.trim() }), `${p.name} removed from waitlist.`)}>Decline</Button></li>)}</ol></div>}
      {(pending.length > 0 || waitlist.length > 0) && <label className="block">Reason for declining a signup <Input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>}
      {confirmed.length > 0 && <p>Confirmed: {confirmed.map(p => p.name).join(", ")}</p>}
    </CardContent></Card>
    {canEdit && <Card><CardHeader><CardTitle>Event settings</CardTitle></CardHeader><CardContent><form className="form-grid" onSubmit={submitSettings}>
      {event.signupMode !== "assigned" && <><label>Capacity (blank for no limit) <Input type="number" min="1" max="500" value={capacityValue} onChange={e => setCapacity(e.target.value)} /></label><label>Signup closes (your local time) <Input type="datetime-local" value={signupValue} onChange={e => setSignupDeadline(e.target.value)} /></label></>}
      {event.overnight && event.roomingEnabled && <label>Room selection deadline (your local time) <Input type="datetime-local" value={roomValue} onChange={e => setRoomDeadline(e.target.value)} /></label>}
      <Button type="submit" disabled={busy}>Save settings</Button></form></CardContent></Card>}
    {canEdit && <Card><CardHeader><CardTitle>Custom requirements</CardTitle></CardHeader><CardContent className="space-y-4"><div className="space-y-2">{requirements.map(r => <div className="flex flex-wrap items-center gap-2" key={r.key}><span className="min-w-40">{r.label}{r.dueAt ? ` · due ${when(r.dueAt)}` : ""}</span><Button variant="outline" disabled={busy} onClick={() => { setKey(r.key); setLabel(r.label); setInstructions(r.instructions ?? ""); setUrl(r.url ?? ""); setDueAt(localDate(r.dueAt)); }}>Edit</Button><Button variant="outline" disabled={busy} onClick={() => void act(() => removeRequirement({ eventId, key: r.key }), `${r.label} removed.`)}>Remove</Button></div>)}</div><form className="form-grid" onSubmit={submitRequirement}><label>Key <Input value={key} onChange={e => setKey(e.target.value)} pattern="[a-zA-Z0-9_-]{1,32}" required /></label><label>Label <Input value={label} onChange={e => setLabel(e.target.value)} required /></label><label>Instructions <Input value={instructions} onChange={e => setInstructions(e.target.value)} /></label><label>HTTPS link <Input type="url" value={url} onChange={e => setUrl(e.target.value)} /></label><label>Due <Input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label><Button type="submit" disabled={busy}>Save requirement</Button></form></CardContent></Card>}
    {error && <p role="alert" className="open-text">{error}</p>}{success && <p role="status" className="ready-text">{success}</p>}
  </section>;
}
