import { ConfirmAction } from '../../ConfirmAction'
import { EventEnrollmentNotice } from "../../EventEnrollmentNotice";
import { operationsCopy, operationsText } from '../../lib/operations-copy'
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from 'react-router';
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
  if (!data || !peers) return <p role="status">{operationsCopy.rooms.loadingRoomSelection}</p>;
  const group = data.group;
  const closed = data.roomDeadline !== null && now > data.roomDeadline;
  return <section className={styles.root} aria-label={operationsCopy.rooms.yourRoomSelection}>
    <Card><CardHeader><CardTitle>{operationsCopy.rooms.yourRoom}</CardTitle></CardHeader><CardContent className="space-y-3">
      {data.roomDeadline !== null && <p>{operationsText.rooms.selectionCloses(new Date(data.roomDeadline).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }))}</p>}
      {closed && <p>{operationsCopy.rooms.studentRoomChangesClosedAtTheDeadlineAskACoachOrTravelLeadForACorrection}</p>}
      {group ? <><p><strong>{group.name}</strong>{group.finalized ? operationsCopy.rooms.finalizedSuffix : ""}</p><ul>{group.members.map((m: { studentId: string; preferredName: string }) => <li key={m.studentId}>{m.preferredName}</li>)}</ul>{!group.finalized && !closed && <Button variant="outline" disabled={busy} onClick={() => void act(() => leave({ eventId }), operationsCopy.rooms.youLeftTheGroup)}>{operationsCopy.rooms.leaveGroup}</Button>}</> : data.requestedAssignment ? <><p>{operationsCopy.rooms.youAskedTheTravelTeamToAssignYouARoom}</p>{!closed && <Button variant="outline" disabled={busy} onClick={() => void act(() => cancelRequest({ eventId }), operationsCopy.rooms.assignmentRequestCanceled)}>{operationsCopy.rooms.cancelRequest}</Button>}</> : <><p>{operationsCopy.rooms.youHaveNotSelectedARoomYet}</p>{!closed && <><Button disabled={busy} onClick={() => void act(() => request({ eventId }), operationsCopy.rooms.assignmentRequested)}>{operationsCopy.rooms.askToBeAssigned}</Button><form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void act(() => create({ eventId, name: name.trim() }), operationsCopy.rooms.groupCreated); }}><label>{operationsCopy.rooms.groupName} <Input value={name} onChange={e => setName(e.target.value)} maxLength={80} required /></label><Button type="submit" disabled={busy}>{operationsCopy.rooms.createGroup}</Button></form></>}</>}
      {group && !group.finalized && !closed && group.members.length < 4 && <div className="form-grid"><label>{operationsCopy.rooms.inviteConfirmedTeammate} <NativeSelect value={peer} onChange={e => setPeer(e.target.value)}><NativeSelectOption value="">{operationsCopy.rooms.chooseATeammate}</NativeSelectOption>{peers.map(p => <NativeSelectOption value={p.studentId} key={p.studentId}>{p.preferredName}</NativeSelectOption>)}</NativeSelect></label><Button disabled={busy || !peer} onClick={() => void act(() => invite({ groupId: group._id, studentId: peer as Id<"students"> }), operationsCopy.rooms.invitationSent)}>{operationsCopy.rooms.invite}</Button></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{operationsCopy.rooms.invitations}</CardTitle></CardHeader><CardContent className="space-y-2">{data.invites.length ? data.invites.map((i: { _id: Id<"roomInvites">; groupName: string; invitedBy: string }) => <div className={styles.sectionRow} key={i._id}><span>{operationsText.rooms.invitedBy(i.invitedBy, i.groupName)}</span>{!closed && <><Button disabled={busy || !!group} onClick={() => void act(() => respond({ inviteId: i._id, accept: true }), operationsCopy.rooms.invitationAccepted)}>{operationsCopy.rooms.accept}</Button><Button variant="outline" disabled={busy} onClick={() => void act(() => respond({ inviteId: i._id, accept: false }), operationsCopy.rooms.invitationDeclined)}>{operationsCopy.rooms.decline}</Button></>}</div>) : <p>{operationsCopy.rooms.noRoomInvitations}</p>}{group && data.sentInvites.map((i: { _id: Id<"roomInvites">; studentId: Id<"students"> }) => <div className={styles.sectionRow} key={i._id}><span>{operationsText.rooms.sentInvitation(peers.find(p => p.studentId === i.studentId)?.preferredName ?? operationsCopy.rooms.teammate)}</span>{!closed && <Button variant="outline" disabled={busy} onClick={() => void act(() => cancelInvite({ inviteId: i._id }), operationsCopy.rooms.invitationCanceled)}>{operationsCopy.rooms.cancel}</Button>}</div>)}</CardContent></Card>
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
  if (!data) return <p role="status">{operationsCopy.rooms.loadingRoomRoster}</p>;
  const groups = data.groups as Group[];
  const students = data.students as Student[];
  const closed = data.event.roomDeadline !== null && Date.now() > data.event.roomDeadline;
  return <section className={styles.root} aria-label={operationsCopy.rooms.roomManagement}>
    <Card><CardHeader><CardTitle>{operationsCopy.rooms.roomAssignments}</CardTitle></CardHeader><CardContent className="space-y-4"><p>{closed ? operationsCopy.rooms.selectionClosed : operationsCopy.rooms.selectionOpen}{operationsCopy.rooms.fifthRule}</p><label>{operationsCopy.rooms.correctionReason} <Input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label><details><summary>More options</summary><label className="checkbox-label"><Checkbox checked={fifth} onCheckedChange={checked => setFifth(checked)} /> {operationsCopy.rooms.authorizeFifth}</label></details>
      <form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void act(() => create({ eventId, name: name.trim(), category, reason: reason.trim() || undefined }), operationsCopy.rooms.roomCreated); }}><label>{operationsCopy.rooms.newRoomName} <Input value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></label><label>{operationsCopy.rooms.categoryLabel} <NativeSelect value={category} onChange={e => setCategory(e.target.value as "Boys" | "Girls")}><NativeSelectOption value="Boys">{operationsCopy.rooms.boys}</NativeSelectOption><NativeSelectOption value="Girls">{operationsCopy.rooms.girls}</NativeSelectOption></NativeSelect></label><Button type="submit" disabled={busy || closed && !reason.trim()}>{operationsCopy.rooms.createRoom}</Button></form>
    </CardContent></Card>
    {groups.map(group => <Card key={group._id}><CardHeader><CardTitle>{group.name} · {group.category}</CardTitle></CardHeader><CardContent className="space-y-3"><p>{operationsText.rooms.occupancy(group.members.length, group.finalized ? operationsCopy.rooms.finalized : operationsCopy.rooms.open, group.needsReview ? operationsCopy.rooms.needsReviewSuffix : "", group.adultFifthException ? operationsCopy.rooms.fifthApprovedSuffix : "")}</p><ul>{group.members.map(s => <li className={styles.sectionRow} key={s.studentId}><span>{s.name}</span><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void act(() => unassign({ eventId, studentId: s.studentId, reason: reason.trim() }), operationsText.rooms.removedFromRoom(s.name))}>{operationsCopy.rooms.remove}</Button></li>)}</ul><div className="flex flex-wrap items-end gap-2"><label>{operationsCopy.rooms.assignOrMove} <NativeSelect value={target[group._id] ?? ""} onChange={e => setTarget(t => ({ ...t, [group._id]: e.target.value }))}><NativeSelectOption value="">{operationsCopy.rooms.chooseStudent}</NativeSelectOption>{students.filter(s => s.category === group.category && s.groupId !== group._id).map(s => <NativeSelectOption value={s.studentId} key={s.studentId}>{s.name}{s.groupId ? operationsCopy.rooms.moveSuffix : s.requestedAssignment ? operationsCopy.rooms.requestedSuffix : ""}</NativeSelectOption>)}</NativeSelect></label><Button disabled={busy || !target[group._id] || group.members.length >= 5 || (closed || group.finalized || group.members.length === 4) && !reason.trim()} onClick={() => void act(() => assign({ groupId: group._id, studentId: target[group._id] as Id<"students">, allowFifth: fifth, reason: reason.trim() || undefined }), operationsCopy.rooms.roomAssignmentSaved)}>{operationsCopy.rooms.assign}</Button><ConfirmAction disabled={busy || (group.finalized && !group.needsReview) || !group.members.length || (closed || group.members.length === 5) && !reason.trim()} description={`Finalize ${group.name} with ${group.members.length} students: ${group.members.map(member => member.name).join(", ")}? Students cannot change a finalized room. Adult corrections remain available.${reason.trim() ? ` Reason: ${reason.trim()}` : ""}`} onConfirm={async () => { await finalize({ groupId: group._id, expectedMembers: group.members.map(member => member.studentId), allowFifth: fifth, reason: reason.trim() || undefined }); setMessage(operationsCopy.rooms.roomFinalized) }}>{group.finalized && !group.needsReview ? operationsCopy.rooms.finalized : operationsCopy.rooms.reviewAndFinalize}</ConfirmAction></div></CardContent></Card>)}
    <Card><CardHeader><CardTitle>{operationsCopy.rooms.studentsAwaitingPlacement}</CardTitle></CardHeader><CardContent>{students.filter(s => !s.groupId).length ? <ul>{students.filter(s => !s.groupId).map(s => <li key={s.studentId}>{s.name} · {s.category ?? operationsCopy.rooms.categoryMissing}{s.requestedAssignment ? operationsCopy.rooms.requestedSuffix : ""}</li>)}</ul> : <p>{students.length?operationsCopy.rooms.allConfirmedStudentsArePlaced:'No students to place yet.'}</p>}</CardContent></Card>
    {error && <p role="alert" className="open-text">{error}</p>}{message && <p role="status" className="ready-text">{message}</p>}
  </section>;
}

export function RoomOperations({ eventId, mode }: { eventId: Id<"events">; mode: "student" | "adult" }) {
  const standalone = useLocation().pathname.endsWith('/rooming');
  const detail = useQuery(api.app.eventDetail, { eventId });
  const viewer = useQuery(api.app.viewer, {});
  if (!detail || !viewer) return <p role="status">{operationsCopy.rooms.loadingRoomSelection}</p>;
  const enrollmentPending = detail.event.enrollmentState === "running" || detail.event.enrollmentState === "failed";
  return <>{standalone && <><Link className="back" to={`/events/${eventId}`}>← Event</Link><h1>{detail.event.name} · Rooming</h1></>}{enrollmentPending ? <EventEnrollmentNotice eventId={eventId} staff={mode === "adult"} coach={viewer.user?.role === "coach"} failed={detail.event.enrollmentState === "failed"}/> : mode === "student" ? <StudentRoom eventId={eventId} /> : <AdultRoom eventId={eventId} />}</>;
}
