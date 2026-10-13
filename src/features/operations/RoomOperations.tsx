import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select";
import { Checkbox } from "../../components/ui/checkbox";
import styles from "./Operations.module.css";

type Student = { studentId: Id<"students">; name: string; category: "Boys" | "Girls" | null; groupId: Id<"roomGroups"> | null; requestedAssignment: boolean };
type Group = { _id: Id<"roomGroups">; name: string; category: "Boys" | "Girls"; finalized: boolean; needsReview: boolean; adultFifthException: boolean; members: Student[] };

function StudentRoom({ eventId }: { eventId: Id<"events"> }) {
  const data = useQuery(api.rooms.mine, { eventId });
  const peers = useQuery(api.rooms.eligiblePeers, { eventId });
  const request = useMutation(api.rooms.requestAssignment);
  const cancelRequest = useMutation(api.rooms.cancelAssignmentRequest);
  const create = useMutation(api.rooms.createGroup);
  const invite = useMutation(api.rooms.invite);
  const cancelInvite = useMutation(api.rooms.cancelInvite);
  const respond = useMutation(api.rooms.respond);
  const leave = useMutation(api.rooms.leave);
  const [name, setName] = useState("");
  const [peer, setPeer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  async function act(fn: () => Promise<unknown>, result: string) { setBusy(true); setError(""); setMessage(""); try { await fn(); setMessage(result); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  if (!data || !peers) return <p role="status">Loading room selection…</p>;
  const group = data.group;
  const closed = data.roomDeadline !== null && now > data.roomDeadline;
  return <section className={styles.root} aria-label="Your room selection">
    <Card><CardHeader><CardTitle>Your room</CardTitle></CardHeader><CardContent className="space-y-3">
      {data.roomDeadline !== null && <p>Selection closes {new Date(data.roomDeadline).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" })}.</p>}
      {closed && <p>Student room changes closed at the deadline. Ask a Coach or Travel Lead for a correction.</p>}
      {group ? <><p><strong>{group.name}</strong>{group.finalized ? " · Finalized" : ""}</p><ul>{group.members.map((m: { studentId: string; preferredName: string }) => <li key={m.studentId}>{m.preferredName}</li>)}</ul>{!group.finalized && !closed && <Button variant="outline" disabled={busy} onClick={() => void act(() => leave({ eventId }), "You left the group.")}>Leave group</Button>}</> : data.requestedAssignment ? <><p>You asked the travel team to assign you a room.</p>{!closed && <Button variant="outline" disabled={busy} onClick={() => void act(() => cancelRequest({ eventId }), "Assignment request canceled.")}>Cancel request</Button>}</> : <><p>You have not selected a room yet.</p>{!closed && <><Button disabled={busy} onClick={() => void act(() => request({ eventId }), "Assignment requested.")}>Ask to be assigned</Button><form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void act(() => create({ eventId, name: name.trim() }), "Group created."); }}><label>Group name <Input value={name} onChange={e => setName(e.target.value)} maxLength={80} required /></label><Button type="submit" disabled={busy}>Create group</Button></form></>}</>}
      {group && !group.finalized && !closed && group.members.length < 4 && <div className="form-grid"><label>Invite confirmed teammate <NativeSelect value={peer} onChange={e => setPeer(e.target.value)}><NativeSelectOption value="">Choose a teammate</NativeSelectOption>{peers.map(p => <NativeSelectOption value={p.studentId} key={p.studentId}>{p.preferredName}</NativeSelectOption>)}</NativeSelect></label><Button disabled={busy || !peer} onClick={() => void act(() => invite({ groupId: group._id, studentId: peer as Id<"students"> }), "Invitation sent.")}>Invite</Button></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Invitations</CardTitle></CardHeader><CardContent className="space-y-2">{data.invites.length ? data.invites.map((i: { _id: Id<"roomInvites">; groupName: string; invitedBy: string }) => <div className={styles.sectionRow} key={i._id}><span>{i.invitedBy} invited you to {i.groupName}</span>{!closed && <><Button disabled={busy || !!group} onClick={() => void act(() => respond({ inviteId: i._id, accept: true }), "Invitation accepted.")}>Accept</Button><Button variant="outline" disabled={busy} onClick={() => void act(() => respond({ inviteId: i._id, accept: false }), "Invitation declined.")}>Decline</Button></>}</div>) : <p>No room invitations.</p>}{group && data.sentInvites.map((i: { _id: Id<"roomInvites">; studentId: Id<"students"> }) => <div className={styles.sectionRow} key={i._id}><span>Sent invitation to {peers.find(p => p.studentId === i.studentId)?.preferredName ?? "teammate"}</span>{!closed && <Button variant="outline" disabled={busy} onClick={() => void act(() => cancelInvite({ inviteId: i._id }), "Invitation canceled.")}>Cancel</Button>}</div>)}</CardContent></Card>
    {error && <p role="alert" className="open-text">{error}</p>}{message && <p role="status" className="ready-text">{message}</p>}
  </section>;
}

function AdultRoom({ eventId }: { eventId: Id<"events"> }) {
  const data = useQuery(api.rooms.workspace, { eventId });
  const create = useMutation(api.rooms.adultCreateGroup);
  const assign = useMutation(api.rooms.adultAssign);
  const unassign = useMutation(api.rooms.adultUnassign);
  const finalize = useMutation(api.rooms.finalize);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"Boys" | "Girls">("Boys");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<Record<string, string>>({});
  const [fifth, setFifth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function act(fn: () => Promise<unknown>, result: string) { setBusy(true); setError(""); setMessage(""); try { await fn(); setMessage(result); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  if (!data) return <p role="status">Loading room roster…</p>;
  const groups = data.groups as Group[];
  const students = data.students as Student[];
  const closed = data.event.roomDeadline !== null && Date.now() > data.event.roomDeadline;
  return <section className={styles.root} aria-label="Room management">
    <Card><CardHeader><CardTitle>Room assignments</CardTitle></CardHeader><CardContent className="space-y-4"><p>{closed ? "Student selection is closed. Adult corrections require a reason." : "Students may choose roommates until the room deadline."} A fifth occupant requires authorization and a note; six are never allowed.</p><label>Correction or fifth-occupant reason <Input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label><label className="checkbox-label"><Checkbox checked={fifth} onCheckedChange={checked => setFifth(checked)} /> Authorize a fifth occupant</label>
      <form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void act(() => create({ eventId, name: name.trim(), category, reason: reason.trim() || undefined }), "Room created."); }}><label>New room name <Input value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></label><label>Category <NativeSelect value={category} onChange={e => setCategory(e.target.value as "Boys" | "Girls")}><NativeSelectOption>Boys</NativeSelectOption><NativeSelectOption>Girls</NativeSelectOption></NativeSelect></label><Button type="submit" disabled={busy || closed && !reason.trim()}>Create room</Button></form>
    </CardContent></Card>
    {groups.map(group => <Card key={group._id}><CardHeader><CardTitle>{group.name} · {group.category}</CardTitle></CardHeader><CardContent className="space-y-3"><p>{group.members.length} occupant{group.members.length === 1 ? "" : "s"} · {group.finalized ? "Finalized" : "Open"}{group.needsReview ? " · Needs review" : ""}{group.adultFifthException ? " · Fifth approved" : ""}</p><ul>{group.members.map(s => <li className={styles.sectionRow} key={s.studentId}><span>{s.name}</span><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void act(() => unassign({ eventId, studentId: s.studentId, reason: reason.trim() }), `${s.name} removed from room.`)}>Remove</Button></li>)}</ul><div className="flex flex-wrap items-end gap-2"><label>Assign or move student <NativeSelect value={target[group._id] ?? ""} onChange={e => setTarget(t => ({ ...t, [group._id]: e.target.value }))}><NativeSelectOption value="">Choose student</NativeSelectOption>{students.filter(s => s.category === group.category && s.groupId !== group._id).map(s => <NativeSelectOption value={s.studentId} key={s.studentId}>{s.name}{s.groupId ? " · move from another room" : s.requestedAssignment ? " · requested assignment" : ""}</NativeSelectOption>)}</NativeSelect></label><Button disabled={busy || !target[group._id] || group.members.length >= 5 || (closed || group.finalized || group.members.length === 4) && !reason.trim()} onClick={() => void act(() => assign({ groupId: group._id, studentId: target[group._id] as Id<"students">, allowFifth: fifth, reason: reason.trim() || undefined }), "Room assignment saved.")}>Assign</Button><Button variant="outline" disabled={busy || !group.members.length || (closed || group.members.length === 5) && !reason.trim()} onClick={() => void act(() => finalize({ groupId: group._id, allowFifth: fifth, reason: reason.trim() || undefined }), "Room finalized.")}>Finalize</Button></div></CardContent></Card>)}
    <Card><CardHeader><CardTitle>Students awaiting placement</CardTitle></CardHeader><CardContent>{students.filter(s => !s.groupId).length ? <ul>{students.filter(s => !s.groupId).map(s => <li key={s.studentId}>{s.name} · {s.category ?? "Category missing"}{s.requestedAssignment ? " · requested assignment" : ""}</li>)}</ul> : <p>All confirmed students are placed.</p>}</CardContent></Card>
    {error && <p role="alert" className="open-text">{error}</p>}{message && <p role="status" className="ready-text">{message}</p>}
  </section>;
}

export function RoomOperations({ eventId, mode }: { eventId: Id<"events">; mode: "student" | "adult" }) { return mode === "student" ? <StudentRoom eventId={eventId} /> : <AdultRoom eventId={eventId} />; }
