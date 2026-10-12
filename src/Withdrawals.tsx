import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Checkbox } from './components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'

const usd = (cents:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)
const message = (error:unknown) => error instanceof Error ? error.message : String(error)
const key = () => crypto.randomUUID()

export function StudentWithdrawal({eventId,studentId}:{eventId:Id<'events'>;studentId:Id<'students'>}) {
  const data = useQuery(api.withdrawals.withdrawalPreview,{eventId,studentId})
  const request = useMutation(api.withdrawals.requestWithdrawal)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const submit = async () => {setBusy(true);setError('');try{await request({eventId,idempotencyKey:key()})}catch(e){setError(message(e))}finally{setBusy(false)}}
  if (!data) return <p>Loading withdrawal status…</p>
  if (data.status === 'withdrawn') return <p role="status">Withdrawal approved. Your place has been released.</p>
  if (!data.allowWithdrawal) return null
  return <section className="card" aria-labelledby="withdraw-title"><h2 id="withdraw-title">Withdrawal</h2>
    {data.requestStatus === 'pending' ? <p role="status">Your withdrawal request is awaiting Coach or Travel Lead review. Your participation status and any reserved room place remain unchanged until a decision.</p> : <><p>Request to leave {data.eventName}. Your participation status and any reserved room place remain unchanged until a decision.</p>{data.requestStatus === 'denied' && <p role="status">A previous request was denied. You may submit another request.</p>}<Button className="button button-outline" disabled={busy} onClick={()=>void submit()}>{busy?'Submitting…':'Request withdrawal'}</Button></>}
    {error && <p role="alert" className="open-text">{error}</p>}
  </section>
}

function Review({requestId,eventId,studentId}:{requestId:Id<'withdrawalRequests'>;eventId:Id<'events'>;studentId:Id<'students'>}) {
  const data = useQuery(api.withdrawals.withdrawalPreview,{eventId,studentId})
  const decide = useMutation(api.withdrawals.reviewWithdrawal)
  const [choice,setChoice] = useState<'full'|'retain'|'partial'|'deny'>('full')
  const [partial,setPartial] = useState('')
  const [cancelMain,setCancelMain] = useState(false)
  const [reason,setReason] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  if (!data) return <section className="card"><p>Loading withdrawal review…</p></section>
  const paid = data.paidMainCents + data.paidExtraCents
  const parsed = /^\d+(\.\d{1,2})?$/.test(partial) ? Math.round(Number(partial)*100) : NaN
  const returned = choice === 'full' ? paid : choice === 'partial' ? parsed : 0
  const valid = choice !== 'partial' || Number.isSafeInteger(parsed) && parsed > 0 && parsed <= paid
  const submit = async (event:FormEvent) => {event.preventDefault();if (!valid || reason.trim().length < 8) return;setBusy(true);setError('');try{await decide({requestId,decision:choice,...(choice==='partial'?{returnCents:parsed}:{}),cancelUnpaidMain:choice==='deny'?false:cancelMain,reason:reason.trim(),expectedRevision:data.revision})}catch(e){setError(message(e))}finally{setBusy(false)}}
  return <section className="card" aria-labelledby={`withdraw-review-${requestId}`}><h2 id={`withdraw-review-${requestId}`}>{data.studentName} · {data.eventName}</h2>
    <p className="muted">Participation status and any reserved room place remain unchanged while this request is pending.</p>
    <div className="table-wrap"><table><thead><tr><th>Charge</th><th>Category</th><th>Charged</th><th>Paid</th><th>Unpaid</th></tr></thead><tbody>{data.charges.map(c=><tr key={c.id}><td>{c.label}</td><td>{c.category==='extra'?'Extra':'Main event/travel'}</td><td>{usd(c.chargedCents)}</td><td>{usd(c.paidCents)}</td><td>{usd(c.unpaidCents)}</td></tr>)}</tbody></table></div>
    <p>Paid: main {usd(data.paidMainCents)} · extras {usd(data.paidExtraCents)} · total {usd(paid)}</p>
    <p>Unpaid: main {usd(data.unpaidMainCents)} · extras {usd(data.unpaidExtraCents)}</p>
    <form onSubmit={e=>void submit(e)} className="form-grid">
      <label>Decision <NativeSelect value={choice} onChange={e=>setChoice(e.target.value as typeof choice)}><NativeSelectOption value="full">Approve · return all paid</NativeSelectOption><NativeSelectOption value="retain">Approve · retain paid as non-refundable</NativeSelectOption><NativeSelectOption value="partial">Approve · return a chosen amount</NativeSelectOption><NativeSelectOption value="deny">Deny request</NativeSelectOption></NativeSelect></label>
      {choice==='partial' && <label>Amount to return (USD) <Input type="text" inputMode="decimal" value={partial} onChange={e=>setPartial(e.target.value)} required aria-invalid={!valid} placeholder="0.00"/></label>}
      {choice!=='deny' && <label className="checkbox-label"><Checkbox checked={cancelMain} onCheckedChange={checked=>setCancelMain(checked)}/> Cancel unpaid main event/travel balance</label>}
      {choice!=='deny' && <p role="status">Return to student account: {valid?usd(returned):'Enter a valid amount'} · retain paid: {valid?usd(paid-returned):'—'}. Unpaid extras {usd(data.unpaidExtraCents)} will be canceled. Returned funds automatically apply to other outstanding charges by priority; any remainder stays available in its original payment or fundraising source. This is not a cash or check payout.</p>}
      {choice!=='deny' && <p className="muted">Unpaid main balance {cancelMain?'will be canceled':'will remain owed'}.</p>}
      <label>Explanation <Input value={reason} onChange={e=>setReason(e.target.value)} minLength={8} maxLength={1000} required/></label>
      <Button className="button button-primary" type="submit" disabled={busy || !valid || reason.trim().length<8}>{busy?'Saving…':choice==='deny'?'Deny withdrawal':'Approve withdrawal'}</Button>
      {error && <p role="alert" className="open-text">{error}</p>}
    </form>
  </section>
}

