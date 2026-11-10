import { userFacingError } from '@/lib/error-message'
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
import { ReviewRow, StepWizard } from "../../components/StepWizard";
import { formatDeadline } from "../student-home/format";
import { assignIssue, assignNeedsReason, assignPickerNote, finalizeIssue, roomFieldIssues, roomTypeIssue } from "./roomRules";
import styles from "./Operations.module.css";

const roomHints = {
  groupNameRequired: 'Enter a group name.',
  roomNameRequired: 'Enter a room name.',
  reasonWhen: 'Needed to correct this room: after the deadline, to remove or move a student, to add a 5th student or to finalize a full room.',
};
const createRoomCopy = {
  open: 'Create room',
  title: 'Create a room',
  stepRoom: 'Name the room',
  stepReason: 'Why create it now?',
  stepCheck: 'Review',
  reasonLabel: 'Reason',
  reasonHelp: 'Room selection is closed, so a reason is required. It is saved with the change.',
  roomLabel: 'Room name',
  typeLabel: 'Room type',
  chooseType: 'Choose a room type',
  next: 'Continue',
  create: 'Create room',
  creating: 'Creating…',
  noReason: 'Not needed',
  reasonRequired: 'Enter a reason.',
  failed: 'The room was not created. Try again. If it keeps happening, contact a Coach.',
} as const
const studentCount = (count: number) => `${count} student${count === 1 ? '' : 's'}`;

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
  async function act(fn: () => Promise<unknown>, result: string) { setBusy(true); setError(""); setMessage(""); try { await fn(); setMessage(result); } catch (e) { setError(userFacingError(e)); } finally { setBusy(false); } }
  if (!data || !peers) return <p role="status">{operationsCopy.rooms.loadingRoomSelection}</p>;
  const group = data.group;
  const closed = data.roomDeadline !== null && now > data.roomDeadline;
  return <section className={styles.root} aria-label={operationsCopy.rooms.yourRoomSelection}>
    <Card><CardHeader><CardTitle>{operationsCopy.rooms.yourRoom}</CardTitle></CardHeader><CardContent className="space-y-3">
      {data.roomDeadline !== null && <p>{operationsText.rooms.selectionCloses(formatDeadline(data.roomDeadline))}</p>}
      {closed && <p>{operationsCopy.rooms.studentRoomChangesClosedAtTheDeadlineAskACoachOrTravelLeadForACorrection}</p>}
      {group ? <><p><strong>{group.name}</strong>{group.finalized ? operationsCopy.rooms.finalizedSuffix : ""}</p><ul>{group.members.map((m: { studentId: string; legalName?: string; preferredName: string }) => <li key={m.studentId}>{m.legalName||m.preferredName}</li>)}</ul>{!group.finalized && !closed && <Button variant="outline" disabled={busy} onClick={() => void act(() => leave({ eventId }), operationsCopy.rooms.youLeftTheGroup)}>{operationsCopy.rooms.leaveGroup}</Button>}</> : data.requestedAssignment ? <><p>{operationsCopy.rooms.youAskedTheTravelTeamToAssignYouARoom}</p>{!closed && <Button variant="outline" disabled={busy} onClick={() => void act(() => cancelRequest({ eventId }), operationsCopy.rooms.assignmentRequestCanceled)}>{operationsCopy.rooms.cancelRequest}</Button>}</> : <><p>{operationsCopy.rooms.youHaveNotSelectedARoomYet}</p>{!closed && <><Button disabled={busy} onClick={() => void act(() => request({ eventId }), operationsCopy.rooms.assignmentRequested)}>{operationsCopy.rooms.askToBeAssigned}</Button><form className="form-grid" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); if (!name.trim()) { setMessage(""); setError(roomHints.groupNameRequired); return; } void act(() => create({ eventId, name: name.trim() }), operationsCopy.rooms.groupCreated); }}><label>{operationsCopy.rooms.groupName} <Input value={name} onChange={e => setName(e.target.value)} maxLength={80} required aria-invalid={error === roomHints.groupNameRequired || undefined} /></label><Button type="submit" disabled={busy}>{operationsCopy.rooms.createGroup}</Button></form></>}</>}
      {group && !group.finalized && !closed && group.members.length < 4 && <div className="form-grid"><label>{operationsCopy.rooms.inviteConfirmedTeammate} <NativeSelect value={peer} onChange={e => setPeer(e.target.value)}><NativeSelectOption value="">{operationsCopy.rooms.chooseATeammate}</NativeSelectOption>{peers.map(p => <NativeSelectOption value={p.studentId} key={p.studentId}>{p.legalName||p.preferredName}</NativeSelectOption>)}</NativeSelect></label><Button disabled={busy || !peer} onClick={() => void act(() => invite({ groupId: group._id, studentId: peer as Id<"students"> }), operationsCopy.rooms.invitationSent)}>{operationsCopy.rooms.invite}</Button></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{operationsCopy.rooms.invitations}</CardTitle></CardHeader><CardContent className="space-y-2">{data.invites.length ? data.invites.map((i: { _id: Id<"roomInvites">; groupName: string; invitedBy: string }) => <div className={styles.sectionRow} key={i._id}><span>{operationsText.rooms.invitedBy(i.invitedBy, i.groupName)}</span>{!closed && <><Button disabled={busy || !!group} onClick={() => void act(() => respond({ inviteId: i._id, accept: true }), operationsCopy.rooms.invitationAccepted)}>{operationsCopy.rooms.accept}</Button><Button variant="outline" disabled={busy} onClick={() => void act(() => respond({ inviteId: i._id, accept: false }), operationsCopy.rooms.invitationDeclined)}>{operationsCopy.rooms.decline}</Button></>}</div>) : <p>{operationsCopy.rooms.noRoomInvitations}</p>}{group && data.sentInvites.map((i: { _id: Id<"roomInvites">; studentId: Id<"students"> }) => <div className={styles.sectionRow} key={i._id}><span>{operationsText.rooms.sentInvitation(peers.find(p => p.studentId === i.studentId)?.legalName || peers.find(p => p.studentId === i.studentId)?.preferredName || operationsCopy.rooms.teammate)}</span>{!closed && <Button variant="outline" disabled={busy} onClick={() => void act(() => cancelInvite({ inviteId: i._id }), operationsCopy.rooms.invitationCanceled)}>{operationsCopy.rooms.cancel}</Button>}</div>)}</CardContent></Card>
    {error && <p role="alert" className="open-text">{error}</p>}{message && <p role="status" className="ready-text">{message}</p>}
  </section>;
}

