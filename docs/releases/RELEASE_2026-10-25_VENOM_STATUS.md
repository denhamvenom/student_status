# Venom Status pre-redesign release — October 25, 2026

Release: v0.1.0-onboarding.19. Owner explicitly authorized merge and production deployment after a security check. Merged PR39 at 7376a7190214048ba00f529ec64e205f15db5632 on October 25 at 7:20 PM Central. Reviewed head 29617bc7c4b0275f2845a1a69e4fed2acdacd39e.

## Contents

- PR39: development-only developer sign-in for six fictional accounts (guarded by the hard-coded development URL, a server switch and key, and a production-build check).
- PR40: US spelling and the `…` character in user-facing text; flaky-test fixes.
- PR41: page-level error boundary so a failing page keeps the menu; fictional developer Parents get a verified-parent record.
- PR42, PR44, PR45: plain-language server messages for money, permission forms and all other areas. Parents no longer see PDF hashes; Coaches and Travel Leads see "Reference codes". Owner-approved permission-form PDF wording. Team report CSV money columns are dollars.
- PR43: one six-digit invitation code for team and individual invites; the join page asks for a name only for team codes. Outstanding five-digit codes still work until they expire. Team join requests now share the per-account code limits (security review).
- PR46: the app is renamed **Venom Status** for people; infrastructure names are unchanged.
- PR47: Coach-only Contact admin button for five setup errors; requests are recorded (`adminContactRequests`) and emailed to admin@team8044.org with no student data.
- Approved terms: `docs/LANGUAGE.md`.

## Validation and rollout

- Security review (independent reviewer): no Critical or High findings. Developer sign-in cannot run on production (URL pin, switch, key) and was confirmed absent from production settings and from the production bundle. Two findings were fixed before merge: the join-request rate limit and Contact admin retry consistency. Open low items: outstanding five-digit codes remain guessable at a low rate until they expire; developer sign-in uses one shared rate-limit key (development only).
- Backend review: no blockers. Mechanical check: of 112 changed source files, 77 changed only string text; the rest are the intended features, and the permission and Zeffy files flagged by the checker were verified to change only messages.
- Final tree: lint, types, 712/713 tests (the known 30 s `feeBulk` timeout; 9/9 when run alone), Student Status and Timeclock builds, both Cloudflare packaging dry runs.
- Development `third-bandicoot-18`: all six developer accounts opened every menu page with no errors at 1440 light and 390 dark; only the known Coach Season 390px overflow remains.
- Production Convex `amicable-eel-413` deployed before the main merge: schema validation passed, the `adminContactRequests` index was added, and no indexes were deleted. `adminContact:request`, `bulkInvites:checkInvitationCode` and `developerSignIn:available` are present.
- Student Status Worker version 4970df44-a078-4501-a53f-7ce013e93db4 at 100% (automatic rollout). https://students.team8044.org returned HTTP 200 with the title "Denham Venom · Venom Status". All five JavaScript/CSS files match a local production build against the production backend byte for byte; entry `index-BvK3H5ei.js` SHA-256 e953f91ff0f8643d91ac9ea791b84b6e503299dee15a5fd51e96663269b293c8.
- Timeclock Worker version 6c05cab1-38cd-4dbb-b5f1-d0977b9a6f2a at 100%; https://timeclock.team8044.org returned HTTP 200.
- Not done: a real-account walkthrough on production, a real Google join with an invitation code, real email delivery (invitations or Contact admin).

## Rollback limits

Previous Student Status Worker: c086729f-2046-4e6f-a480-0a4971724ec7. Previous main: 51ca4d5c5df403911383fd60648dce4e2655ad40. A frontend rollback restores that version. The new backend is backward compatible with the previous frontend (`bulkInvites.previewCode` is kept); keep the additive `adminContactRequests` table if reverting backend code. Six-digit individual codes issued after this release are not accepted by the previous five-digit-only frontend check, so a rollback would require replacing those codes.

## Security note from this session

While checking production settings, a command meant to list setting names also printed fragments of a multi-line private key value (JWT_PRIVATE_KEY or TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY) into the working session transcript. Nothing was committed or published. Rotation was recommended to the owner; status is recorded in HANDOFF.md.
