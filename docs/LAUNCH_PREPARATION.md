# Launch preparation — October 16, 2026

This batch prepares code only. No backend/frontend deployment, environment change, real signature, account provisioning or live record change is authorized or performed. The approved one-page PDF and existing evidence remain the baseline.

## Production configuration gates

These are server environment settings, never frontend `VITE_` values. Leave them unset during development and until the intended production deployment and ownership are confirmed.

| Setting | Purpose |
| --- | --- |
| `PERMISSION_REAL_SIGNING_ENABLED` | Exact `true` permits real signing only together with the matching URL below. |
| `PERMISSION_REAL_SIGNING_CLOUD_URL` | Exact approved production Convex cloud URL; must match the running deployment. The existing synthetic development deployment is excluded. |
| `PRODUCTION_BOOTSTRAP_ENABLED` | Exact `true` enables the internal first-Coach procedure only together with the matching URL below. |
| `PRODUCTION_BOOTSTRAP_CLOUD_URL` | Exact approved production Convex cloud URL; must match the running deployment and cannot be the existing development URL. |

Do not infer that the currently existing production deployment is the launch target. Confirm Team ownership first. These settings do not deploy code, configure OAuth, create an event or establish a permission template.

## First-Coach procedure — execution remains gated

1. Confirm the empty production app, Team ownership, OAuth configuration and release revision. Keep development seed helpers unchanged and unused.
2. Have `coach@team8044.org` complete verified Google sign-in at the approved production origin. Infrastructure administrator `admin@team8044.org` is not implicitly granted an application role.
3. After explicit production authorization, temporarily enable the production bootstrap gate for that exact deployment and invoke internal `bootstrap:productionFirstCoach` with the approved season name, competition year and actual start timestamp. Do not guess the season dates or year convention.
4. Confirm the resulting Coach/season and audit entry, then disable/remove the bootstrap enable setting. Existing application users or seasons cause refusal; do not delete or reassign them to bypass that protection. A second invocation is not a reset procedure.

## Real signing — execution remains gated

Enable only after production ownership, access checks, approved template selection and record-retention/recovery preparation. Existing profile completion, Parent linkage and review/signature requirements continue to apply. No event means no event-specific permission request needs to be manufactured; future permission-requiring events use the approved workflow.

Disabling the real-signing enable setting must close new signing without destroying historical receipts. A PDF review prepared under a different signing mode must not be silently submitted under a newly enabled mode. Keep synthetic evidence labeled and readable; do not convert test receipts to real consent.

## Remaining launch gates

Backup plan/billing approval and isolated restoration; Google project/Convex organization ownership; GitHub-connected Cloudflare configuration; real FIRST link; production origin sign-in/access checks; physical tablet/phone rehearsal; monitoring/rollback and retention operating procedure. Production deployment and main merge remain separately approved actions. Native nightly backups are not enabled by this code batch.

## Validation record

Local Student Status and Timeclock typechecks/builds passed. Focused bootstrap identity/empty-target refusal, Mentor attendance equivalence, visible-clock pause/resume/expiry, and permission lifecycle/export checks passed. Permission checks exercise real-mode electronic and paper evidence, Parent Home, Coach acceptance/readiness, disabled/mismatched gates and historical receipt retrieval. These use isolated fictional fixtures, not live records. Scope was deliberately limited; no full test-suite or live multi-device rerun.

Application lint passed with `private-data/**` excluded. The ordinary broad lint invocation encountered four pre-existing explicit-any errors in the ignored private rehearsal preview; that evidence was preserved untouched. Existing Student Status bundle-size advisory remains. Diff whitespace checks passed.

Independent Astra review identified Parent Home and coverage still assuming synthetic signing, plus empty/unsigned export labeling. All were corrected and the final changed-delta review found no remaining blocker. Approved template, wording and PDF renderer have no diff. No live behavior is claimed for code that has not been deployed. Preserve earlier visual/PDF/CSV checks.

Checkpoint is local only; no Git push, deploy, environment change or live invocation. Production validation, hosting configuration and physical-device proof remain open.

## Changes prepared

- Reconciled Timeclock frontend `15f074d` tablet layout/copy into the integrated checkout, keeping the development label. No unrelated worktree was changed.
- Timeclock and family attendance clocks stop changing query-time arguments while the page is hidden, then refresh immediately when visible. Foreground intervals remain 15 and 30 seconds respectively; calendar sync and three-minute freshness semantics remain unchanged. Reactive subscriptions remain active, so this removes timer-driven work rather than all hidden-tab traffic.
- Mentor reports load the existing bounded season meeting list once and reuse it for each student. Results and limits are unchanged; for 50 students this removes 49 repeated reads of that shared list per report execution.
- Prepared real V2 consent mode and first-Coach provisioning behind disabled server gates. Historical synthetic receipt compatibility, existing access checks and the approved PDF are preserved. Real signing is not enabled by building or committing this code.
- Generated server environment declarations were refreshed offline with the installed Convex template. No backend code generation/deployment service was contacted.
