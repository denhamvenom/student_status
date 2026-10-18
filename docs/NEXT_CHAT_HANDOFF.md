# Next step: Google launch prerequisites and controlled onboarding

Owner follow-up October 17: footer-only About/Privacy/Terms navigation cleanup is queued for the next frontend batch in [PLAN.md](PLAN.md) and [DEVELOPMENT_CHECKLIST.md](DEVELOPMENT_CHECKLIST.md). Not yet implemented or deployed; hosting completion and separate launch gates are unchanged.

The owner-approved October 17 controlled hosting release is complete. Main `60505b4e04976598956bc1353a53e7d4daf63b9d` is deployed to shared production Convex and both Cloudflare Workers; its entire tree matches approved packet checkpoint `574c910`. [Student Status](https://students.team8044.org) and [Timeclock](https://timeclock.team8044.org) passed focused hosting checks. See [HOSTING_RELEASE_LOG.md](HOSTING_RELEASE_LOG.md). OAuth publication, production sign-in acceptance, bootstrap, enrollment and real signing remain separate gates.

Read AGENTS.md, the context-checkpoint skill, CURRENT_STATE.md, HOSTING_RELEASE_LOG.md and GOOGLE_PRODUCTION_SETUP.md. Verify checkout and remote before acting. Documentation is on `docs/controlled-hosting-progress-2026-10-17`; production main remains 60505b4. Do not repeat hosting deployment or accepted tests without a concrete failure.

Prepare the next concrete approval batch: register the now-live Google homepage/privacy/terms URLs, check branding/publication prerequisites, and obtain the appropriate approval before OAuth publication or production onboarding. No secrets need to be supplied again. Keep External/Testing until that separate gate is approved. Do not infer authority for first-Coach bootstrap, enrollment or real signing from the completed hosting batch.

After the relevant approvals, prove real-domain sign-in and role boundaries, then guarded first-Coach/season initialization and representative device workflows. Coach identity coach@team8044.org; Timeclock uses ordinary Mentor. Season/FIRST decisions are settled; private inputs stay outside Git. Paid backups remain deferred and recovery unproven.

Before any future frontend deployment, preserve disabled workers.dev and version preview URLs explicitly; current Wrangler files omit those settings and deployment enabled defaults until corrected in Cloudflare. Preview builds are off. Main merges automatically deploy both websites, so remain release-controlled. No need to change source or redeploy merely for this completed hosting closeout.
