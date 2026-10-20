import type { ConsentProfileV2 } from '../consentProfileV2Schema';
import { normalizeChangedEmail, normalizeChangedPhone } from '../../shared/contact-format';
/** Only editable inputs use these rules; historical signed snapshots are untouched. */
export function normalizeConsentContacts(value: ConsentProfileV2, previous?: ConsentProfileV2): ConsentProfileV2 {
  return { ...value,
    guardian: { ...value.guardian, phone: normalizeChangedPhone(value.guardian.phone, previous?.guardian.phone, 'Guardian phone'), email: normalizeChangedEmail(value.guardian.email, previous?.guardian.email, 'Guardian email') },
    emergency: { ...value.emergency, phone: normalizeChangedPhone(value.emergency.phone, previous?.emergency.phone, 'Emergency contact phone') },
    physician: { ...value.physician, phone: value.physician.phone === null ? null : normalizeChangedPhone(value.physician.phone, previous?.physician.phone, 'Physician phone') },
  };
}
