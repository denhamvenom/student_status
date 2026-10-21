import { lazy, Suspense } from 'react'
import { useQuery } from 'convex/react'
import { useLocation } from 'react-router'
import { api } from '../convex/_generated/api'
import SignIn from './SignIn'
import { liveCopy } from './lib/live-copy'

const LiveApp = lazy(() => import('./LiveApp'))
/** Keep authenticated workspaces out of the public sign-in download. */
export default function LiveEntry() {
  const viewer = useQuery(api.app.viewer, {})
  const { pathname } = useLocation()
  const invitation = pathname === '/invite-adult' || pathname === '/invite-parent'
  if (viewer?.status === 'signedOut' && !invitation) return <SignIn />
  const loading = <div className="signin-content" role="status">{liveCopy.states.connecting}</div>
  if (!viewer && !invitation) return loading
  return <Suspense fallback={loading}><LiveApp /></Suspense>
}
