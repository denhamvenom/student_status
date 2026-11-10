import { userFacingError } from '@/lib/error-message'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Button } from './components/ui/button'
import { ParentEmailSignIn } from './ParentInvites'
import { liveCopy } from './lib/live-copy'
import { uiCopy } from './lib/ui-copy'
import { useSignOutResult } from './notifications/useSignOut'
import { browserIntentStorage as intentStorage, clearSignInIntent, isGoogleIntent, readSignInIntent, recordSignInScreenChange, signOutThenStart, takeSignInNotice, writeSignInIntent, writeSignInNotice, type GoogleSignInIntent, type SignInIntent } from './lib/authReturn'

// Vite replaces import.meta.env.DEV with false in production builds, so this chunk is never emitted there.
const DeveloperSignIn = import.meta.env.DEV ? lazy(() => import('./DeveloperSignIn')) : null

const chooserNote = 'Google asks which account to use, so you can choose a different one.'

function rememberedIntent(): SignInIntent | null { const storage = intentStorage(); return storage ? readSignInIntent(storage, Date.now()) : null }

/** `oauthReturn` is set by LiveEntry when the page loaded from a Google redirect (`?code`) and the exchange has not signed the person in. */
export default function SignIn({ oauthReturn, onDismissReturn }: { oauthReturn?: 'pending' | 'finish'; onDismissReturn?: () => void } = {}) {
  const { signIn } = useAuthActions()
  const [screen, setScreen] = useState<'choose'|'student'|'adult'|'email'>(() => rememberedIntent() ?? 'choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => { const storage = intentStorage(); return storage ? takeSignInNotice(storage, Date.now()) ?? '' : '' })
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [screen, oauthReturn])
  const change = (next: typeof screen) => {
    setError(''); setScreen(next)
    const storage = intentStorage()
    // Remember "Sign in by email" so a reload while fetching the code (common in an installed phone app) returns here.
    if (storage) recordSignInScreenChange(storage, screen, next, Date.now())
  }
  const google = async (intent: GoogleSignInIntent | null) => {
    if (busy) return
    setBusy(true); setError('')
    const storage = intentStorage()
    if (storage && intent) writeSignInIntent(storage, intent, Date.now())
    try { await signIn('google', {redirectTo: `${window.location.origin}/`}) }
    catch (cause) { if (storage) clearSignInIntent(storage); setError(userFacingError(cause, uiCopy.errors.signIn)); setBusy(false) }
  }
  const intentFor = (value: typeof screen): GoogleSignInIntent | null => value === 'student' || value === 'adult' ? value : null
  const finishing = oauthReturn !== undefined
  const title = oauthReturn === 'pending' ? 'Finishing sign-in…' : oauthReturn === 'finish' ? 'Almost there' : screen==='choose'?'How are you signing in?':screen==='student'?'Student sign-in':screen==='adult'?'Parent or team staff sign-in':'Sign in by email'
  return <main className="signin"><div className="signin-brand"><img src="/assets/logos/logo-mark-white-text.png" alt={liveCopy.brand.imageAlt}/></div><div className="signin-content"><p className="eyebrow">{liveCopy.brand.team}</p><h1>{liveCopy.signIn.title}</h1><p>{liveCopy.signIn.description}</p><section className="signin-card" aria-labelledby="signin-heading" aria-busy={oauthReturn === 'pending'}>
    <h2 id="signin-heading" ref={heading} tabIndex={-1}>{title}</h2>
    {oauthReturn === 'pending' ? <p role="status">{liveCopy.states.connecting}</p> : oauthReturn === 'finish' ? <>
      <p>Tap below to finish signing in with Google.</p>
      <Button className="button button-primary" disabled={busy} onClick={()=>{ const remembered = rememberedIntent(); void google(isGoogleIntent(remembered) ? remembered : intentFor(screen)) }}><img className="icon" src="/assets/icons/google-g.svg" alt=""/>{busy?'Opening Google…':'Finish signing in'}</Button>
      <Button variant="link" className="button button-link" disabled={busy} onClick={()=>{setError(''); onDismissReturn?.()}}>Use a different sign-in option</Button>
    </> : screen==='choose'?<><Button className="button button-primary" onClick={()=>change('student')}>Student</Button><Button variant="outline" className="button button-outline" onClick={()=>change('adult')}>Parent or team staff</Button></>:screen==='email'?<ParentEmailSignIn audience="adult" onBusyChange={setBusy}/>:<>
      <p>{screen==='student'?'Use your school Google account.':'Use the email address connected to your team account or invitation.'}</p>
      {screen==='student'&&<p className="muted">New student? You will be asked for an invitation or team code after you sign in.</p>}
      <Button className="button button-primary" disabled={busy} onClick={()=>void google(intentFor(screen))}><img className="icon" src="/assets/icons/google-g.svg" alt=""/>{busy?'Opening Google…':liveCopy.signIn.action}</Button>
      <p className="muted">{chooserNote}</p>
      {screen==='adult'&&<Button variant="outline" className="button button-outline" disabled={busy} onClick={()=>change('email')}>Sign in by email</Button>}
    </>}
    {error&&<p role="alert" className="open-text">{error}</p>}
    {!finishing&&screen!=='choose'&&<Button variant="link" className="button button-link" disabled={busy} onClick={()=>change(screen==='email'?'adult':'choose')}>Back</Button>}
  </section>{!finishing&&DeveloperSignIn&&<Suspense fallback={null}><DeveloperSignIn/></Suspense>}</div></main>
}

/**
 * For someone signed in with the wrong Google account who has no access (e.g. a pending join request or an invitation for
 * another email): signs out of Venom Status, then opens Google's account chooser. `intent` returns them to the matching
 * sign-in screen if they come back without finishing.
 */
export function UseDifferentGoogleAccount({ intent, className, redirectPath = '/', prepare, cleanup }: {
  intent?: GoogleSignInIntent; className?: string
  /** Same-origin path Google returns to; an invitation page passes its own so the person lands back on the invitation. */
  redirectPath?: string
  /** Runs before signing out; saves the invitation token (which only lives in memory) for the return trip. May throw. */
  prepare?: () => void
  /** Runs when the round trip could not start, to discard what `prepare` saved. */
  cleanup?: () => void
}) {
  const { signIn } = useAuthActions()
  const signOut = useSignOutResult(cleanup)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const start = async () => {
    if (busy) return
    setBusy(true); setError('')
    const storage = intentStorage()
    try {
      prepare?.()
    } catch (cause) {
      setError(userFacingError(cause, uiCopy.errors.signIn)); setBusy(false)
      return
    }
    try {
      const outcome = await signOutThenStart(signOut, async () => {
        if (storage && intent) writeSignInIntent(storage, intent, Date.now())
        await signIn('google', { redirectTo: `${window.location.origin}${redirectPath}` })
      })
      // Forced: the app is already reloading at '/', and `cleanup` already ran there. Stay busy; do not start a second navigation.
      if (outcome === 'forced') return
    } catch (cause) {
      cleanup?.()
      const text = userFacingError(cause, uiCopy.errors.signIn)
      if (storage) { clearSignInIntent(storage); writeSignInNotice(storage, text, Date.now()) }
      setError(text); setBusy(false)
      // Already signed out: the sign-in screen is where they can try again, and it shows this message.
      if (storage) window.location.assign('/')
    }
  }
  return <><Button type="button" variant="outline" className={className ?? 'button button-outline'} disabled={busy} onClick={() => void start()}>{busy ? 'Opening Google…' : 'Use a different Google account'}</Button>{error && <p role="alert" className="open-text">{error}</p>}</>
}
