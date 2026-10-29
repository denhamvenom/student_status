# Parent permission signing switch — October 29, 2026

Released through PR #54 (`feature/permission-signing-switch`, source `6f67846678e31ce13f019c3ce6ae7a66c7c2e8d7`), merged as main `24497181a6f39afe597a3b7a803f67c126a283b5`.

## Scope and order

- Added a Coach/Travel Lead On/Off switch for parent permission signing. It defaults Off for existing production seasons, so parent signing prompts are hidden until a Coach or Travel Lead turns it On. The backend rejects parent signing and signature requests while Off. Existing receipts remain readable.
- Production Convex `amicable-eel-413` deployed first from `6f67846`; CLI confirmed `https://amicable-eel-413.convex.cloud`, schema validation, and no index deletions. The schema adds optional `seasons.permissionSigningPaused`, `permissionSigningChangedBy`, and `permissionSigningChangedAt`. No env vars, data mutations, bootstrap, or migrations were run. The dry run reported a Node.js action server-version config change.
- PR #54 merged afterward, triggering both Cloudflare Worker builds.

## Validation

- `bun run check` passed: lint, typecheck, 135 test files / 994 tests, and production build. `bun run cloudflare:check` passed. `git diff --check` passed before commit.
- GitHub check-runs on merge `2449718` succeeded for `denham-venom-student-status` and `denham-venom-timeclock`.
- `https://students.team8044.org` returned HTTP 200. Its entry asset changed from `index-d8kbF-A2.js` to `index-Dbh47rqI.js`; the loaded `LiveApp-DukV49VN.js` contains “Parent permission signing”.

## Limits and rollback

- Signed-in production role and switch behavior remain unobserved (VERIFY). Timeclock served asset was not checked (VERIFY). Worker version IDs were not recorded (VERIFY).
- Restore the previous Worker versions only after confirming their IDs in Cloudflare (VERIFY). Keep the additive Convex schema; do not erase signing settings or audit records. Turning signing Off through the authorized UI pauses future parent signing without rewriting existing receipts.
