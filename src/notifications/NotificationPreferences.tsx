import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { notificationsCopy } from '@/copy/notifications-copy'
import { userFacingError } from '@/lib/error-message'

const copy = notificationsCopy.preferences

/** One switch per message type this account can get. The whole row is the switch, for an easy tap. */
export function NotificationPreferences() {
  const preferences = useQuery(api.notifications.getMyPreferences)
  const setEnabled = useMutation(api.notifications.setCategoryEnabled).withOptimisticUpdate((store, { category, enabled }) => {
    const current = store.getQuery(api.notifications.getMyPreferences, {})
    if (current) store.setQuery(api.notifications.getMyPreferences, {}, current.map(row => row.category === category ? { ...row, enabled } : row))
  })
  const [error, setError] = useState('')
  if (preferences === undefined) return <p className="muted m-0" role="status">{copy.loading}</p>
  return <div className="flex flex-col gap-2">
    <h3 className="m-0">{copy.title}</h3>
    <p className="muted m-0 text-sm">{copy.description}</p>
    <ul className="m-0 flex list-none flex-col p-0">
      {preferences.map(row => <li key={row.category} className="border-b border-[var(--border-default)] last:border-b-0">
        <button type="button" role="switch" aria-checked={row.enabled} aria-describedby={`notification-pref-${row.category}`} className="flex min-h-16 w-full items-center gap-4 border-0 bg-transparent px-1 py-3 text-left text-[var(--text-body)]" onClick={() => { setError(''); void setEnabled({ category: row.category, enabled: !row.enabled }).catch(cause => setError(userFacingError(cause, copy.saveFailed))) }}>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 font-bold">{row.label}{row.urgentByDefault && <span className="badge badge-todo">{copy.urgent}</span>}</span>
            <span id={`notification-pref-${row.category}`} className="muted text-sm font-normal">{row.description}</span>
          </span>
          <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${row.enabled ? 'border-[var(--purple-700)] bg-[var(--purple-700)]' : 'border-[var(--border-default)] bg-[var(--surface-metal)]'}`}>
            <span className={`absolute top-0.5 size-[22px] rounded-full bg-white shadow transition-[left] ${row.enabled ? 'left-[22px]' : 'left-0.5'}`}/>
          </span>
        </button>
      </li>)}
    </ul>
    {error && <p role="alert" className="open-text m-0">{error}</p>}
  </div>
}
