import {liveCopy} from './lib/live-copy'
import {UseDifferentGoogleAccount} from './SignIn'
import {Button} from './components/ui/button'
import {useSignOut} from './notifications/useSignOut'

/** Shown when a signed-in account exists but a Coach turned it off. It never says who or why. */
export function AccountTurnedOff() {
  const signOut = useSignOut()
  return <div className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt={liveCopy.brand.imageAlt}/></div><div className="signin-content"><p className="eyebrow">{liveCopy.brand.team}</p><h1>Your account is turned off</h1><section className="card"><p>A Coach turned off your account, so you can't use Venom Status right now. If you think this is a mistake, contact a Coach. You can also sign in with a different Google account.</p></section><div className="action-row"><Button type="button" variant="outline" className="button button-outline" onClick={()=>void signOut()}>Sign out</Button><UseDifferentGoogleAccount/></div></div></div>
}
