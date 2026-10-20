# Staff profile setup

## Scope and behavior

Development-only October 20 feature. Accepted staff accounts (Coaches, Mentors and Travel Leads) see a four-step wizard when basic information is incomplete. It offers optional full name, phone, adult shirt size and emergency contact name, relationship and phone; account email is established by sign-in/invitation and is not requested or repeated in the wizard. Existing saved values prefill the form. Existing complete staff profiles bypass it. Student/parent setup and invitation acceptance remain unchanged.

Staff can choose Skip for now (only the current mounted session; refreshing or signing in again can prompt again) or Don’t ask me again (permanent account preference across logins and seasons). Both leave missing information missing. A permanent skip is not reported as a completed profile. Profile remains accessible later, including for Coaches. Filling or editing a profile does not reset the permanent preference.

The wizard keeps unfinished answers in memory and saves only on Finish setup. Going Back preserves answers; leaving/reloading before finishing does not save them. A stale profile revision requires reloading the saved information, with explicit notice that unsaved answers are replaced. Save/dismiss failures keep the wizard open with recovery. No automatic browser storage or draft persistence.

## Data and access

Existing appUsers personal fields are reused. The optional staffSetupDismissedAt timestamp records permanent dismissal; staffSetupCompletedAt records finishing the wizard, even when individual items were skipped. Neither requires a backfill. ownBasics, saveBasics and dismissSetup derive the current active staff account; callers cannot choose another account. Writes validate roles, bounded fields and expected profile revision. Basic-only saves and dismissal never modify driver records or approvals. Optional explicit driving changes use the existing owned-driver validation and approval-reset rules; no email or role/access grants are changed. Existing Adult Profile self-editing also supports Coaches; its driver approval rules remain in force.

## Verification and release boundary

Twelve focused backend tests passed, including active-role access, existing complete/incomplete records, self-only writes, revision conflicts, unchanged driver/access fields, permanent preference across sessions/seasons and later editing. Independent review clear. Synthetic actual-component browser checks passed at 1440x900/light and 390x844/dark: required inputs, prefill, Back/review/finish, temporary skip without mutation, permanent skip, already-complete/dismissed bypass, failed preference save/retry, stale-data reload. Screenshots inspected; no horizontal overflow. Evidence stays ignored under .test-temp/staff-setup-ui.

Lint, application typecheck/build and development third-bandicoot-18 sync with backend typecheck passed. Full suite: 561 of 562 tests passed; the unrelated 501-charge fee-history test exceeded its existing 30-second limit, including isolated retries. The same isolated baseline test passed close to the limit (28.7 seconds total). No assertions/timeouts were changed; fee-test timing remains a separate follow-up, not a claimed clean full-suite pass.

Actual signed-in localhost wizard opened successfully after sync, showing Step 1 and both skip choices. No profile save or dismissal was performed for the user. Coach acceptance remains pending. Production release not authorized.


## Individual skipped answers
Every item is optional. Continue accepts blank fields; review shows Skipped. Finish saves supplied values and preserves earlier values for skipped fields (including the account name). Finishing records that setup was reviewed, so missing answers do not cause another prompt. The separate temporary/permanent whole-wizard choices remain. Focused13 backend tests, typecheck and synthetic desktop/phone browser flow passed, including partial save, preserved values and returning-session bypass. Development only.


## Optional driving and trailer step
Driving is step 3 before Review. Staff may offer to drive students, provide vehicle/passenger seats and indicate trailer capability. It uses the same contact phone; no separate driving phone input. If phone was skipped, Add contact phone returns to step 1. The informational driver-list/assignment/approval paragraph is omitted as requested.

Untouched driving or Skip driving step omits driver changes entirely, preserving saved details and approval. Explicit changes validate original driver fingerprint and profile revision atomically; changed driver details require approval as before. Capacity, duplicate-email reconciliation and unavailable-season states explain why driving edits cannot be saved and allow the rest of setup to continue. Towing is a capability of the existing student-driver record; trailer-only records are not introduced.

Verification: 17 focused backend tests passed; independent review, focused lint/types and synthetic 1440/light and 390/dark browser checks passed for shared phone, vehicle/seats/trailer save payload, edited-then-skipped and blocked context continuation. No real profile saves for testing. Development-only sync; production unchanged.
