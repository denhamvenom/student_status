import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { userFacingError } from '@/lib/error-message'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { DEVELOPER_KEY_STORAGE } from './notifications/useSignOut'

// Loaded only behind `import.meta.env.DEV`; vite.config.ts fails any production build containing this marker.
export const DEVELOPER_SIGN_IN_MARKER = 'developer-sign-in-panel'
const KEY_STORAGE = DEVELOPER_KEY_STORAGE // cleared on sign-out by notifications/useSignOut.ts
const MIN_KEY_LENGTH = 32 // Mirrors convex/lib/developerSignIn.ts; the server is the real check.
const SIGN_IN_TIMEOUT_MS = 20_000
const OPEN_APP_TIMEOUT_MS = 10_000
const TIMED_OUT = Symbol('timed out')

function readKey() { try { return window.sessionStorage.getItem(KEY_STORAGE) ?? '' } catch { return '' } }
function saveKey(value: string) { try { if (value) window.sessionStorage.setItem(KEY_STORAGE, value); else window.sessionStorage.removeItem(KEY_STORAGE) } catch { /* Tab-only convenience. */ } }

/** A backend without this feature must never break the normal sign-in screen. */
class HideOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

/** Development deployment only: sign in as a fixed fictional account. See docs/DECISIONS.md "Developer sign-in". */
export default function DeveloperSignIn() { return <HideOnError><DeveloperSignInPanel/></HideOnError> }

function DeveloperSignInPanel() {
  const personas = useQuery(api.developerSignIn.available)
  const { signIn } = useAuthActions()
  const [key, setKey] = useState(readKey)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const watchdog = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(watchdog.current), [])
  if (!personas) return null
  const fail = (message: string) => { clearTimeout(watchdog.current); setError(message); setBusy(null) }
  const choose = async (persona: string) => {
    if (busy) return
    // Read the field itself: password managers and autofill can fill it without a React change event.
    const typed = (input.current?.value ?? key).trim()
    if (typed !== key) setKey(typed)
    setError('')
    if (typed.length < MIN_KEY_LENGTH) { setError(`Enter the developer key first (at least ${MIN_KEY_LENGTH} characters).`); input.current?.focus(); return }
    setBusy(persona)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([signIn('developer', { persona, key: typed }), new Promise<typeof TIMED_OUT>(resolve => { timer = setTimeout(() => resolve(TIMED_OUT), SIGN_IN_TIMEOUT_MS) })])
      if (result === TIMED_OUT) return fail('Developer sign-in is taking too long. Check your connection, reload the page and try again.')
      if (!result.signingIn) return fail('That developer key was not accepted, or the fictional accounts have not been set up yet.')
      saveKey(typed)
      // Success unmounts this panel once the app loads the account; if it never does, say so instead of spinning forever.
      watchdog.current = setTimeout(() => fail('Signed in, but the app did not open. Reload the page.'), OPEN_APP_TIMEOUT_MS)
    } catch (cause) { fail(userFacingError(cause, 'Developer sign-in failed. Check the key and try again.')) }
    finally { clearTimeout(timer) }
  }
  const label = personas.find(persona => persona.id === busy)?.label
  return <section className="review-entry" data-testid={DEVELOPER_SIGN_IN_MARKER} aria-labelledby="developer-signin-heading" aria-busy={!!busy}>
    <h2 id="developer-signin-heading">Developer sign-in</h2>
    <p>Development only. Signs in as a fictional test account; no real student, parent or staff data.</p>
    <div className="parent-accept-form">
      <label htmlFor="developer-signin-key">Developer key</label>
      <Input ref={input} id="developer-signin-key" type="password" autoComplete="off" value={key} onChange={e => { setKey(e.target.value); setError('') }} disabled={!!busy}/>
    </div>
    <div className="review-links" style={{ marginTop: 12 }} role="group" aria-label="Fictional accounts">
      {personas.map(persona => <div key={persona.id} className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-1">
        <Button type="button" variant="outline" className="button button-outline h-auto min-h-11 whitespace-normal py-2 text-center" aria-describedby={`developer-signin-${persona.id}-description`} disabled={!!busy} onClick={() => void choose(persona.id)}>{busy === persona.id ? 'Signing in…' : persona.label}</Button>
        <p id={`developer-signin-${persona.id}-description`} className="text-sm text-muted-foreground">{persona.description}</p>
      </div>)}
    </div>
    <p role="status" className="sr-only">{label ? `Signing in as ${label}…` : ''}</p>
    {error && <p role="alert" className="open-text">{error}</p>}
  </section>
}
