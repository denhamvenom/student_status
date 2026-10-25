import { Component, useState, type ReactNode } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { userFacingError } from '@/lib/error-message'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'

// Loaded only behind `import.meta.env.DEV`; vite.config.ts fails any production build containing this marker.
export const DEVELOPER_SIGN_IN_MARKER = 'developer-sign-in-panel'
const KEY_STORAGE = 'student-status.developer-sign-in-key'

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
  if (!personas) return null
  const choose = async (persona: string) => {
    if (busy) return
    setBusy(persona); setError('')
    try {
      const result = await signIn('developer', { persona, key: key.trim() })
      if (!result.signingIn) { setError('That developer key was not accepted, or the fictional accounts have not been set up yet.'); setBusy(null) }
      else saveKey(key.trim())
    } catch (cause) { setError(userFacingError(cause, 'Developer sign-in failed. Check the key and try again.')); setBusy(null) }
  }
  return <section className="review-entry" data-testid={DEVELOPER_SIGN_IN_MARKER} aria-labelledby="developer-signin-heading">
    <h2 id="developer-signin-heading">Developer sign-in</h2>
    <p>Development only. Signs in as a fictional test account; no real student, parent or staff data.</p>
    <div className="parent-accept-form">
      <label htmlFor="developer-signin-key">Developer key</label>
      <Input id="developer-signin-key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} disabled={!!busy}/>
    </div>
    <div className="review-links" role="group" aria-label="Fictional accounts">
      {personas.map(persona => <Button key={persona.id} type="button" variant="outline" className="button button-outline" title={persona.description} disabled={!!busy || key.trim().length < 32} onClick={() => void choose(persona.id)}>{busy === persona.id ? 'Signing in…' : persona.label}</Button>)}
    </div>
    {error && <p role="alert" className="open-text">{error}</p>}
  </section>
}