/** Create a room in short steps: the room, a reason only when selection is closed, then a check before anything is saved. */
function CreateRoomWizard({ eventId, closed, onDone, onCancel }: { eventId: Id<"events">; closed: boolean; onDone: (text: string) => void; onCancel: () => void }) {
  const create = useMutation(api.rooms.adultCreateGroup);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"" | "Boys" | "Girls">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const kinds = closed ? ["room", "reason", "check"] as const : ["room", "check"] as const;
  const kind = kinds[step];
  const last = step === kinds.length - 1;
  const trimmedReason = reason.trim();
  const issue = kind === "room" ? roomFieldIssues(name, category).join(" ") : kind === "reason" && !trimmedReason ? createRoomCopy.reasonRequired : "";
  const heading = kind === "room" ? createRoomCopy.stepRoom : kind === "reason" ? createRoomCopy.stepReason : createRoomCopy.stepCheck;
  async function next() {
    if (issue) { setProblem(issue); return; }
    setProblem("");
    if (!last) { setStep(step + 1); return; }
    setBusy(true);
    try { await create({ eventId, name: name.trim(), category: category as "Boys" | "Girls", reason: trimmedReason || undefined }); onDone(operationsCopy.rooms.roomCreated); onCancel(); } catch (e) { setProblem(userFacingError(e, createRoomCopy.failed)); } finally { setBusy(false); }
  }
  return <StepWizard title={createRoomCopy.title} step={step + 1} total={kinds.length} heading={heading} onNext={() => void next()} nextLabel={last ? (busy ? createRoomCopy.creating : createRoomCopy.create) : createRoomCopy.next} onBack={step > 0 ? () => { setProblem(""); setStep(step - 1); } : undefined} onCancel={onCancel} busy={busy} error={problem}>
    {kind === "room" && <>
      <label className="grid gap-2 font-semibold">{createRoomCopy.roomLabel} <Input value={name} onChange={e => setName(e.target.value)} required maxLength={80} aria-invalid={problem.includes(roomHints.roomNameRequired) || undefined} /></label>
      <label className="grid gap-2 font-semibold">{createRoomCopy.typeLabel} <NativeSelect value={category} onChange={e => setCategory(e.target.value as "" | "Boys" | "Girls")} aria-invalid={problem.includes(roomTypeIssue("")) || undefined}><NativeSelectOption value="">{createRoomCopy.chooseType}</NativeSelectOption><NativeSelectOption value="Boys">{operationsCopy.rooms.boys}</NativeSelectOption><NativeSelectOption value="Girls">{operationsCopy.rooms.girls}</NativeSelectOption></NativeSelect></label>
    </>}
    {kind === "reason" && <label className="grid gap-2 font-semibold">{createRoomCopy.reasonLabel} <Input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} required aria-describedby="create-room-reason-help" aria-invalid={problem === createRoomCopy.reasonRequired || undefined} /><span id="create-room-reason-help" className="text-sm font-normal text-muted-foreground">{createRoomCopy.reasonHelp}</span></label>}
    {kind === "check" && <dl className="m-0">
      <ReviewRow label={createRoomCopy.roomLabel} value={name.trim()} onEdit={() => setStep(0)} disabled={busy} />
      <ReviewRow label={createRoomCopy.typeLabel} value={category === "Girls" ? operationsCopy.rooms.girls : operationsCopy.rooms.boys} onEdit={() => setStep(0)} disabled={busy} />
      {closed && <ReviewRow label={createRoomCopy.reasonLabel} value={trimmedReason} onEdit={() => setStep(1)} disabled={busy} />}
    </dl>}
  </StepWizard>;
}

