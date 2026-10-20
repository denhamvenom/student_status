# Staff profile setup

## Scope and behavior

Development-only October 20 feature. Accepted staff accounts (Coaches, Mentors and Travel Leads) see a three-step wizard when basic information is incomplete. It collects full name, phone, adult shirt size and emergency contact name, relationship and phone; account email is established by sign-in/invitation and is not requested or repeated in the wizard. Existing saved values prefill the form. Existing complete staff profiles bypass it. Student/parent setup and invitation acceptance remain unchanged.

Staff can choose Skip for now (only the current mounted session; refreshing or signing in again can prompt again) or Don’t ask me again (permanent account preference across logins and seasons). Both leave missing information missing. A permanent skip is not reported as a completed profile. Profile remains accessible later, including for Coaches. Filling or editing a profile does not reset the permanent preference.

The wizard keeps unfinished answers in memory and saves only on Finish setup. Going Back preserves answers; leaving/reloading before finishing does not save them. A stale profile revision requires reloading the saved information, with explicit notice that unsaved answers are replaced. Save/dismiss failures keep the wizard open with recovery. No automatic browser storage or draft persistence.

## Data and access

Existing appUsers personal fields are reused. The optional staffSetupDismissedAt timestamp records permanent dismissal without a backfill. ownBasics, saveBasics and dismissSetup derive the current active staff account; callers cannot choose another account. Writes validate roles, bounded fields and expected profile revision. Basic-profile changes and dismissal never modify driver records, approvals, email or role/access grants. Existing Adult Profile self-editing also supports Coaches; its driver approval rules remain in force.

## Verification and release boundary

Twelve focused backend tests passed, including active-role access, existing complete/incomplete records, self-only writes, revision conflicts, unchanged driver/access fields, permanent preference across sessions/seasons and later editing. Independent review clear. Synthetic actual-component browser checks passed at 1440x900/light and 390x844/dark: required inputs, prefill, Back/review/finish, temporary skip without mutation, permanent skip, already-complete/dismissed bypass, failed preference save/retry, stale-data reload. Screenshots inspected; no horizontal overflow. Evidence stays ignored under .test-temp/staff-setup-ui.

Lint, application typecheck/build and development third-bandicoot-18 sync with backend typecheck passed. Full suite: 561 of 562 tests passed; the unrelated 501-charge fee-history test exceeded its existing 30-second limit, including isolated retries. The same isolated baseline test passed close to the limit (28.7 seconds total). No assertions/timeouts were changed; fee-test timing remains a separate follow-up, not a claimed clean full-suite pass.

Actual signed-in localhost wizard opened successfully after sync, showing Step 1 and both skip choices. No profile save or dismissal was performed for the user. Coach acceptance remains pending. Production release not authorized.
