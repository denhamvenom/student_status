import type { AudienceEventFields } from '../../../convex/lib/eventAudienceRules'
import { Card, CardContent } from '../../components/ui/card'
import { eventAudienceLabel, eventLocationTypeLabel, eventRequiredLabel } from '../event-setup/event-audience-wiring'
import styles from './Operations.module.css'
import { audienceDisplayLabel } from './event-page'
import { eventMentorsCopy } from '../mentor-invites/copy'

type AudienceEvent = AudienceEventFields & { locationType?: string; archived?: boolean; cancelled?: boolean }

const copy = eventMentorsCopy

/** Coach / Travel Lead event page: audience, required, in person or virtual. The event's Mentors have their own section (EventMentorsSection). */
export function EventAudienceOperations({ event }: { event: AudienceEvent }) {
  const audience = audienceDisplayLabel(event, eventAudienceLabel(event))
  return <details className={styles.disclosure}><summary><strong>{copy.title}</strong><span>{audience} · {eventLocationTypeLabel(event)}</span></summary><div className={styles.disclosureBody}><Card><CardContent className="space-y-4">
    <div className="detail"><span>{copy.audience}</span><strong>{audience}</strong></div>
    <div className="detail"><span>{copy.required}</span><strong>{eventRequiredLabel(event)}</strong></div>
    <div className="detail"><span>{copy.where}</span><strong>{eventLocationTypeLabel(event)}</strong></div>
  </CardContent></Card></div></details>
}
