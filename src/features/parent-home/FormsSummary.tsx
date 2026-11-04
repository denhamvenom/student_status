import { formatShortDate } from '../student-home/format'
import { formsSummary } from './logic'

/**
 * Plain summary at the top of the parent Forms page: which upcoming events need a form, and either
 * "Nothing to sign right now" or, while signing is off, "Forms open soon — we'll notify you."
 * Reads only permissions.workspace (events, coverage, signingPaused), which the page already loads.
 */
export function FormsSummary(props: Parameters<typeof formsSummary>[0]) {
  const { needForm, message } = formsSummary(props)
  return <section aria-labelledby="forms-summary-title" className="card">
    <h2 id="forms-summary-title">Events that need a form</h2>
    <p role="status">{message}</p>
    {needForm.length > 0 && <ul>{needForm.map(event => <li key={event.eventId}><strong>{event.name}</strong> · {formatShortDate(event.startsAt)}</li>)}</ul>}
  </section>
}
