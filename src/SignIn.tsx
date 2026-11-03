import { userFacingError } from '@/lib/error-message'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Button } from './components/ui/button'
import { ParentEmailSignIn } from './ParentInvites'
import { liveCopy } from './lib/live-copy'
import { uiCopy } from './lib/ui-copy'
import { browserIntentStorage as intentStorage, clearSignInIntent, readSignInIntent, writeSignInIntent, type SignInIntent } from './lib/authReturn'

// Vite replaces import.meta.env.DEV with false in production builds, so this chunk is never emitted there.
const DeveloperSignIn = import.meta.env.DEV ? lazy(() => import('./DeveloperSignIn')) : null

function rememberedIntent(): SignInIntent | null { const storage = intentStorage(); return storage ? readSignInIntent(storage, Date.now()) : null }

/** `oauthReturn` is set by LiveEntry when the page loaded from a Google redirect (`?code`) and the exchange has not signed the person in. */
export default function SignIn({ oauthReturn, onDismissReturn }: { oauthReturn?: 'pending' | 'finish'; onDismissReturn?: () => void } = {}) {
  const { signIn } = useAuthActions()
  const [screen, setScreen] = useState<'choose'|'student'|'adult'|'email'>(() => rememberedIntent() ?? 'choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [screen, oauthReturn])
  const change = (next: typeof screen) => {
    setError(''); setScreen(next)
    if (next === 'choose') { const storage = intentStorage(); if (storage) clearSignInIntent(storage) }
  }
  const google = async (intent: SignInIntent | null) => {
    if (busy) return
    setBusy(true); setError('')
    const storage = intentStorage()
    if (storage && intent) writeSignInIntent(storage, intent, Date.now())
    try { await signIn('google', {redirectTo: `${window.location.origin}/`}) }
    catch (cause) { if (storage) clearSignInIntent(storage); setError(userFacingError(cause, uiCopy.errors.signIn)); setBusy(false) }
  }
  const intentFor = (value: typeof screen): SignInIntent | null => value === 'student' || value === 'adult' ? value : null
  const finishing = oauthReturn !== undefined
  const title = oauthReturn === 'pending' ? 'Finishing sign-in…' : oauthReturn === 'finish' ? 'Almost there' : screen==='choose'?'How are you signing in?':screen==='student'?'Student sign-in':screen==='adult'?'Parent or team staff sign-in':'Sign in by email'
  return <main className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt={liveCopy.brand.imageAlt}/></div><div className="signin-content"><p className="eyebrow">{liveCopy.brand.team}</p><h1>{liveCopy.signIn.title}</h1><p>{liveCopy.signIn.description}</p><section className="signin-card" aria-labelledby="signin-heading" aria-busy={oauthReturn === 'pending'}>
    <h2 id="signin-heading" ref={heading} tabIndex={-1}>{title}</h2>
    {oauthReturn === 'pending' ? <p role="status">{liveCopy.states.connecting}</p> : oauthReturn === 'finish' ? <>
      <p>Tap below to finish signing in with Google.</p>
      <Button className="button button-primary" disabled={busy} onClick={()=>void google(rememberedIntent() ?? intentFor(screen))}><img className="icon" src="/assets/icons/google-g.svg" alt=""/>{busy?'Opening Google…':'Finish signing in'}</Button>
      <Button variant="link" className="button button-link" disabled={busy} onClick={()=>{setError(''); onDismissReturn?.()}}>Use a different sign-in option</Button>
    </> : screen==='choose'?<><Button className="button button-primary" onClick={()=>change('student')}>Student</Button><Button variant="outline" className="button button-outline" onClick={()=>change('adult')}>Parent or team staff</Button></>:screen==='email'?<ParentEmailSignIn audience="adult" onBusyChange={setBusy}/>:<>
      <p>{screen==='student'?'Use your school Google account.':'Use the email address connected to your team account or invitation.'}</p>
      {screen==='student'&&<p className="muted">New student? You will be asked for an invitation or team code after you sign in.</p>}
      <Button className="button button-primary" disabled={busy} onClick={()=>void google(intentFor(screen))}><img className="icon" src="/assets/icons/google-g.svg" alt=""/>{busy?'Opening Google…':liveCopy.signIn.action}</Button>
      {screen==='adult'&&<Button variant="outline" className="button button-outline" disabled={busy} onClick={()=>change('email')}>Sign in by email</Button>}
    </>}
    {error&&<p role="alert" className="open-text">{error}</p>}
    {!finishing&&screen!=='choose'&&<Button variant="link" className="button button-link" disabled={busy} onClick={()=>change(screen==='email'?'adult':'choose')}>Back</Button>}
  </section>{!finishing&&DeveloperSignIn&&<Suspense fallback={null}><DeveloperSignIn/></Suspense>}</div></main>
}