function AdultRoom({ eventId }: { eventId: Id<"events"> }) {
  const data = useQuery(api.rooms.workspace, { eventId });
  const assign = useMutation(api.rooms.adultAssign);
  const unassign = useMutation(api.rooms.adultUnassign);
  const finalize = useMutation(api.rooms.finalize);
  const [creating, setCreating] = useState(false);
  // Each room keeps its own reason and fifth-student choice, so one correction never carries over to another room.
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [fifths, setFifths] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState<Record<string, string>>({});
  // A reason box appears only when the room needs one, or after Remove is pressed without a reason.
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const [moreOpen, setMoreOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<{ place: string; text: string; failed?: boolean } | null>(null);
  async function act(place: string, fn: () => Promise<unknown>, result: string) { setBusy(true); setError(""); setOutcome(null); try { await fn(); setOutcome({ place, text: result }); } catch (e) { setOutcome({ place, text: userFacingError(e), failed: true }); } finally { setBusy(false); } }
  const shown = (place: string) => outcome?.place === place ? (outcome.failed ? <p role="alert" className="open-text">{outcome.text}</p> : <p role="status" className="ready-text">{outcome.text}</p>) : null;
  if (!data) return <p role="status">{operationsCopy.rooms.loadingRoomRoster}</p>;
  const groups = data.groups as Group[];
  const students = data.students as Student[];
  const closed = data.event.roomDeadline !== null && Date.now() > data.event.roomDeadline;
  return <section className={styles.root} aria-label={operationsCopy.rooms.roomManagement}>
    <Card><CardHeader><CardTitle>{operationsCopy.rooms.roomAssignments}</CardTitle></CardHeader><CardContent className="space-y-4"><p>{closed ? operationsCopy.rooms.selectionClosed : operationsCopy.rooms.selectionOpen}{operationsCopy.rooms.fifthRule}</p>
      {creating ? <CreateRoomWizard eventId={eventId} closed={closed} onDone={text => setOutcome({ place: "create", text })} onCancel={() => setCreating(false)} /> : <div><Button type="button" onClick={() => { setOutcome(null); setCreating(true); }}>{createRoomCopy.open}</Button></div>}{shown("create")}
    </CardContent></Card>
    {groups.map(group => {
      const reason = (reasons[group._id] ?? "").trim();
      const fifth = fifths[group._id] ?? false;
      const state = { closed, finalized: group.finalized, memberCount: group.members.length };
      const showReason = assignNeedsReason(state) || !!asked[group._id];
      const assignProblem = assignIssue(state, !!target[group._id], reason);
      const finalizeProblem = group.finalized && !group.needsReview ? "" : finalizeIssue(state, reason);
      const pickerNote = assignPickerNote(group.category, students, group._id);
      return <Card key={group._id}><CardHeader><CardTitle>{group.name} · {group.category}</CardTitle></CardHeader><CardContent className="space-y-3"><p>{operationsText.rooms.occupancy(group.members.length, group.finalized ? operationsCopy.rooms.finalized : operationsCopy.rooms.open, group.needsReview ? operationsCopy.rooms.needsReviewSuffix : "", group.adultFifthException ? operationsCopy.rooms.fifthApprovedSuffix : "")}</p>
        {showReason && <div><label>{operationsCopy.rooms.correctionReason} <Input value={reasons[group._id] ?? ""} onChange={e => setReasons(r => ({ ...r, [group._id]: e.target.value }))} maxLength={500} aria-describedby={`room-reason-hint-${group._id}`} /></label><p id={`room-reason-hint-${group._id}`} className="muted">{roomHints.reasonWhen}</p></div>}
        <ul>{group.members.map(s => <li className={styles.sectionRow} key={s.studentId}><span>{s.name}</span><Button variant="outline" disabled={busy} onClick={() => { if (!reason) { setAsked(a => ({ ...a, [group._id]: true })); return } void act(group._id, () => unassign({ eventId, studentId: s.studentId, reason }), operationsText.rooms.removedFromRoom(s.name)) }}>{operationsCopy.rooms.remove}</Button></li>)}</ul>
        <div><Button type="button" variant="outline" aria-expanded={!!moreOpen[group._id]} aria-controls={`room-more-${group._id}`} onClick={() => setMoreOpen(m => ({ ...m, [group._id]: !m[group._id] }))}>More options</Button>{moreOpen[group._id] && <div id={`room-more-${group._id}`}><label className="checkbox-label"><Checkbox checked={fifth} onCheckedChange={checked => setFifths(f => ({ ...f, [group._id]: checked }))} /> {operationsCopy.rooms.authorizeFifth}</label></div>}</div>
        <div className="flex flex-wrap items-end gap-2"><label>{operationsCopy.rooms.assignOrMove} <NativeSelect value={target[group._id] ?? ""} onChange={e => setTarget(t => ({ ...t, [group._id]: e.target.value }))}><NativeSelectOption value="">{operationsCopy.rooms.chooseStudent}</NativeSelectOption>{students.filter(s => s.category === group.category && s.groupId !== group._id).map(s => <NativeSelectOption value={s.studentId} key={s.studentId}>{s.name}{s.groupId ? operationsCopy.rooms.moveSuffix : s.requestedAssignment ? operationsCopy.rooms.requestedSuffix : ""}</NativeSelectOption>)}</NativeSelect></label>{pickerNote && <p className="muted w-full">{pickerNote}</p>}<Button disabled={busy || !target[group._id] || !!assignProblem} aria-describedby={`assign-hint-${group._id}`} onClick={() => void act(group._id, () => assign({ groupId: group._id, studentId: target[group._id] as Id<"students">, allowFifth: fifth, reason: reason || undefined }), operationsCopy.rooms.roomAssignmentSaved)}>{operationsCopy.rooms.assign}</Button>{group.finalized && !group.needsReview ? <span className="badge badge-ready w-fit">{operationsCopy.rooms.finalized}</span> : <ConfirmAction title="Finalize this room?" confirmLabel="Finalize" disabled={busy || !!finalizeProblem} description={`Finalize ${group.name} with ${studentCount(group.members.length)}: ${group.members.map(member => member.name).join(", ")}? Students cannot change a finalized room. Adult corrections remain available.${reason ? ` Reason: ${reason}` : ""}`} onConfirm={async () => { await finalize({ groupId: group._id, expectedMembers: group.members.map(member => member.studentId), allowFifth: fifth || group.adultFifthException, reason: reason || undefined }); setTarget(t => ({ ...t, [group._id]: "" })); setOutcome({ place: group._id, text: operationsCopy.rooms.roomFinalized }) }}>{operationsCopy.rooms.reviewAndFinalize}</ConfirmAction>}</div><p id={`assign-hint-${group._id}`} className="muted">{target[group._id] ? assignProblem : finalizeProblem}</p>{shown(group._id)}</CardContent></Card>;
    })}
    <Card><CardHeader><CardTitle>{operationsCopy.rooms.studentsAwaitingPlacement}</CardTitle></CardHeader><CardContent>{students.filter(s => !s.groupId).length ? <ul>{students.filter(s => !s.groupId).map(s => <li key={s.studentId}>{s.name} · {s.category ?? operationsCopy.rooms.categoryMissing}{s.requestedAssignment ? operationsCopy.rooms.requestedSuffix : ""}</li>)}</ul> : <p>{students.length?operationsCopy.rooms.allConfirmedStudentsArePlaced:'No students to place yet.'}</p>}</CardContent></Card>
    {error && <p role="alert" className="open-text">{error}</p>}
  </section>;
}

export function RoomOperations({ eventId, mode }: { eventId: Id<"events">; mode: "student" | "adult" }) {
  const standalone = useLocation().pathname.endsWith('/rooming');
  const detail = useQuery(api.app.eventDetail, { eventId });
  const viewer = useQuery(api.app.viewer, {});
  if (!detail || !viewer) return <p role="status">{operationsCopy.rooms.loadingRoomSelection}</p>;
  const enrollmentPending = detail.event.enrollmentState === "running" || detail.event.enrollmentState === "failed";
  return <>{standalone && <><Link className="back" to={`/events/${eventId}`}>← Event</Link><h1>{detail.event.name} · Rooms</h1></>}{enrollmentPending ? <EventEnrollmentNotice eventId={eventId} staff={mode === "adult"} coach={viewer.user?.role === "coach"} failed={detail.event.enrollmentState === "failed"}/> : mode === "student" ? <StudentRoom eventId={eventId} /> : <AdultRoom eventId={eventId} />}</>;
}
