import { userFacingError } from '@/lib/error-message'
import { operationsCopy, operationsText } from '../../lib/operations-copy'
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import styles from "./Operations.module.css";
import { WholeTeamLeaveNotices } from "../../Withdrawals";
import { ConfirmAction } from "../../ConfirmAction";
import { EventCalendarOperations } from './EventCalendarOperations'
import { EventAudienceOperations } from './EventAudienceOperations'
import { EventMentorsSection } from './EventMentorsSection'
import { SignupQuestionsEditor } from '../event-setup/SignupQuestionsEditor'
import { ShiftsEditor, type ShiftSettings } from '../event-setup/ShiftsEditor'
import { SignupResponses } from '../event-setup/SignupResponses'
import { chicagoInputTime, parseChicagoInput } from '../../lib/chicago-time'
import { HelpToggle } from './HelpToggle'

type Row = { participantId: string; studentId: Id<"students">; name: string; status: string; signedUpAt: number; active: boolean };
type WithdrawnRow = Row & { moneyDecision: boolean; inReview: boolean };
type Requirement = { key: string; label: string; instructions?: string; url?: string; dueAt?: number };

function when(value?: number | null) { return value ? new Date(value).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : operationsCopy.event.notSet; }
/** Deadline inputs are in Central Time, like the rest of the event page. */
function centralInput(value?: number | null) { return value ? chicagoInputTime(value) : ""; }
function parseCentral(value: string) { return value ? parseChicagoInput(value) : null; }

