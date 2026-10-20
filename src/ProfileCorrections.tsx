import { userFacingError } from '@/lib/error-message'
import { useState, type FormEvent } from 'react'
import { useMutation, usePaginatedQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import type { Id } from '../convex/_generated/dataModel'
import { api } from '../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Textarea } from './components/ui/textarea'
import { Button } from './components/ui/button'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { correctionCopy as copy } from './lib/correction-copy'

export function RequestProfileCorrection({studentId, revision, ownProfile=false}:{studentId:Id<'students'>;revision:number;ownProfile?:boolean}) {
  const request = useMutation(api.profileSetup.requestCorrection)
  const [field,setField] = useState<'roomCategory'|'legalName'|'account'>('roomCategory')
  const [note,setNote] = useState('')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');try{await request({studentId,expectedRevision:revision,field,note});setNote('');setMessage(copy.sent)}catch(error){setMessage(userFacingError(error, copy.failed))}finally{setBusy(false)}}
  return <Card><CardHeader><CardTitle>{copy.requestTitle}</CardTitle></CardHeader><CardContent><p>{ownProfile?copy.ownExplanation:copy.explanation}</p><form className="form-grid" onSubmit={event=>void submit(event)}>
    <label>{copy.field}<NativeSelect value={field} onChange={event=>setField(event.target.value as typeof field)}>{Object.entries(copy.fields).map(([value,label])=><NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></label>
    <label>{copy.note}<Textarea required maxLength={1000} value={note} onChange={event=>setNote(event.target.value)}/></label>
    <Button disabled={busy} type="submit">{busy?copy.saving:copy.request}</Button>{message&&<p role="status">{message}</p>}
  </form></CardContent></Card>
}

type Correction = FunctionReturnType<typeof api.profileSetup.corrections>["page"][number]
export function ProfileCorrectionQueue() {
  const { results, status, loadMore } = usePaginatedQuery(api.profileSetup.corrections, {}, {initialNumItems: 20})
  return <section><h2>{copy.queue}</h2>{status === 'LoadingFirstPage' ? <p role="status">{copy.loading}</p> : <>{results.length === 0 && status === 'Exhausted' && <p>{copy.empty}</p>}{results.map(row => <CorrectionReview key={`${row.requestId}:${row.revision}`} row={row}/>)}{status !== 'Exhausted' && <Button variant="outline" disabled={status === 'LoadingMore'} onClick={() => loadMore(20)}>{status === 'LoadingMore' ? copy.loadingMore : copy.loadMore}</Button>}</>}</section>
}
function CorrectionReview({row}:{row:Correction}){
  const correct=useMutation(api.profileSetup.correct),deny=useMutation(api.profileSetup.denyCorrection)
  const [value,setValue]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function decide(approved:boolean){setBusy(true);setError('');try{if(approved&&row.field!=='account'){await correct({studentId:row.studentId,requestId:row.requestId,expectedRevision:row.revision,reason,...(row.field==='roomCategory'?{roomCategory:value as 'Boys'|'Girls'}:{legalName:value})})}else await deny({requestId:row.requestId,expectedRevision:row.revision,reason})}catch(cause){setError(userFacingError(cause, copy.failed))}finally{setBusy(false)}}
  return <Card><CardHeader><CardTitle>{row.studentName} · {copy.fields[row.field]}</CardTitle></CardHeader><CardContent><p>{row.note}</p><form className="form-grid" onSubmit={event=>{event.preventDefault();void decide(true)}}>
    {row.field==='account'?<p>{copy.accountReview}</p>:<label>{copy.newValue}{row.field==='roomCategory'?<NativeSelect required value={value} onChange={event=>setValue(event.target.value)}><NativeSelectOption value="">{copy.choose}</NativeSelectOption><NativeSelectOption value="Boys">{copy.boys}</NativeSelectOption><NativeSelectOption value="Girls">{copy.girls}</NativeSelectOption></NativeSelect>:<Input required maxLength={160} value={value} onChange={event=>setValue(event.target.value)}/>}</label>}
    <label>{copy.reason}<Textarea required maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/></label>
    <div className="actions">{row.field!=='account'&&<Button type="submit" disabled={busy||!value||!reason.trim()}>{copy.approve}</Button>}<Button variant="outline" type="button" disabled={busy||!reason.trim()} onClick={()=>void decide(false)}>{copy.deny}</Button></div>
    {error&&<p role="alert">{error}</p>}
  </form></CardContent></Card>
}
