# Google production setup — approval packet, October 17, 2026

Execution update October 17: owner approved the new Google project, shared client, scoped access and private production credential replacement. Created denham-venom-production under dsroboticsfoundation.org (organization 90524038636). IAM shows creator admin@team8044.org automatically has Owner; no manual role grant was made. OAuth wizard prepared with Denham Venom, admin support/contact and External audience; final User Data Policy acceptance awaits action-time confirmation. Client creation and credential replacement remain incomplete. No deployment, merge or OAuth publication. Prior approval-pending text below is historical for this batch.

Status: source/policy review and configuration proposal complete; execution awaits owner approval. No Google configuration, IAM, credentials or production settings changed during this review.

## Audience and policy conclusion

Owner confirmed 50 students, 15 mentors and up to 100 parents per year, with personal Gmail and school-managed accounts allowed. This is up to 165 distinct users before any additional Coach accounts. The intended audience exceeds the personal-use threshold and is not confined to the Foundation's managed organization. Treat this as a production app and use separate Google projects for development and production. Invitation-only application access does not make an External Google audience Internal.

Google's [OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies#separate-projects-for-testing-and-production), reviewed October 17, applies to authentication-only OpenID Connect too. Its production definition excludes personal use (fewer than 100 people, all personally known), development/testing/staging and organization-restricted internal use. The [production compliance guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance) requires separate projects and excludes development-only origins and callbacks from production clients. Separate clients in the current project are insufficient for this launch audience.

## Fit with the implemented software

Both frontends use the same Convex Google provider and production backend, amicable-eel-413. One production Web application client therefore serves both apps. Source inspection: convex/auth.ts supplies verified identity mapping without added scopes; the installed Convex Auth authorization builder defaults the Google OIDC request to openid/profile/email. convex/calendar.ts independently uses a service-account assertion with calendar.readonly. No Calendar permission belongs in user sign-in.

Google's [audience guidance](https://support.google.com/cloud/answer/15549945?hl=en) exempts basic identity-only requests from Testing's usual tester-list/warning/seven-day authorization behavior. This is not an exemption from production project separation and does not prove application session lifetime. School administrators may independently restrict sign-in; production verification must include an authorized representative school account if that account type will be used. No roster or account addresses are needed in this document.

## Proposed setup for approval

| Item | Exact proposal |
| --- | --- |
| Existing project | Retain student-status-511411 under DS Robotics Foundation for development/testing and the existing Calendar service account. Leave its clients, support email, IAM and calendar integration unchanged in this batch. |
| New project | Display name Denham Venom Production; preferred project ID denham-venom-production. Availability and organization constraints must be checked at creation; if unavailable, propose the exact alternative before creating it. No billing account attachment or paid service activation in this batch. |
| Organization | DS Robotics Foundation; verify its selected organization identity in the console before creation. |
| Access | Use the existing authorized organization administrator to create the project. Inspect inherited access first. If needed, grant admin@team8044.org OAuth Config Editor (roles/oauthconfig.editor) on the new project only. No new broad Owner/Editor grants or organization-policy changes. Existing-project grants do not automatically confer new-project access. |
| Branding | Denham Venom; responsible organization DS Robotics Foundation operating Denham Venom Team 8044; support admin@team8044.org; developer contact admin@team8044.org. Retain any other previously approved contact only if confirmed from the existing configuration. |
| Audience | External; initially Testing. Do not click Publish app, Verify Branding or Publish branding in this setup batch. |
| Data access | Declare only openid, userinfo.email and userinfo.profile (console equivalents of runtime openid/profile/email). No sensitive/restricted user scopes or unrelated API enablement. |
| OAuth client | Web application, name Denham Venom Production. One client for both frontends. |
| JavaScript origins | https://students.team8044.org and https://timeclock.team8044.org only. |
| Redirect URI | https://amicable-eel-413.convex.site/api/auth/callback/google exactly. No localhost, development callback or preview URLs. |
| Authorized domains | team8044.org and the provider callback domain entry accepted by Google's form. Inspect the accepted registrable-domain handling for amicable-eel-413.convex.site; never claim ownership of convex.site or add a guessed domain. |
| Credentials | Privately replace only AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET on production amicable-eel-413 after the new client is created and reviewed. Never display, log, screenshot or commit values. No development credential edits. |

The existing Denham Venom Production client in student-status-511411 remains unused after cutover; do not delete it in this batch. Record that it is superseded, then consider retirement separately after successful real-origin sign-in. Do not rotate JWT_PRIVATE_KEY/JWKS or change SITE_URL, TIMECLOCK_SITE_URL, calendar settings, PIN, bootstrap or real-signing gates.

## Hosting and verification prerequisites — later release batch

Public URLs are prepared in code but not hosted: https://students.team8044.org/about, https://students.team8044.org/privacy and https://students.team8044.org/terms. Leave Google URL fields unset until those pages are publicly reachable over HTTPS through an approved deployment. Register those exact URLs afterward.

[Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) covers public identity, policy links and domain ownership. Brand verification is distinct from sensitive/restricted scope review, which is not indicated by the current login scopes. Confirm team8044.org Search Console ownership through an eligible project-associated account. Saved authorized-domain entries are not proof of verification. Resolve Google's treatment of the hosted Convex callback before submission; if it requires a custom auth domain or different configuration, present the concrete impact and cost for approval rather than altering the backend or purchasing an upgrade.

After separately approved hosting and OAuth publication, verify one real-origin sign-in/return/sign-out path from each app and the intended account types. Reuse accepted development authorization evidence; only expand checks for changed behavior or a concrete failure. Google login does not grant an application role. Coach bootstrap, enrollment and physical-device checks remain governed by the existing release plan.

## Execution and validation boundaries

Approval requested for the proposed new project, narrowly scoped access if required, unpublished branding/client configuration, and private replacement of the two production Google credential settings. This is a new configuration batch; earlier completed approvals remain valid and need no reconfirmation. The owner explicitly requested this packet before changes.

If approved: inspect target/access, create project, configure draft OAuth settings/client, privately transfer credentials, verify setting presence and privately compare the intended client ID without outputting it, and record completion. If required fields or access cannot be satisfied within this packet, stop that dependent action and report the exact gap. Do not claim a live OAuth round trip before deployment.

Current validation is documentation/policy/source review only. No application code changed and no application tests were rerun. Git remote verified at review start: feature/student-status-completion 8df78c316090f8d93cf751cf36d3cb415a90e5eb; main 18ef1c27b35f7a30a3c6edeb572d8eb452301538; PR10 open/draft against feature/student-status-readiness-design. Pages remains main/root. Google console configuration details are inherited from the saved prelaunch evidence, not a fresh console inspection in this review.

No deploy, merge, Pages switch, OAuth publication, bootstrap, real signing, data import, paid upgrade or credential deletion is included. The next release decisions remain in LAUNCH_CONFIGURATION_PLAN.md.
