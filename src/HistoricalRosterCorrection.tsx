import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import styles from './SeasonAdministration.module.css'

type Preview={studentId:Id<'students'>;legalName:string;preferredName:string;firstName:string|null;lastName:string|null;structuredNameReviewed:boolean;subteam:string;revision:number;fingerprint:string}
function RosterCorrectionForm({preview,grantId,onReload}:{preview:Preview;grantId:Id<'historicalCorrectionSessions'>;onReload:()=>void}){
 const [baseline]=useState(preview)
 const [legalName,setLegalName]=useState(baseline.legalName);const [preferredName,setPreferredName]=useState(baseline.preferredName)
 const [firstName,setFirstName]=useState(baseline.firstName??'');const [lastName,setLastName]=useState(baseline.lastName??'');const [subteam,setSubteam]=useState(baseline.subteam)
 const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState(false)
 const save=useMutation(api.historicalRoster.correct)
 const stale=baseline.fingerprint!==preview.fingerprint
 const changed=legalName.trim()!==baseline.legalName||preferredName.trim()!==baseline.preferredName||firstName.trim()!==(baseline.firstName??'')||lastName.trim()!==(baseline.lastName??'')||subteam.trim()!==baseline.subteam
 const submit=async()=>{if(busy||stale||saved)return;setBusy(true);setError('');try{const structured=firstName.trim()!==(baseline.firstName??'')||lastName.trim()!==(baseline.lastName??'');await save({correctionSessionId:grantId,studentId:baseline.studentId,expectedRevision:baseline.revision,expectedFingerprint:baseline.fingerprint,...(legalName.trim()!==baseline.legalName?{legalName}:{}),...(preferredName.trim()!==baseline.preferredName?{preferredName}:{}),...(structured?{firstName,lastName}:{}),...(subteam.trim()!==baseline.subteam?{subteam}:{}),reason});setSaved(true);}catch(e){setError(e instanceof Error?e.message:'Unable to save historical correction.')}finally{setBusy(false)}}
 return <section className={styles.section}><h4>Historical name and subteam correction</h4><p>Review changes to this season's profile. Each correction records your identity, time, reason and before/after values.</p><p>Current record: {baseline.legalName} · Preferred: {baseline.preferredName} · Subteam: {baseline.subteam||'Unassigned'}</p>
 <div className={styles.fields}><label className={styles.field}>Legal name<Input value={legalName} maxLength={160} disabled={busy||stale||saved} onChange={e=>setLegalName(e.target.value)}/></label><label className={styles.field}>Preferred name<Input value={preferredName} maxLength={80} disabled={busy||stale||saved} onChange={e=>setPreferredName(e.target.value)}/></label><label className={styles.field}>Reviewed first name<Input value={firstName} maxLength={100} disabled={busy||stale||saved} onChange={e=>setFirstName(e.target.value)}/></label><label className={styles.field}>Reviewed last name<Input value={lastName} maxLength={100} disabled={busy||stale||saved} onChange={e=>setLastName(e.target.value)}/></label><label className={styles.field}>Subteam<Input value={subteam} maxLength={100} disabled={busy||stale||saved} onChange={e=>setSubteam(e.target.value)}/></label></div>
 <p>Reviewed first and last names are entered together. Original attendance, permission signatures and account links remain attached to their original IDs. Corrections apply only to this historical profile.</p>
 <label className={styles.field}>Correction reason<Input value={reason} maxLength={1000} disabled={busy||stale||saved} onChange={e=>setReason(e.target.value)}/></label>
 {saved?<p role="status">Historical roster correction saved.</p>:stale&&<p className={styles.error} role="status">Historical profile changed. Review the latest record before saving.</p>}
 <div className={styles.actions}><Button variant="outline" disabled={busy} onClick={onReload}>Review latest / start another correction</Button><Button disabled={busy||stale||saved||!changed||reason.trim().length<8||!legalName.trim()||!preferredName.trim()} onClick={()=>void submit()}>Save audited roster correction</Button></div>{error&&<p className={styles.error} role="alert">{error}</p>}
 </section>
}
export function HistoricalRosterCorrection({seasonId,studentId,grantId}:{seasonId:Id<'seasons'>;studentId:Id<'students'>;grantId:Id<'historicalCorrectionSessions'>}){
 const preview=useQuery(api.historicalRoster.preview,{seasonId,studentId});const [version,setVersion]=useState(0)
 if(!preview)return <p role="status">Loading historical profile…</p>
 return <RosterCorrectionForm key={`${studentId}:${grantId}:${version}`} preview={preview} grantId={grantId} onReload={()=>setVersion(v=>v+1)}/>
}
