import { useEffect, useRef, useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Button } from './components/ui/button'
import { ParentEmailSignIn } from './ParentInvites'
import { liveCopy } from './lib/live-copy'
import { uiCopy } from './lib/ui-copy'

export default function SignIn() {
  const { signIn } = useAuthActions()
  const [screen, setScreen] = useState<'choose'|'student'|'adult'|'email'>('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [screen])
  const change = (next: typeof screen) => { setError(''); setScreen(next) }
  const google = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await signIn('google', {redirectTo: `${window.location.origin}/`}) }
    catch { setError(uiCopy.errors.signIn); setBusy(false) }
  }
  return <main className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt={liveCopy.brand.imageAlt}/></div><div className="signin-content"><p className="eyebrow">{liveCopy.brand.team}</p><h1>{liveCopy.signIn.title}</h1><p>{liveCopy.signIn.description}</p><section className="signin-card" aria-labelledby="signin-heading">
    <h2 id="signin-heading" ref={heading} tabIndex={-1}>{screen==='choose'?'How are you signing in?':screen==='student'?'Student sign-in':screen==='adult'?'Parent or team staff sign-in':'Sign in by email'}</h2>
    {screen==='choose'?<><Button className="button button-primary" onClick={()=>change('student')}>Student</Button><Button variant="outline" className="button button-outline" onClick={()=>change('adult')}>Parent or team staff</Button></>:screen==='email'?<ParentEmailSignIn audience="adult" onBusyChange={setBusy}/>:<>
      <p>{screen==='student'?'Use your school Google account.':'Use the email address connected to your team account or invitation.'}</p>
      {screen==='student'&&<p className="muted">New student? You will be asked for an invitation or team code after you sign in.</p>}
      <Button className="button button-primary" disabled={busy} onClick={()=>void google()}><img className="icon" src="/assets/icons/google-g.svg" alt=""/>{busy?'Opening Google…':liveCopy.signIn.action}</Button>
      {screen==='adult'&&<Button variant="outline" className="button button-outline" disabled={busy} onClick={()=>change('email')}>Sign in by email</Button>}
    </>}
    {error&&<p role="alert" className="open-text">{error}</p>}
    {screen!=='choose'&&<Button variant="link" className="button button-link" disabled={busy} onClick={()=>change(screen==='email'?'adult':'choose')}>Back</Button>}
  </section></div></main>
}