export function EventOperations({ eventId, coach=false }: { eventId: Id<"events">; coach?:boolean }) {
  const data = useQuery(api.eventOperations.workspace, { eventId });
  const review = useMutation(api.eventOperations.reviewSignup);
  const putBack = useMutation(api.withdrawals.putBackOnEvent);
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
  const [outreach, setOutreach] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [url, setUrl] = useState("");
  const [dueAt, setDueAt] = useState("");
  // An empty Signup questions or Shifts section is hidden; "Add …" shows it and opens it.
  const [adding, setAdding] = useState<{ questions: boolean; shifts: boolean }>({ questions: false, shifts: false });
  const [openSection, setOpenSection] = useState<string | null>(null);
  useEffect(() => { if (!openSection) return; const section = document.getElementById(openSection); if (section instanceof HTMLDetailsElement) { section.open = true; section.scrollIntoView({ block: "nearest" }); } setOpenSection(null); }, [openSection]);

  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await fn(); setSuccess(message); } catch (e) { setError(userFacingError(e)); } finally { setBusy(false); }
  }
  if (!data) return <p role="status">{operationsCopy.event.loadingEventOperations}</p>;
  const event = data.event;
  const canEdit = data.canEdit;
  const capacityValue = capacity ?? (event.capacity?.toString() ?? "");
  const signupValue = signupDeadline ?? centralInput(event.signupClosesAt);
  const roomValue = roomDeadline ?? centralInput(event.roomDeadline);
  const participants = data.participants as Row[];
  const waitlist = data.waitlist as Row[];
  const withdrawn = (data.withdrawn ?? []) as WithdrawnRow[];
  const requirements = data.requirements as Requirement[];
  const shiftSettings = data.shiftSettings as ShiftSettings;
  const pending = participants.filter(p => p.status === "pending");
  const confirmed = participants.filter(p => p.status === "confirmed");
  const questionCount = data.questionCount as number;
  const hasQuestions = questionCount > 0;
  const usesShifts = shiftSettings.shiftsEnabled || shiftSettings.shiftCount > 0;
  const showQuestions = hasQuestions || adding.questions;
  const showShifts = usesShifts || adding.shifts;
  const required = event.signupMode === "assigned";
  // Mirrors putBackOnEvent: a Travel Lead can put students back only on events a Coach did not assign.
  const canPutBack = canEdit || !required;
  // Required events list who was assigned automatically; optional ones count who chose to sign up.
  const countLine = required ? operationsText.event.assigned(data.reserved) : operationsText.event.signedUp(data.reserved, event.capacity, data.available);
  // A Travel Lead can only mark an optional event as Outreach (required group events stay with the Coach), so the
  // section is hidden when nothing in it applies to the viewer.
  const savedOutreach = (event as { isOutreach?: boolean }).isOutreach ?? false;
  const outreachValue = outreach ?? savedOutreach;
  const showSettings = canEdit || !required || savedOutreach;
  const settingsSummary = !required ? operationsText.event.signupCloses(event.signupClosesAt ? when(event.signupClosesAt) : null) : outreachValue ? operationsCopy.event.outreachEvent : "";
  const submitSettings = (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) { if (outreach !== null) void act(() => settings({ eventId, isOutreach: outreach }), operationsCopy.event.eventSettingsSaved); return; }
    const parsed = capacityValue.trim() ? Number(capacityValue) : null;
    const signup = parseCentral(signupValue);
    const room = parseCentral(roomValue);
    if (parsed !== null && (!Number.isSafeInteger(parsed) || parsed < 1) || signup !== null && !Number.isFinite(signup) || room !== null && !Number.isFinite(room)) { setError(operationsCopy.event.enterValidCapacityAndDeadlines); return; }
    void act(() => settings({ eventId, capacity: parsed, ...(event.signupMode !== "assigned" ? { signupClosesAt: signup } : {}), ...(event.overnight && event.roomingEnabled ? { roomDeadline: room } : {}), ...(outreach !== null ? { isOutreach: outreach } : {}) }), operationsCopy.event.eventSettingsSaved);
  };
  const submitRequirement = (e: FormEvent) => {
    e.preventDefault();
    const due = parseCentral(dueAt);
    if (due !== null && !Number.isFinite(due)) { setError(operationsCopy.event.enterAValidDueDate); return; }
    void act(async () => { await saveRequirement({ eventId, key: key.trim(), label: label.trim(), instructions: instructions.trim(), url: url.trim(), dueAt: due }); setKey(""); setLabel(""); setInstructions(""); setUrl(""); setDueAt(""); }, operationsCopy.event.requirementSaved);
  };
  return <section aria-label={operationsCopy.event.eventOperations} className={styles.root}>
    <details id="event-participants" className={styles.disclosure}><summary><strong>{operationsCopy.event.signupsAndCapacity}</strong><span>{countLine}</span></summary><div className={styles.disclosureBody}><Card><CardHeader><CardTitle>{operationsCopy.event.signupsAndCapacity}</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className={styles.statusLine}><span>{countLine}</span>{event.signupMode !== "assigned" && <span className="muted">· {operationsText.event.signupCloses(event.signupClosesAt ? when(event.signupClosesAt) : null)}</span>}<HelpToggle label={operationsCopy.event.signupRulesLabel}>{operationsCopy.event.signupRules}</HelpToggle></p>
      {pending.length > 0 && <div><h3 className="font-semibold">{operationsCopy.event.awaitingApproval}</h3><div className={styles.sectionRows}>{pending.map(p => <div className={styles.sectionRow} key={p.participantId}><span className="min-w-40">{p.name}</span><Button disabled={busy} onClick={() => void act(() => review({ eventId, studentId: p.studentId, decision: "approve" }), operationsText.event.approved(p.name))}>{operationsCopy.event.approve}</Button><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void act(() => review({ eventId, studentId: p.studentId, decision: "decline", reason: reason.trim() }), operationsText.event.declined(p.name))}>{operationsCopy.event.decline}</Button></div>)}</div></div>}
      {waitlist.length > 0 && <div><h3 className="font-semibold">{operationsCopy.event.waitlist}</h3><ol className={styles.sectionRows}>{waitlist.map((p, i) => <li className={styles.sectionRow} key={p.participantId}><span className="min-w-40">{i + 1}. {p.name} · {when(p.signedUpAt)}</span><Button disabled={busy || i !== 0 || data.available === 0} onClick={() => void act(() => review({ eventId, studentId: p.studentId, decision: "promote" }), operationsText.event.promoted(p.name))}>{operationsCopy.event.promote}</Button><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void act(() => review({ eventId, studentId: p.studentId, decision: "decline", reason: reason.trim() }), operationsText.event.removedFromWaitlist(p.name))}>{operationsCopy.event.decline}</Button></li>)}</ol></div>}
      {(pending.length > 0 || waitlist.length > 0) && <label className="block">{operationsCopy.event.reasonForDeclining} <Input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>}
      {confirmed.length > 0 && <p>{operationsCopy.event.confirmed} {confirmed.map(p => p.name).join(", ")}</p>}
      {withdrawn.length > 0 && <div><h3 className="font-semibold">{operationsCopy.event.withdrawn}</h3><div className={styles.sectionRows}>{withdrawn.map(p => <div className={styles.sectionRow} key={p.participantId}><span className="min-w-40">{p.name}{p.moneyDecision && <span className="muted block">{operationsCopy.event.moneyNotReversed}</span>}</span>{p.inReview ? <span className="muted">{operationsCopy.event.withdrawalInReview}</span> : canPutBack && <ConfirmAction disabled={busy} description={operationsText.event.confirmPutBack(p.name, p.moneyDecision)} onConfirm={async () => { setError(""); setSuccess(""); await putBack({ eventId, studentId: p.studentId }); setSuccess(operationsText.event.putBack(p.name)); }}>{operationsCopy.event.putBackOnEvent}</ConfirmAction>}</div>)}</div></div>}
      {event.assignmentScope==="wholeTeam"&&<WholeTeamLeaveNotices eventId={eventId} coach={coach}/>}
    </CardContent></Card></div></details>
    <EventMentorsSection eventId={eventId} open={!event.archived && !event.cancelled}/>
    <EventAudienceOperations event={event}/>
    <EventCalendarOperations eventId={eventId} coach={canEdit} event={event}/>
    {showSettings && <details className={styles.disclosure}><summary><strong>{operationsCopy.event.eventSettings}</strong>{settingsSummary && <span>{settingsSummary}</span>}</summary><div className={styles.disclosureBody}><Card><CardContent><form className="form-grid" onSubmit={submitSettings}>
      {canEdit && event.signupMode !== "assigned" && <><label>{operationsCopy.event.capacityNoLimit} <Input type="number" min="1" max="500" value={capacityValue} onChange={e => setCapacity(e.target.value)} /></label><label>{operationsCopy.event.signupClosesLocal} <Input type="datetime-local" value={signupValue} onChange={e => setSignupDeadline(e.target.value)} /></label></>}
      {canEdit && event.overnight && event.roomingEnabled && <label>{operationsCopy.event.roomDeadlineLocal} <Input type="datetime-local" value={roomValue} onChange={e => setRoomDeadline(e.target.value)} /></label>}
      <div><label className="checkbox-label"><Checkbox checked={outreachValue} onCheckedChange={checked => setOutreach(checked)} />{operationsCopy.event.outreachEvent}</label>
      <p className="muted">{operationsCopy.event.outreachEventHint}</p></div>
      <Button type="submit" disabled={busy}>{operationsCopy.event.saveSettings}</Button></form></CardContent></Card></div></details>}
    {!canEdit && requirements.length > 0 && <section aria-label={operationsCopy.event.customRequirements}><h3>{operationsCopy.event.customRequirements}</h3><ul>{requirements.map(r => <li key={r.key}>{r.label}{r.dueAt ? operationsText.event.due(when(r.dueAt)) : ''}</li>)}</ul></section>}
    {canEdit && <details id="event-requirements" className={styles.disclosure}><summary><strong>{operationsCopy.event.customRequirements}</strong>{requirements.length > 0 && <span>{requirements.length} custom requirement{requirements.length === 1 ? '' : 's'}</span>}</summary><div className={styles.disclosureBody}><Card><CardHeader><CardTitle>{operationsCopy.event.customRequirements}</CardTitle></CardHeader><CardContent className="space-y-4"><div className={styles.sectionRows}>{requirements.map(r => <div className={styles.sectionRow} key={r.key}><span className="min-w-40">{r.label}{r.dueAt ? operationsText.event.due(when(r.dueAt)) : ""}</span><Button variant="outline" disabled={busy} onClick={() => { setKey(r.key); setLabel(r.label); setInstructions(r.instructions ?? ""); setUrl(r.url ?? ""); setDueAt(centralInput(r.dueAt)); }}>{operationsCopy.event.edit}</Button><Button variant="outline" disabled={busy} onClick={() => void act(() => removeRequirement({ eventId, key: r.key }), operationsText.event.removedRequirement(r.label))}>{operationsCopy.event.remove}</Button></div>)}</div><form className="form-grid" onSubmit={submitRequirement}><label>{operationsCopy.event.requirementKey} <Input value={key} onChange={e => setKey(e.target.value)} pattern="[a-zA-Z0-9_-]{1,32}" aria-describedby="requirement-short-name-help" required /></label><p id="requirement-short-name-help" className="muted">A short code, like lunch-order. Use up to 32 letters, numbers, - or _. Do not change it later.</p><label>{operationsCopy.event.requirementLabel} <Input value={label} onChange={e => setLabel(e.target.value)} required /></label><label>{operationsCopy.event.requirementInstructions} <Input value={instructions} onChange={e => setInstructions(e.target.value)} /></label><label>{operationsCopy.event.requirementLink} <Input type="url" value={url} onChange={e => setUrl(e.target.value)} /></label><label>{operationsCopy.event.requirementDue} <Input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label><Button type="submit" disabled={busy}>{operationsCopy.event.saveRequirement}</Button></form></CardContent></Card></div></details>}
    {error && <p role="alert" className="open-text">{error}</p>}{success && <p role="status" className="ready-text">{success}</p>}
    {(!showQuestions || !showShifts) && <div className="action-row">
      {!showQuestions && <Button type="button" variant="outline" onClick={() => { setAdding(prior => ({ ...prior, questions: true })); setOpenSection("event-questions"); }}>{operationsCopy.event.addQuestions}</Button>}
      {!showShifts && <Button type="button" variant="outline" onClick={() => { setAdding(prior => ({ ...prior, shifts: true })); setOpenSection("event-shifts"); }}>{operationsCopy.event.addShifts}</Button>}
    </div>}
    {showQuestions && <SignupQuestionsEditor eventId={eventId} questionCount={questionCount} />}
    {showShifts && <ShiftsEditor eventId={eventId} event={event} settings={shiftSettings} />}
    {(hasQuestions || usesShifts) && <SignupResponses eventId={eventId} eventName={event.name} usesShifts={usesShifts} />}
  </section>;
}
