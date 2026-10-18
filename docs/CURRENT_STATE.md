# Current integration handoff

The owner-approved October 17 controlled hosting release is complete. Main `60505b4e04976598956bc1353a53e7d4daf63b9d` is deployed to shared production Convex and both Cloudflare Workers; its entire tree matches approved packet checkpoint `574c910`. [Student Status](https://students.team8044.org) and [Timeclock](https://timeclock.team8044.org) passed focused hosting checks. See [HOSTING_RELEASE_LOG.md](HOSTING_RELEASE_LOG.md). OAuth publication, production sign-in acceptance, bootstrap, enrollment and real signing remain separate gates.

Documentation branch: `docs/controlled-hosting-progress-2026-10-17`. Do not merge documentation merely to publish evidence: main now automatically builds both production websites. No application source changes in this closeout.

- Pages preserves `demo-reference-2026-10-17` at original main `18ef1c27b35f7a30a3c6edeb572d8eb452301538`; four public demo files verified byte-for-byte.
- Production backend `amicable-eel-413` deployed once from the release SHA; typecheck/schema validation passed, no indexes deleted.
- Both main-only Cloudflare builds succeeded from that SHA with Bun 1.4.3 and production backend URL. HTTPS roots, SPA reloads and public policy pages verified. No Google sign-in attempted.
- Build token “Denham Venom production builds” remains limited to Workers Scripts: Edit for Team 8044. Owner-approved temporary build-registration permission removed; private transfer file deleted and browser secret memory cleared.
- Default workers.dev and version preview URLs are disabled for both Workers; preview builds are off. Wrangler source omits these flags, so the next controlled deployment must explicitly preserve those settings.
- Google production project/shared Web client and private credential replacement are complete. External/Testing remains; live public URL fields still need registration. Development login, Calendar settings, signing keys and PIN preserved.
- Approved season 2026–2027/year 2027/January 9 midnight America/Chicago (1799474400000); private FIRST inputs not applied. Coach identity coach@team8044.org; Timeclock uses ordinary Mentor.
- Bootstrap/signing gates remain unset. No enrollment, real signing or data import. Paid backups deferred; recovery unproven. Real login/roles, calendar freshness and physical concurrency require later proof.

Astra's final review found no current-hosting blocker; external hosting evidence was supplied by the integration owner, not independently repeated. Existing accepted development checks were retained without redundant broad testing.
