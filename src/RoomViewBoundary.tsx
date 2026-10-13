import { Component, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from './components/ui/button'
import { uiCopy } from './lib/ui-copy'

// Presentation-only fallback. The server still determines eligibility and access.
export class RoomViewBoundary extends Component<{ eventId: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <section className="card" role="alert"><h1>{uiCopy.event.rooming}</h1><p>{uiCopy.errors.rooming}</p><div className="action-row"><Link className="button button-outline" to={`/events/${this.props.eventId}`}>{uiCopy.errors.returnEvent}</Link><Button onClick={() => this.setState({ failed: false })}>{uiCopy.errors.retry}</Button></div></section>
  }
}
