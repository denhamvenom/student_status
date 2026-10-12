import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ThemeProvider } from 'next-themes'
import App from './App'
import { Toaster } from './components/ui/sonner'
import './shadcn.css'
import '@fontsource/anton/latin-400.css'
import './styles.css'

const convexUrl = import.meta.env.VITE_CONVEX_URL
const client = convexUrl ? new ConvexReactClient(convexUrl) : null
class AppErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed?<div className="signin-content" role="alert"><h1>Something went wrong</h1><p>The page could not load. Please try again.</p><button className="button button-primary" onClick={()=>window.location.reload()}>Reload page</button></div>:this.props.children}
}
const app = client?<ConvexAuthProvider client={client}><App /></ConvexAuthProvider>:<App />
const router = createBrowserRouter([{path:'*',element:<AppErrorBoundary>{app}</AppErrorBoundary>}])
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange><RouterProvider router={router}/><Toaster richColors position="top-right" /></ThemeProvider></React.StrictMode>,
)
