import type {ReactNode} from 'react'
import {Button} from './components/ui/button'
import {liveCopy} from './lib/live-copy'
export function PendingJoinView({submitted,busy,signOutError,onSignOut,children}:{submitted:boolean;busy:boolean;signOutError:string;onSignOut:()=>void;children:ReactNode}){
 return <div className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt={liveCopy.brand.imageAlt}/></div><div className="signin-content"><p className="eyebrow">{liveCopy.brand.team}</p><h1>{submitted?liveCopy.join.waiting:liveCopy.join.title}</h1>{submitted?<section className="card"><p>{liveCopy.join.waitingDetail}</p></section>:children}<p className="muted">{liveCopy.join.wrongAccount}</p><Button type="button" variant="outline" disabled={busy} onClick={onSignOut}>{liveCopy.join.signOut}</Button>{signOutError&&<p role="alert" className="open-text">{signOutError}</p>}</div></div>
}
