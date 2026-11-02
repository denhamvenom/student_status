import { Component, type ReactNode } from 'react'

/** Keeps a notifications failure (a failed query, a stale backend) from taking down the app shell. Renders `fallback` instead. */
export class NotificationsBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.warn('Notifications unavailable', error) }
  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children }
}
