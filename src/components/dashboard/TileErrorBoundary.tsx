import { Component, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from 'cn'
import { DashboardTile, TileTitle, type TileSurface } from './DashboardTile'
import { dashboardButtonVariants } from './styles'

type TileErrorProps = {
  title: string
  message: string
  retryLabel: string
  onRetry: () => void
  surface?: TileSurface
  className?: string
}

/** What a tile shows when its data or its render failed. The message says what to do next. */
export function TileError({ title, message, retryLabel, onRetry, surface = 'tile', className }: TileErrorProps) {
  return <DashboardTile surface={surface} tone="quiet" aria-label={title} className={cn('gap-3', className)}>
    <TileTitle>{title}</TileTitle>
    <p role="alert" className="m-0 text-[13px] text-vs-text-2">{message}</p>
    <button type="button" onClick={onRetry} className={cn(dashboardButtonVariants({ tone: 'soft', size: 'sm' }), 'self-start')}>
      <RotateCcw size={16} aria-hidden="true" />{retryLabel}
    </button>
  </DashboardTile>
}

/*
 * Keeps one broken tile from taking down Home. "Try again" clears the error, re-renders the tile
 * and calls onRetry so the owner can re-subscribe to the tile's data.
 */
export class TileErrorBoundary extends Component<Omit<TileErrorProps, 'onRetry'> & { onRetry?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  retry = () => { this.setState({ failed: false }); this.props.onRetry?.() }
  render() {
    if (!this.state.failed) return this.props.children
    const { title, message, retryLabel, surface, className } = this.props
    return <TileError title={title} message={message} retryLabel={retryLabel} surface={surface} className={className} onRetry={this.retry} />
  }
}
