# Prelaunch decision packet — October 17, 2026

Execution update October 17: owner approved the new Google project, shared client, scoped access and private production credential replacement. Created denham-venom-production under dsroboticsfoundation.org (organization 90524038636). IAM shows creator admin@team8044.org automatically has Owner; no manual role grant was made. OAuth wizard prepared with Denham Venom, admin support/contact and External audience; final User Data Policy acceptance awaits action-time confirmation. Client creation and credential replacement remain incomplete. No deployment, merge or OAuth publication. Prior approval-pending text below is historical for this batch.

October 17 OAuth review: owner confirmed up to 165 users (50 students, 15 mentors, up to 100 parents) and personal/school accounts. Separate production Google project is required for the planned audience. See [GOOGLE_PRODUCTION_SETUP.md](GOOGLE_PRODUCTION_SETUP.md) for the concrete approval packet: retain existing development/calendar project; propose new Denham Venom Production project and one Web client for both apps. Execution, new-project IAM and private production credential replacement await owner approval. Nothing changed in Google or production. This supersedes earlier statements that policy applicability remains unknown.

## Latest decision and execution status

Owner approved the organization, operating policy, exact season values, project-scoped OAuth Config Editor role and reuse of the existing calendar/service account on October 17. The proposal text below is retained as the decision record, not an open request. Production calendar settings were installed and compared privately with the approved source; development was unchanged. Google confirmed the role policy update and the admin account can now open Branding; support address admin@team8044.org was selected and saved with Google success confirmation. Owner entered the production PIN and its setting-name presence was verified without reading the value. No deployment or merge occurred.

Public-page review: simplified retention to a short five-year review explanation, kept operational hold/export/device procedures in this internal record, clarified Google identity use and providers, and added a factual browser-storage explanation. `/about` and `/privacy` require no sign-in and are linked from both signed-out screens. Public text reflects approved policy; it is not yet published. Privacy and Terms already carry the October 17 revision date; review that date when publishing, without claiming a launch has occurred.

Sources: [Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) requires a publicly accessible app description and privacy information describing Google data use/storage/sharing. [ICO drafting guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/how-should-we-draft-our-privacy-information/) supports short, accessible, plain-language notices; used as writing guidance, not a determination that UK law applies. Google's [OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies) calls for a terms link, while its brand-verification guide describes terms as optional. Owner subsequently requested a simple Terms page covering authorized use, account responsibilities, misuse, access restrictions and support, excluding permission forms. It is now implemented at `/terms` and linked alongside Privacy.

Prepared for owner review. No deployment, main merge, OAuth publication, real signing or new security role is authorized by this document.

## Public pages and operating policy

Local routes are `/about`, `/privacy` and `/terms`; proposed published URLs are https://students.team8044.org/about, https://students.team8044.org/privacy and https://students.team8044.org/terms. Owner-approved concise wording is implemented; Privacy and Terms carry an October17 revision date. Do not register these as live Google branding URLs until they are publicly reachable after authorized deployment.

Adopted owner decision: DS Robotics Foundation, operating Denham Venom Team 8044, is the responsible organization; the following operating policy was approved October 17. The support address admin@team8044.org is already confirmed.

- Keep the agreed five-year period from Coach archival. Treat its end as a review date, not a promise of automatic erasure; automatic deletion remains off.
- Review the archived student's profile, contact/health information, attendance, participation, financial history and permission evidence together. Keep shared Parent identities and other students' records while still needed for those relationships; do not delete a shared record merely because one student's review date arrives.
- Coach owns record review and reasoned holds. A documented unresolved balance, dispute, safety incident or preservation requirement pauses disposal of relevant records until reviewed and released. Preserve the reason, scope and release decision. This is a proposed operating procedure, not a claim that every record category already has a complete hold/deletion implementation.
- Limit exports to the authorized team purpose and approved access. Keep them in organization-controlled storage, track copies needed for official records, and remove temporary device/download copies after the task. Include retained exports in the same review/hold process. No automated export inventory or remote deletion is claimed.
- Route correction/access/retention requests to admin@team8044.org; the Coach verifies identity and affected records before action. Do not alter immutable signing evidence to satisfy a correction request; use supported correction/history procedures.
- Backups and paid upgrades remain deferred. Do not promise automatic backups, a recovery time or verified restoration. Disposal and real-signing readiness remain separate approvals.

