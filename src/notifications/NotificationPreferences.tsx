import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Check } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { NotificationCategory } from '../../convex/lib/notificationCategories'
import { Button } from '@/components/ui/button'
import { notificationsCopy } from '@/copy/notifications-copy'
import { userFacingError } from '@/lib/error-message'

const copy = notificationsCopy.preferences
const SAVED_VISIBLE_MS = 2500

type RowStatus = { state: 'saving' } | { state: 'saved' } | { state: 'failed'; enabled: boolean; message: string }

/** One switch per message type this account can get. The whole row is the switch, for an easy tap. Each change confirms inline. */
export function NotificationPreferences() {
  const preferences = useQuery(api.notifications.getMyPreferences)
  const setEnabled = useMutation(api.notifications.setCategoryEnabled).withOptimisticUpdate((store, { category, enabled }) => {
    const current = store.getQuery(api.notifications.getMyPreferences, {})
    if (current) store.setQuery(api.notifications.getMyPreferences, {}, current.map(row => row.category === category ? { ...row, enabled } : row))
  })
  const [status, setStatus] = useState<Partial<Record<NotificationCategory, RowStatus>>>({})
  const timers = useRef(new Map<NotificationCategory, ReturnType<typeof setTimeout>>())
  useEffect(() => { const pending = timers.current; return () => pending.forEach(clearTimeout) }, [])

  const save = async (category: NotificationCategory, enabled: boolean) => {
    clearTimeout(timers.current.get(category))
    setStatus(current => ({ ...current, [category]: { state: 'saving' } }))
    try {
      await setEnabled({ category, enabled })
      setStatus(current => ({ ...current, [category]: { state: 'saved' } }))
      timers.current.set(category, setTimeout(() => setStatus(current => {
        if (current[category]?.state !== 'saved') return current
        const next = { ...current }; delete next[category]; return next
      }), SAVED_VISIBLE_MS))
    } catch (cause) {
      setStatus(current => ({ ...current, [category]: { state: 'failed', enabled, message: userFacingError(cause, copy.saveFailed) } }))
    }
  }

  if (preferences === undefined) return <p className="muted m-0" role="status">{copy.loading}</p>
  return <div className="flex flex-col gap-2">
    <h3 className="m-0">{copy.title}</h3>
    <p className="muted m-0 text-sm">{copy.description}</p>
    <ul className="m-0 flex list-none flex-col p-0">
      {preferences.map(row => {
        const rowStatus = status[row.category]
        return <li key={row.category} className="border-b border-[var(--border-default)] last:border-b-0">
          <button type="button" role="switch" aria-checked={row.enabled} aria-describedby={`notification-pref-${row.category}`} aria-busy={rowStatus?.state === 'saving'} className="flex min-h-16 w-full items-center gap-4 border-0 bg-transparent px-1 py-3 text-left text-[var(--text-body)]" onClick={() => void save(row.category, !row.enabled)}>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-bold">{row.label}</span>
              <span id={`notification-pref-${row.category}`} className="muted flex flex-col gap-1 text-sm font-normal">
                <span>{row.description}</span>
                {row.urgentByDefault && <span className="flex flex-wrap items-center gap-2"><span className="badge badge-todo">{copy.urgent}</span><span>{copy.urgentHelp}</span></span>}
              </span>
            </span>
            <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${row.enabled ? 'border-[var(--purple-700)] bg-[var(--purple-700)]' : 'border-[var(--border-default)] bg-[var(--surface-metal)]'}`}>
              <span className={`absolute top-0.5 size-[22px] rounded-full bg-white shadow transition-[left] ${row.enabled ? 'left-[22px]' : 'left-0.5'}`}/>
            </span>
          </button>
          <div role="status" className="px-1">
            {rowStatus?.state === 'saving' && <p className="muted m-0 pb-2 text-sm">{copy.saving}</p>}
            {rowStatus?.state === 'saved' && <p className="m-0 flex items-center gap-1 pb-2 text-sm font-bold text-[var(--accent-text)]"><Check size={16} aria-hidden="true"/>{copy.saved}</p>}
          </div>
          {rowStatus?.state === 'failed' && <div role="alert" className="flex flex-wrap items-center gap-2 px-1 pb-3">
            <p className="open-text m-0 text-sm">{rowStatus.message}</p>
            <Button type="button" variant="outline" className="min-h-11" aria-label={copy.retryLabel(row.label)} onClick={() => void save(row.category, rowStatus.enabled)}>{copy.retry}</Button>
          </div>}
        </li>
      })}
    </ul>
  </div>
}
