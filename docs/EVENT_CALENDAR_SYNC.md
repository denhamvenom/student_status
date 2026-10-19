# Linked event calendar workflow

## Agreed scope — October 19, 2026

The owner authorized building Student Status event creation/linking and synchronization with the Google Calendar already read by Timeclock. New app events create a calendar entry or explicitly connect to an overlapping existing entry. Calendar-only entries do not automatically become app events. Timeclock manual unscheduled sessions currently stay Timeclock-only; this work does not add a separate Timeclock calendar publisher.

Add the exact checkbox label **Media Support Requested** to creation and editing. Show it on event details and in the linked calendar description. This is a request flag, not a notification or assignment workflow.

Linked title, start/end, location and cancellation stay consistent. Calendar descriptions are preserved apart from the app-managed media marker. Fees, rosters, permission documents, account identities and student information are not copied to Google Calendar. Existing calendar entries are adopted rather than overwritten when first linked. Recurring occurrences must be handled as individual occurrences, not a whole recurring series.

## Delivery and configuration boundaries

Implementation, source review, automated checks, representative synthetic screen checks, and development synchronization are complete. The authorized target is development third-bandicoot-18; production deployment of this feature has not been requested. Existing credentials and Timeclock polling remain intact. No real calendar writes are used as test fixtures.

The owner changed Calendar sharing on October 19. A fresh read-only check verified access role **writer** and successful authentication. The owner explicitly prohibits development Calendar writes because this is the real team calendar. Outbound POST/PATCH requires both `STUDENT_STATUS_CALENDAR_WRITE_ENABLED=true` and the exact production cloud URL `https://amicable-eel-413.convex.cloud`; development cannot write even with that flag accidentally enabled. No environment settings were changed. Production activation remains a separately authorized release step.

## Verification record

Lint, strict types, 506 regression tests, Student Status build, and Timeclock lint/types/build passed. Final backend corrections passed scoped lint and all seven Calendar tests again. Two added HTTP-mocked tests prove development refuses all external requests even with the flag enabled and uncertain creation retries reuse the same ID while applying the latest details. Astra source review found no remaining material blockers. Development synchronization to third-bandicoot-18 succeeded with typecheck and additive indexes. The deployed Coach-authorized candidate lookup returned successfully against the real Calendar using GET requests only. No live event create/update/cancel was performed.

Actual components with a local fictional backend: desktop 1440px light wizard showed overlap choices; selecting an existing entry adopted its title, time and location; Media Support Requested checked and appeared as Yes on final review. Phone 390px dark linked-event disclosure, editor and lower controls were inspected, with no horizontal overflow. Saves were mocked and never contacted Calendar. This is not an authenticated live save or production verification.

## Behavior and recovery

Only Coach/Travel Lead can manage connections. Stable Calendar identifiers and transactional claims prevent duplicate links. Creation retries reuse a deterministic identifier. Conditional writes refuse concurrent Calendar changes. A conflict offers Reload Calendar details explicitly, discarding the unsynced app changes; the editor also refuses stale local drafts. An unavailable initial selection can be replaced before a link is established.

Existing entries retain their details on connection. Timed and all-day occurrences are supported; repeated entries link to one occurrence. All-day schedule dates are edited in Google Calendar, while their changes sync back into the app. Managed media text preserves other description content. Linked changes use the existing minute Calendar polling; full resets reconcile linked entries directly. Calendar identity and observation/revision checks fence stale or changed-source data.

Material title/location/schedule/cancellation changes preserve signed originals but require new permission coverage. Earlier schedules clamp signup/room deadlines to the new start. Cancellation remains visible and stops new signups, approval, enrollment, new consent forms and readiness claims. Running/failed Whole Team assignment terminates as cancelled without erasing processed participation or charges. Financial correction and withdrawal history remain available; no automatic refund is implied.

## API references

Implementation follows Google's [event insertion contract](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [event listing contract](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), and [conditional updates with entity tags](https://developers.google.com/workspace/calendar/api/guides/version-resources). Retries must reuse the same calendar event identity; concurrent edits must not silently overwrite changes.
