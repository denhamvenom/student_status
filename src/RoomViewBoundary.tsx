import { Component, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from './components/ui/button'
import { uiCopy } from './lib/ui-copy'
import { userFacingError } from './lib/error-message'

// Presentation-only fallback. The server still determines eligibility and access.
export class RoomViewBoundary extends Component<{ eventId: string; children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() {
    if (this.state.error === null) return this.props.children
    return <section className="card" role="alert"><h1>{uiCopy.event.rooming}</h1><p>{userFacingError(this.state.error, uiCopy.errors.rooming, false)}</p><div className="action-row"><Link className="button button-outline" to={`/events/${this.props.eventId}`}>{uiCopy.errors.returnEvent}</Link><Button onClick={() => this.setState({ error: null })}>{uiCopy.errors.retry}</Button></div></section>
  }
}
