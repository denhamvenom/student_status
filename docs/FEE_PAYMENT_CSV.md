# Fee-specific payment CSV

## Bulk Payment full-name correction - October 19

Owner explicitly authorized the production correction. Export and payment review now use the full student legal name, preserving last names when a preferred name is only a first name. CSV columns, identifiers, financial behavior and settings are unchanged. Existing downloaded files need to be downloaded again to show the corrected names.

Source ad61740 passed lint, typecheck, all 495 tests in one single-worker run, and production build; independent review found no blockers. Development third-bandicoot-18 and production amicable-eel-413 synchronization succeeded with backend typecheck/schema validation. Read-only production export verification confirmed full multi-part names on every exported row; no financial writes were performed. This code release also carries the previously published PR19 deployment documentation onto main. Automatic website build results are recorded in the release PR after merge.

## Approved behavior

The owner requested a Bulk Payment workflow that selects a shared fee, exports assessed students, and imports new payments applied directly to that fee. The export filters are All assessed students, Fully paid students, and Students who still owe money (including partial balances). Students not assessed the fee are excluded.

The spreadsheet includes student identity, fee/charge identity, charged amount, amount already applied, amount still owed, and a blank new-payment amount. Stable export and row identifiers must be retained. Blank amounts are skipped. New receipts never spend existing available funds or follow unrelated fee priorities. Amounts above the selected charge's remaining balance are refused for review.

Upload leads to one payment review and explicit confirmation. Date and payment method are explicit; receipt reference is optional. Exported account/charge revisions are checked again before saving. A changed balance requires a fresh export/review. Retries must recognize previously saved rows, including across browser reloads and financial editors, without double posting.

## Scope and delivery

Implemented in development source: fee selector and three export filters, bounded paginated CSV download (up to 500 assessed students), strict CSV parsing, authoritative server review, and explicit confirmation. Server-stored manifests bind receipt details and each row; successful rows are idempotent across staff accounts and reloads. Resume with the same date, method and reference. Blank references receive an automatic batch reference. Existing general bulk payments and receipt correction remain available. No production records are changed for feature testing. Development publication and deployment evidence will be recorded when complete. Production release remains separately controlled.

## Verification

Five backend tests cover direct allocation, existing other-fee debt, access controls, replay/changed manifest, stale/overpayment checks, active-season scope, partial resume and paid/unpaid filters. Six CSV tests and five existing payment/invitation tests passed; typecheck and scoped lint passed. Independent source review found no blockers. Actual component tested with an isolated mocked backend: synthetic CSV upload reached Review with the correct fee, authoritative name/balances, total and explicit Confirm; 1440px light and 390px dark layouts showed no horizontal overflow. This is not an authenticated or real-payment rehearsal. Combined lint/typecheck/build passed. Full suite passed 493 of 495 cases; two existing large-fixture tests timed out under parallel load, then both unchanged suites passed 35/35 with one worker. All 495 cases passed across those runs. Development sync to third-bandicoot-18 succeeded with backend typecheck; email sending remained disabled. No production deployment.

## Production publication

Released through PR19 / main c861f1d with the matching backend deployed. Both website builds succeeded. Parent email is enabled in production; development sending stays disabled. Read-only Coach/fee-export checks and Close details passed. No live payment import or real invitation/Google round trip was performed. See [combined release evidence](releases/RELEASE_2026-10-19.md). Earlier pending-production statements above are historical.
