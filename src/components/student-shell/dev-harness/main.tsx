/**
 * Development-only harness: renders the real signed-in Student app (LiveApp, AppShell, StudentShell, pages)
 * against synthetic fixtures, with no backend and no sign-in. Open it from `vite` at
 * /src/components/student-shell/dev-harness/index.html?path=/events&theme=dark
 * Optional: fail=theme|signOut (show the error alerts), roles=2 (show Switch role).
 * index.html is not a Vite build input, so none of this reaches a production bundle.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { createMemoryRouter, Link, RouterProvider } from 'react-router'
import { Button } from '@/components/ui/button'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ThemeProvider } from 'next-themes'
import LiveApp from '@/LiveApp'
import { PublicFooter } from '@/PublicFooter'
import { Toaster } from '@/components/ui/sonner'
import { fixtureClient } from './fixtureClient'
import { harnessFixtures } from './fixtures'
import '@/shadcn.css'
import '@fontsource/anton/latin-400.css'
import '@/styles.css'

if (!import.meta.env.DEV) throw new Error('The Student shell harness is for development only.')

const params = new URLSearchParams(window.location.search)
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
const storageKey = 'student-shell-harness-theme'
window.localStorage.removeItem(storageKey)
const fixtures = harnessFixtures({ theme, fail: params.get('fail'), roles: Number(params.get('roles') ?? 1) })
const { client, missing } = fixtureClient(fixtures.queries, fixtures.mutations, fixtures.actions)
Object.assign(window, { harnessMissingQueries: missing })

/** linkButtons=1: every Button variant rendered as a router Link, to check link-button colors on Student pages. */
function LinkButtonCheck() {
  const variants = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const
  return <section className="card" data-testid="link-button-check" style={{ position: 'fixed', right: 16, bottom: 96, zIndex: 60, display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 360 }}>
    {variants.map(variant => <Button key={variant} variant={variant} nativeButton={false} render={<Link to="/events"/>} data-variant={variant}>{variant}</Button>)}
  </section>
}

const router = createMemoryRouter([{ path: '*', element: <div className="app-frame"><LiveApp/>{params.get('linkButtons') && <LinkButtonCheck/>}<PublicFooter/></div> }], { initialEntries: [params.get('path') ?? '/'] })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme={theme} enableSystem={false} storageKey={storageKey} disableTransitionOnChange>
      <ConvexAuthProvider client={client} storageNamespace="student-shell-harness" shouldHandleCode={false}>
        <RouterProvider router={router}/>
      </ConvexAuthProvider>
      <Toaster richColors position="top-right"/>
    </ThemeProvider>
  </React.StrictMode>,
)
