# Current integration handoff

## October 17 — controlled hosting packet ready for approval

Workspace: this repository, feature/student-status-completion. Candidate 75f1f31ee2f160cbaa4d3a99964a87b9ee34fca2 is remote-verified; subsequent release-packet work is documentation only. PR10 remains draft against feature/student-status-readiness-design. Application files match accepted checkpoint 87134fb. Main/Pages remains 18ef1c27b35f7a30a3c6edeb572d8eb452301538, main/root.

Next: owner reviews [RELEASE_APPROVAL_PACKET.md](RELEASE_APPROVAL_PACKET.md). No hosting/merge approval yet. Packet covers exact-demo preservation, Pages source transition, integration/main release, backend and two Workers. Read-only merge simulation identified index.html and three root demo modify/delete conflicts; approved resolution must preserve current demo on its reference branch and retain candidate application files. No merge performed.

## Completed configuration

- Google production project denham-venom-production under Foundation; one Web client for both apps, exact production callback, basic identity scopes only. External/Testing verified. Owner privately replaced production credentials; both matched the new client in memory without output. Public URL fields await hosting. See GOOGLE_PRODUCTION_SETUP.md.
- Existing student-status-511411 retains development login and approved Calendar service account. Production amicable-eel-413 has ten expected settings; approved Calendar read previously verified HTTP200, signing pair previously validated, owner PIN presence verified. Do not regenerate or request secrets.
- Public About/Privacy/Terms prepared and linked from both apps; approved organization and retention policy recorded in PRELAUNCH_DECISIONS.md.
- Season approved: 2026–2027, year 2027, January 9 midnight America/Chicago (1799474400000). FIRST inputs remain private, not applied.

## Evidence and boundaries

Accepted development visual/source/build evidence remains in VISUAL_CHECKS.md and earlier reviews. No application changes or broad tests for Google/release documentation. Fresh release check verified remote candidate, main, Pages source and PR target; Cloudflare absence is earlier evidence and must be rechecked before creation.

No deployment, main merge, Pages change, OAuth publication, bootstrap, data import or real signing. Bootstrap/signing gates unset; automatic deletion off. Real-domain sign-in, onboarding, calendar freshness and physical concurrency remain release checks. Paid backups deferred; recovery unproven. Completed settings and owner decisions need no repeat approval.
