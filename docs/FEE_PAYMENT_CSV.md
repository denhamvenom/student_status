# Fee-specific payment CSV

## Approved behavior

The owner requested a Bulk Payment workflow that selects a shared fee, exports assessed students, and imports new payments applied directly to that fee. The export filters are All assessed students, Fully paid students, and Students who still owe money (including partial balances). Students not assessed the fee are excluded.

The spreadsheet includes student identity, fee/charge identity, charged amount, amount already applied, amount still owed, and a blank new-payment amount. Stable export and row identifiers must be retained. Blank amounts are skipped. New receipts never spend existing available funds or follow unrelated fee priorities. Amounts above the selected charge's remaining balance are refused for review.

Upload leads to one payment review and explicit confirmation. Date and payment method are explicit; receipt reference is optional. Exported account/charge revisions are checked again before saving. A changed balance requires a fresh export/review. Retries must recognize previously saved rows, including across browser reloads and financial editors, without double posting.

## Scope and delivery

Implemented in development source: fee selector and three export filters, bounded paginated CSV download (up to 500 assessed students), strict CSV parsing, authoritative server review, and explicit confirmation. Server-stored manifests bind receipt details and each row; successful rows are idempotent across staff accounts and reloads. Resume with the same date, method and reference. Blank references receive an automatic batch reference. Existing general bulk payments and receipt correction remain available. No production records are changed for feature testing. Development publication and deployment evidence will be recorded when complete. Production release remains separately controlled.

## Verification

Five backend tests cover direct allocation, existing other-fee debt, access controls, replay/changed manifest, stale/overpayment checks, active-season scope, partial resume and paid/unpaid filters. Six CSV tests and five existing payment/invitation tests passed; typecheck and scoped lint passed. Independent source review found no blockers. Actual component tested with an isolated mocked backend: synthetic CSV upload reached Review with the correct fee, authoritative name/balances, total and explicit Confirm; 1440px light and 390px dark layouts showed no horizontal overflow. This is not an authenticated or real-payment rehearsal. Integrated check and shared development sync pending.
