import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { ThemeProvider } from "next-themes";
import { api } from "../../../convex/_generated/api";
import { Button } from "./components/ui/button";
import "./theme.css";
import "./style.css";

function Access() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const status = useQuery(api.timeclockRoster.operatorStatus, isAuthenticated ? {} : "skip");
  const [error, setError] = useState(false);
  if (isLoading) return <p>Checking sign-in…</p>;
  if (!isAuthenticated) return <><p>Sign in with your approved Coach or Mentor Google account.</p><Button onClick={() => { setError(false); void signIn("google", { redirectTo: `${window.location.origin}/` }).catch(() => setError(true)); }}>Sign in with Google</Button>{error && <p role="alert">Sign-in could not start. Please try again.</p>}</>;
  if (status === undefined) return <p>Checking access…</p>;
  return status.allowed ? <><h2>Connected as {status.role === "coach" ? "Coach" : "Mentor"}</h2><p>The shared backend is connected. The Timeclock interface will be built in the next milestone.</p></> : <p role="alert">Timeclock is available only to approved Coaches and Mentors. Contact the Coach if you need access.</p>;
}

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">Unable to connect. Reload this page to try again.</p> : this.props.children; }
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const client = convexUrl ? new ConvexReactClient(convexUrl) : null;
const app = <main><p className="eyebrow">FIRST TEAM 8044 · DEVELOPMENT</p><h1>Denham Venom Timeclock</h1><Boundary>{client ? <ConvexAuthProvider client={client} storageNamespace={`timeclock:${convexUrl}`}><Access /></ConvexAuthProvider> : <p role="alert">Set VITE_CONVEX_URL in this workspace’s .env.local to connect development.</p>}</Boundary></main>;
const router = createBrowserRouter([{ path: "*", element: app }]);
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange><RouterProvider router={router} /></ThemeProvider></React.StrictMode>);
