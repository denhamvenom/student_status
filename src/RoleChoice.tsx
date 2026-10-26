import { createContext, useContext, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog'

export type OperatingRole = 'parent' | 'mentor' | 'travelLead'
export const roleLabels: Record<OperatingRole, string> = { parent: 'Parent', mentor: 'Mentor', travelLead: 'Travel Lead' }
const descriptions: Record<OperatingRole, string> = {
  parent: 'Your children, family information, and permission forms.',
  mentor: 'Your staff profile, team roster, and mentor reports.',
  travelLead: 'Team travel, events, and readiness.',
}

export const RoleSwitchContext = createContext<(() => void) | null>(null)

export function RoleSwitchButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const open = useContext(RoleSwitchContext)
  return open ? <Button type="button" variant="outline" className={className} aria-label="Switch role" title="Switch role" onClick={open}><ArrowLeftRight size={18} aria-hidden="true"/><span className={compact ? 'hidden sm:inline' : undefined}>Switch role</span></Button> : null
}

export function RoleChoice({ roles, currentRole, required, open, onClose, onChoose, onSignOut }: {
  roles: OperatingRole[]; currentRole: OperatingRole; required: boolean; open: boolean;
  onClose: () => void; onChoose: (role: OperatingRole) => Promise<void>; onSignOut: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const act = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch { setError('We could not change your role. Please try again.') } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value && !required && !busy) onClose() }}>
    <DialogContent showCloseButton={!required && !busy}>
      <DialogHeader><DialogTitle>Choose your role</DialogTitle><DialogDescription>Choose how you want to use Venom Status. You can switch roles later.</DialogDescription></DialogHeader>
      <div className="grid gap-3" aria-busy={busy}>{roles.map(role => <Button className="h-auto min-h-14 justify-start whitespace-normal text-left" key={role} variant="outline" disabled={busy} aria-pressed={!required && currentRole === role} onClick={() => void act(() => onChoose(role))}><span><strong className="block">{roleLabels[role]}</strong><span className="block text-sm font-normal">{descriptions[role]}</span></span></Button>)}</div>
      {error && <p role="alert">{error}</p>}
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void act(onSignOut)}>Sign out</Button>
    </DialogContent>
  </Dialog>
}
