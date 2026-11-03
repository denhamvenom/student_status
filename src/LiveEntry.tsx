import { lazy, Suspense, useEffect, useState } from 'react'
import { useConvexAuth, useQuery } from 'convex/react'
import { useLocation } from 'react-router'
import { api } from '../convex/_generated/api'
import SignIn from './SignIn'
import { liveCopy } from './lib/live-copy'
import { AUTH_RETURN_GRACE_MS, authReturnPhase, browserIntentStorage, clearSignInIntent, hasOAuthCode, withoutOAuthCode } from './lib/authReturn'

const LiveApp = lazy(() => import('./LiveApp'))
/** Captured at module load, before the auth provider's mount effect consumes and strips `?code` from the URL. */
const launchedFromOAuthRedirect = typeof window !== 'undefined' && hasOAuthCode(window.location.search)

/** Keep authenticated workspaces out of the public sign-in download. */
export default function LiveEntry() {
  const viewer = useQuery(api.app.viewer, {})
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth()
  const { pathname } = useLocation()
  const invitation = pathname === '/invite-adult' || pathname === '/invite-parent'
  const [returnedWithCode, setReturnedWithCode] = useState(launchedFromOAuthRedirect && !invitation)
  const [graceElapsed, setGraceElapsed] = useState(false)
  const phase = authReturnPhase({ returnedWithCode, authLoading, authenticated: isAuthenticated, viewerStatus: viewer?.status, graceElapsed })
  const signedIn = viewer !== undefined && viewer.status !== 'signedOut'

  // The grace clock starts only once the auth client stops loading; a slow code exchange never times out into "finish".
  useEffect(() => {
    if (!returnedWithCode || authLoading || graceElapsed) return
    const timer = window.setTimeout(() => setGraceElapsed(true), AUTH_RETURN_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [returnedWithCode, authLoading, graceElapsed])
  // Only after the exchange settled (the auth client has already read `code`): drop any stale code without reloading.
  useEffect(() => {
    if (phase !== 'finish') return
    const cleaned = withoutOAuthCode(window.location)
    if (cleaned !== null) window.history.replaceState(window.history.state, '', cleaned)
  }, [phase])
  // A completed sign-in ends this redirect round trip, so a later sign-out shows the normal screen.
  useEffect(() => {
    if (!signedIn) return
    const storage = browserIntentStorage()
    if (storage) clearSignInIntent(storage)
    setReturnedWithCode(false)
  }, [signedIn])

  if (phase !== 'none' && !invitation) return <SignIn oauthReturn={phase} onDismissReturn={() => setReturnedWithCode(false)} />
  if (viewer?.status === 'signedOut' && !invitation) return <SignIn />
  const loading = <div className="signin-content" role="status">{liveCopy.states.connecting}</div>
  if (!viewer && !invitation) return loading
  return <Suspense fallback={loading}><LiveApp /></Suspense>
}
