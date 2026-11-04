import type { ReactNode } from 'react'
import { newEventWizardCopy } from './new-event-defaults'
import styles from './EventSetup.module.css'

/** One Review line. `changed` rows differ from the event type's starting answers and are shown up front. */
export type ReviewRow = { key: string; label: string; value: ReactNode; changed: boolean }

/** New event Review: the name, type and dates plus only what differs from the defaults; everything else under "All details". */
export function NewEventReview({ rows, className }: { rows: readonly ReviewRow[]; className: string }) {
  const list = (items: readonly ReviewRow[]) => <dl className={className}>{items.map(row => <div key={row.key} style={{ display: 'contents' }}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
  const changed = rows.filter(row => row.changed)
  return <>
    {list(changed)}
    {changed.length < rows.length && <details className={styles.disclosure}><summary>{newEventWizardCopy.allDetails}</summary>{list(rows)}</details>}
  </>
}