After approval, update the public privacy text to describe adopted practice, remove editorial caveats, and record the effective publication date at release. No legal compliance certification is claimed.

## Google support address

Fresh inspection of the existing admin@team8044.org session cannot open Branding: missing `clientauthconfig.clients.list` and `oauthconfig.verification.get`. No role was granted. Original owner remains able to edit branding; developer contact is already saved.

Proposed approval: grant **OAuth Config Editor** (`roles/oauthconfig.editor`) to admin@team8044.org on **student-status-511411 only**, then use that account to select its own email as support address and verify Save. This role can manage OAuth configuration and clients; it is a security-sensitive expansion. It avoids broad project Editor/Owner. If the dropdown remains ineligible, stop and report; do not escalate further automatically.

Sources checked October 17: [Google support-email eligibility](https://support.google.com/cloud/answer/15544987?hl=en) and [OAuth configuration roles](https://docs.cloud.google.com/iam/docs/roles-permissions/oauthconfig). Google permits the signed-in Workspace account or a managed Google Group as support email; its console lists OAuth Config Editor as a relevant access role.

## Production calendar and PIN

The existing development calendar service-account integration passed a new in-memory authentication and read-only Calendar API probe (HTTP 200 for both) after project migration. No calendar contents or credentials were printed or saved. This does not prove production polling or Timeclock freshness.

Owner decision: confirm the same team calendar and existing read-only service account should be used for production **amicable-eel-413**. If approved, transfer only the three calendar settings privately, verify matching values in memory, and leave development unchanged. Do not create a new key, widen Calendar access or copy the development operator PIN.

Owner action: enter the chosen production `TIMECLOCK_OPERATOR_PIN` directly in the production Convex environment form. Never send it in chat. The ordinary Mentor role remains mandatory for shared devices; the PIN does not isolate the operating system or replace role authorization.

## Season bootstrap values

Supplied: 2026–2027 season, January 9, 2027 kickoff/start date, private FIRST link and QR. Proposed exact bootstrap values: `seasonName: "2026–2027"`, `seasonYear: 2027`, `startsAt: 1799474400000` (January 9, 2027 at 00:00 America/Chicago / 06:00 UTC). This midnight timestamp defines the supplied calendar-date boundary; it is **not** an invented event start time. Confirm the competition-year convention and date-boundary interpretation before bootstrap. No event is created by this proposal.

## Release-only actions, held for later approval

The decisions above are resolved; release authorization remains separate. Preserve current Pages source commit `18ef1c27b35f7a30a3c6edeb572d8eb452301538` in a dedicated reference branch before switching Pages source and merging main. Reverify the source immediately before that action; no branch/source switch has occurred.

Cloudflare Workers Builds still cannot be created through the reviewed dashboard flow without Deploy. Both Workers remain absent. Keep the build matrix in LAUNCH_CONFIGURATION_PLAN.md; BUN_VERSION=1.4.3, root `/`, frozen lockfile, production Convex public URL, previews disabled, separate Worker deploy commands. No Convex deployment secret belongs in frontend builds.

At launch, use a deliberately scoped build token and review its permissions before creation. Cloudflare's automatic token currently includes KV/R2 edit and all-zone route access, which these static apps do not inherently need. Prefer Workers deployment permission on the intended account, with only required account discovery permissions; manage custom domains separately or scope route permission to team8044.org. Exact selectable scopes must be verified in the live token form. Do not create a broad default token during preparation. [Cloudflare build-token documentation](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token).

Release proof must record backend revision, both frontend revisions, HTTPS, public deep links, real-origin Google/invitation/sign-out flows, empty-target first-Coach bootstrap and immediate flag removal, calendar freshness, and tablet/two-phone concurrency/reconnection. Do not fabricate signatures or enrollments for evidence. First release has no earlier production version; withdrawal/maintenance is the fallback, and code rollback does not roll back data.