export function WithdrawalQueue() {
  const queue = useQuery(api.withdrawals.pendingWithdrawals,{})
  if (!queue) return <section className="card"><h2>Withdrawal requests</h2><p>Loading requests…</p></section>
  return <section aria-labelledby="withdraw-queue-title"><h2 id="withdraw-queue-title">Withdrawal requests · {queue.length}</h2>{queue.length===0?<p>No requests are waiting.</p>:<div className="two-col">{queue.map(row=><Review key={row.requestId} {...row}/>)}</div>}</section>
}

export function ChargeEditor({studentId}:{studentId:Id<'students'>}) {
  const events = useQuery(api.app.listEvents,{})
  const create = useMutation(api.finance.createCharge)
  const [eventId,setEventId] = useState('')
  const [category,setCategory] = useState<'main'|'extra'>('extra')
  const [label,setLabel] = useState('')
  const [amount,setAmount] = useState('')
  const [priority,setPriority] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [saved,setSaved] = useState(false)
  const pending = useRef<{key:string|null;busy:boolean}>({key:null,busy:false})
  const changed = () => {pending.current.key=null;setError('');setSaved(false)}
  const cents = /^\d+(\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount)*100) : NaN
  const priorityNumber = Number(priority)
  const valid = label.trim().length>0 && Number.isSafeInteger(cents) && cents>0 && Number.isSafeInteger(priorityNumber) && priority.trim()!==''
  const submit = async (event:FormEvent) => {event.preventDefault();if(!valid||pending.current.busy)return;const idempotencyKey=pending.current.key??key();pending.current.key=idempotencyKey;pending.current.busy=true;setBusy(true);setError('');setSaved(false);try{await create({studentId,...(eventId?{eventId:eventId as Id<'events'>,category}:{}),label:label.trim(),amountCents:cents,priority:priorityNumber,idempotencyKey});pending.current.key=null;setLabel('');setAmount('');setSaved(true)}catch(e){setError(message(e))}finally{pending.current.busy=false;setBusy(false)}}
  return <section className="card" aria-labelledby="charge-editor-title"><h2 id="charge-editor-title">Add a charge</h2><p>Classify event charges as the main event/travel fee or an extra, such as lunch. Outstanding credits will apply by priority.</p><form className="form-grid" onSubmit={e=>void submit(e)}>
    <label>Event <NativeSelect value={eventId} disabled={busy} onChange={e=>{changed();setEventId(e.target.value)}}><NativeSelectOption value="">Standalone charge</NativeSelectOption>{events?.map(row=><NativeSelectOption key={row.event._id} value={row.event._id}>{row.event.name}</NativeSelectOption>)}</NativeSelect></label>
    {eventId && <label>Fee category <NativeSelect value={category} disabled={busy} onChange={e=>{changed();setCategory(e.target.value as typeof category)}}><NativeSelectOption value="main">Main event/travel</NativeSelectOption><NativeSelectOption value="extra">Extra</NativeSelectOption></NativeSelect></label>}
    <label>Charge label <Input value={label} disabled={busy} maxLength={150} onChange={e=>{changed();setLabel(e.target.value)}} required placeholder="Lunch"/></label>
    <label>Amount (USD) <Input type="text" inputMode="decimal" value={amount} disabled={busy} onChange={e=>{changed();setAmount(e.target.value)}} required placeholder="0.00"/></label>
    <label>Priority <Input type="number" step="1" value={priority} disabled={busy} onChange={e=>{changed();setPriority(e.target.value)}} required/></label>
    <Button className="button button-primary" type="submit" disabled={busy||!valid}>{busy?'Saving…':'Add charge'}</Button>
    {saved && <p role="status">Charge recorded.</p>}{error && <p role="alert" className="open-text">{error}</p>}
  </form></section>
}
