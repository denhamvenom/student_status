import type {ReactNode} from 'react'
import {liveCopy} from './lib/live-copy'
import {UseDifferentGoogleAccount} from './SignIn'
import {Button} from './components/ui/button'
import {useSignOut} from './notifications/useSignOut'
export function PendingJoinView({submitted,declined=false,waitingTitle,waitingDetail,children}:{submitted:boolean;declined?:boolean;waitingTitle?:string;waitingDetail?:string;children:ReactNode}){
 const signOut=useSignOut()
 return <div className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt={liveCopy.brand.imageAlt}/></div><div className="signin-content"><p className="eyebrow">{liveCopy.brand.team}</p><h1>{declined?'Request not approved':submitted?waitingTitle ?? liveCopy.join.waiting:liveCopy.join.title}</h1>{declined?<section className="card"><p>Your request was not approved. Ask a Coach for help.</p></section>:submitted?<section className="card"><p>{waitingDetail ?? liveCopy.join.waitingDetail}</p></section>:null}{children}<p className="muted">{liveCopy.join.wrongAccount}</p><div className="action-row"><Button type="button" variant="outline" className="button button-outline" onClick={()=>void signOut()}>Sign out</Button><UseDifferentGoogleAccount intent="student"/></div></div></div>
}
