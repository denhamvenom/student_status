# PWA install and push notifications — November 2, 2026

Released through PR #61 (`feature/pwa-push-notifications`, commits `6dcc68f` and `604a486`), merged as main `ccd9145` on November 2, 2026, and PR #62 (`feature/install-banner`, commit `5fbcbe3`), merged as main `ddc3234` the same day.

## Scope

- Installable app: web app manifest, icons (including maskable), Android shortcuts (Events, Money, Forms, Inbox), safe-area insets and an offline banner.
- Service worker `public/sw.js`: offline shell, push display, notification click, and an update toast. It runs only in production builds.
- Install prompts: iOS Add to Home Screen walkthrough and an Android `beforeinstallprompt` button. PR #62 adds a Home install banner for Students and Parents on phones (Android uses the captured prompt with an 8 s timeout, otherwise menu steps; iPhone/iPad Safari shows short steps, and other iOS browsers are told to use Safari). Close hides it for 14 days; once installed, a one-time Turn on notifications card appears. Never shown on desktop, in the installed app, or to staff.
- Web Push through Convex and `web-push` (VAPID), with an endpoint allowlist (HTTPS to known push services only).
- Inbox, notification bell and app badge.
- Per-category preferences: schedule, announcements, forms, events, money, travel, staff. Mentors are not offered travel.
- Quiet hours Monday–Friday 07:30–16:00 America/Chicago; urgent notifications bypass them.
- Instant triggers, reminders R1–R7, and 5 PM money/travel/staff digests.
- Due dates on fees and charges.
- Announcements gain Staff and Everyone audiences; only Coaches can mark or change urgent announcements.
- Bounded sign-out that removes this device's push subscription (shared devices).
- The developer sign-in guard now fails every `vite build`, whatever the mode.

## Backend

- Additive schema only. New tables: `pushSubscriptions`, `notifications`, `notificationPreferences`, `notificationDigestItems`. New optional fields: `charges.dueAt`, `feeDefinitions.dueAt`, `teamAnnouncements.urgent`, and `staff`/`everyone` values for `teamAnnouncements.audience`. New indexes include `appUsers.by_parentStaffAccess` and `roomInvites.by_invitedBy_and_createdAt`. No index deletions.
- New crons: hourly `notification digest` and `notification reminders`. Each handler acts only at its America/Chicago local hour: the digest flush runs at 5 PM; R3–R5 run every hour. There is also a daily `delete old notifications` purge.
- Shared helpers: `convex/lib/notificationTriggers.ts`, `convex/lib/notify.ts`, `convex/lib/eventAudience.ts`, `convex/lib/notificationCategories.ts`, `convex/lib/pushEndpoint.ts`.
- New optional Convex env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Setup for any other deployment: generate keys with `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:<team address>` on that Convex deployment. Development `SITE_URL` is `http://localhost:5173`, so `vite preview` must run on `localhost:5173` to sign in there.

## Order

1. Production Convex (prod deployment) deployed before the merge from a clean worktree at exactly `604a486`. Additive schema and the new crons as above.
2. The owner set production `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Values are not recorded here.
3. PR #61 merged with a merge commit as main `ccd9145`; Cloudflare Workers Builds deployed on merge.
4. PR #62 (frontend only, no Convex change) merged as main `ddc3234`; Cloudflare Workers Builds succeeded.

## Validation

- PR #61: lint, typecheck and build passed; 541 targeted tests passed. In the full suite, the only failures were load timeouts that pass alone.
- PR #62: lint, typecheck and build passed; frontend tests 653 of 654. The one failure was an unrelated `field-trip-pdf` timeout, which passes alone.
- Security reviews of the push backend and service worker, triggers, sign-in/sign-out, and the persona fixes; findings were fixed before release.
- Synthetic persona passes (Student, Parent, Coach, Travel Lead, Mentor) on the development deployment. Their findings were fixed in `604a486`.
- Real push received on desktop Chrome using a local production build against the development deployment.

## Live evidence

- Production `/sw.js` is served with `Cache-Control: no-cache, max-age=0, must-revalidate` and a JavaScript content type; `/manifest.webmanifest` is served as `application/manifest+json`; icons return HTTP 200.
- No errors in recent production Convex logs after the deploy.
- PR #62: banner code confirmed in the deployed bundle.

## Limits and rollback

- Not verified: real iPhone (Home Screen app) and Android install and push on production (VERIFY). Android's wait on the Install button was seen only in DevTools emulation. Signed-in production walkthrough not done (VERIFY). Worker version IDs not recorded (VERIFY).
- Inbox items do not show an Urgent badge (announcements do).
- Staff and parent setup prompts reappear on reload (pre-existing). Finance wording still uses jargon (pre-existing).
- Windows can block Chrome notifications at the OS level; help text covers it.
- The development `DEVELOPER_SIGN_IN_KEY` was printed once in a test log and should be rotated (development only).
- Owner decisions pending: sign-in session length (about 30 days), and whether virtual events need permission forms (sprint 2).
- Restore previous Worker versions only after confirming their IDs in Cloudflare (VERIFY). The backend change is additive, so the previous frontend keeps working against it. Per source (not exercised on production), removing the VAPID env vars stops push sends without a deploy, and notifications stay in the inbox.
