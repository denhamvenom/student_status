import type {ReactNode} from 'react'
import {Button} from './components/ui/button'
import {liveCopy} from './lib/live-copy'
export function PendingJoinView({submitted,declined=false,busy,signOutError,onSignOut,children}:{submitted:boolean;declined?:boolean;busy:boolean;signOutError:string;onSignOut:()=>void;children:ReactNode}){
 return <div className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt={liveCopy.brand.imageAlt}/></div><div className="signin-content"><p className="eyebrow">{liveCopy.brand.team}</p><h1>{declined?'Request not approved':submitted?liveCopy.join.waiting:liveCopy.join.title}</h1>{declined?<section className="card"><p>Your request was not approved. Ask a Coach for help.</p></section>:submitted?<section className="card"><p>{liveCopy.join.waitingDetail}</p></section>:children}<p className="muted">{liveCopy.join.wrongAccount}</p><Button type="button" variant="outline" disabled={busy} onClick={onSignOut}>{liveCopy.join.signOut}</Button>{signOutError&&<p role="alert" className="open-text">{signOutError}</p>}</div></div>
}
