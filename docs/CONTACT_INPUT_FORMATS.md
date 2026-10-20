# Contact input formatting and validation

Development work requested October 20, 2026. No production authorization for this change.

## Policy

New or changed US phone input accepts ten digits, common punctuation, or a leading country code 1 and displays as (555) 123-4567. Incomplete typing remains editable; invalid nonempty input must be corrected before saving. Email input is trimmed, normalized consistently with existing email identity matching, and checked for valid address structure. This does not prove mailbox ownership or deliverability.

Optional items remain optional. Existing stored values are not bulk rewritten, trusted OAuth identity remains authoritative, and signed permission snapshots remain immutable. Unchanged legacy contact values must not block unrelated edits. Changes are enforced at input and backend entry points, including applicable CSV/import matching.

## Scope and verification

Covered live entry paths: staff Profile and setup; student setup guardian contacts; parent setup and structured consent guardian/emergency/physician contacts; emergency contact edits; driver management (both endpoints); parent and staff invitations; email sign-in entry; paper permission signer email; and payment CSV student-email matching. Shared input controls format on blur and show accessible errors without disrupting incomplete typing. Wizard Continue paths also validate. Programmatic form reset/prefill clears stale validity. Email uses an email keyboard/autofill hint with custom validation so unchanged legacy values can remain.

Timeclock has no phone/email entry fields; its operator PIN and attendance flows are unchanged. Source review found no missed live entry paths. Historical snapshot validators and trusted OAuth values are unchanged.

Verification: 84 focused backend/helper tests covered (83/84 initial run, corrected one test API-name typo and its three-test file passed); two payment CSV frontend tests passed. Actual shared inputs and staff wizard browser tests passed at desktop and phone widths: typing, blur formatting, malformed-input rejection, optional blanks, legacy preservation, external reset/prefill, Continue, skip, review and save. Desktop/light formatted and phone/dark invalid screenshots inspected. No real profile writes, emails or invitations were used. Development sync passed with backend typecheck.


Final integrated lint, frontend/backend typechecks and application build passed. Existing large-bundle advisory remains.
