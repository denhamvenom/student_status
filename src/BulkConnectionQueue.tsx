import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { ConfirmAction } from './ConfirmAction'

export function BulkConnectionQueue() {
  const requests = useQuery(api.bulkInvites.listConnectionRequests, {})
  const decide = useMutation(api.bulkInvites.decideConnection)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  async function act(requestId: Id<'bulkInviteConnectionRequests'>, approve: boolean) {
    setBusy(true); setNotice('')
    try {
      await decide({ requestId, approve })
      setNotice(approve ? 'Account connection approved.' : 'Account connection declined.')
    } finally { setBusy(false) }
  }
  return <section className="card">
    <h2>Account connection requests</h2>
    <p>Verify that the Google account belongs to the named student before approving. Approval grants access to that student’s existing record.</p>
    {!requests ? <p className="muted">Loading connection requests…</p> : !requests.length ? <p className="muted">No account connections waiting for approval.</p> : <div className="table-wrap"><table><thead><tr><th>Student record</th><th>Google account</th><th>Requested</th><th>Actions</th></tr></thead><tbody>{requests.map(request => <tr key={request.requestId}>
      <td data-label="Student record">{request.studentName}</td>
      <td data-label="Google account"><strong>{request.googleName}</strong><p className="open-text">{request.googleEmail}</p></td>
      <td data-label="Requested">{new Date(request.createdAt).toLocaleDateString()}</td>
      <td data-label="Actions"><div className="action-row">
        <ConfirmAction disabled={busy} description={`Approve ${request.googleEmail} as ${request.studentName}? This Google account will gain access to the existing student record.`} onConfirm={() => act(request.requestId, true)}>Approve connection</ConfirmAction>
        <ConfirmAction disabled={busy} description={`Decline the connection from ${request.googleEmail} to ${request.studentName}? The account will not be connected.`} onConfirm={() => act(request.requestId, false)}>Decline connection</ConfirmAction>
      </div></td>
    </tr>)}</tbody></table></div>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
