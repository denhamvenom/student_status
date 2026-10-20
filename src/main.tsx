import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ThemeProvider } from 'next-themes'
import App from './App'
import { AboutPage, PrivacyPage, TermsPage } from './PublicPages'
import { PublicFooter } from './PublicFooter'
import { uiCopy } from './lib/ui-copy'
import { userFacingError } from './lib/error-message'
import { Toaster } from './components/ui/sonner'
import './shadcn.css'
import '@fontsource/anton/latin-400.css'
import './styles.css'

const convexUrl = import.meta.env.VITE_CONVEX_URL
const client = convexUrl ? new ConvexReactClient(convexUrl) : null
class AppErrorBoundary extends React.Component<{children:React.ReactNode},{error:unknown}> {
  state={error:null as unknown}
  static getDerivedStateFromError(error:unknown){return {error}}
  render(){return this.state.error!==null?<div className="signin-content" role="alert"><h1>{uiCopy.errors.pageTitle}</h1><p>{userFacingError(this.state.error, uiCopy.errors.pageBody, false)}</p><button className="button button-primary" onClick={()=>window.location.reload()}>{uiCopy.errors.reload}</button></div>:this.props.children}
}
const app = <div className="app-frame">{client?<ConvexAuthProvider client={client}><App /></ConvexAuthProvider>:<App />}<PublicFooter /></div>
const router = createBrowserRouter([
  {path:'/about',element:<AppErrorBoundary><AboutPage /></AppErrorBoundary>},
  {path:'/privacy',element:<AppErrorBoundary><PrivacyPage /></AppErrorBoundary>},
  {path:'/terms',element:<AppErrorBoundary><TermsPage /></AppErrorBoundary>},
  {path:'*',element:<AppErrorBoundary>{app}</AppErrorBoundary>},
])
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange><RouterProvider router={router}/><Toaster richColors position="top-right" /></ThemeProvider></React.StrictMode>,
)
