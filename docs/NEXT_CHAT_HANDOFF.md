# Next phase: release approval and controlled launch

October 17 OAuth review: owner confirmed up to 165 users (50 students, 15 mentors, up to 100 parents) and personal/school accounts. Separate production Google project is required for the planned audience. See [GOOGLE_PRODUCTION_SETUP.md](GOOGLE_PRODUCTION_SETUP.md) for the concrete approval packet: retain existing development/calendar project; propose new Denham Venom Production project and one Web client for both apps. Execution, new-project IAM and private production credential replacement await owner approval. Nothing changed in Google or production. This supersedes earlier statements that policy applicability remains unknown.

Read AGENTS.md, CURRENT_STATE.md, PRELAUNCH_DECISIONS.md and LAUNCH_CONFIGURATION_PLAN.md. Verify branch/dirty state/remote; do not reset or scaffold.

Published application/prelaunch checkpoint: `87134fb441aadc70598739fc05d61fa2258ab360`, branch `feature/student-status-completion`, draft PR10 targeting `feature/student-status-readiness-design`. A documentation-only boundary reconciliation follows; verify the latest remote revision. Main remains `18ef1c27b35f7a30a3c6edeb572d8eb452301538`, Pages main/root.

Prelaunch public pages and approved configuration are complete. Google support email saved; ten production settings present including approved calendar and owner-entered PIN. No deployment/merge/Pages switch/OAuth publication/real signing. Do not generate keys again. Season values and private FIRST inputs are recorded in CURRENT_STATE.

Next actions require release authorization: Pages preservation transition, main merge, backend and two Workers, public URLs/HTTPS and Google publication prerequisites. Review and obtain approval for GOOGLE_PRODUCTION_SETUP.md before creating the separate production Google project or replacing credentials. Cloudflare initial creation triggers Deploy; no saved Worker configuration exists yet.

Application Coach identity is coach@team8044.org; infrastructure admin access does not grant the Coach role. Use an ordinary Mentor account on shared Timeclock devices. Never request the operator PIN or credentials in chat.

After approved release, verified Coach sign-in precedes empty-target bootstrap; disable flag immediately. Verify real-origin flows, role boundaries, calendar freshness and physical devices. No fake signatures or data migration. Real signing separate; backups/paid upgrade deferred and recovery unproven.

See CURRENT_STATE for current validation/publication and PRELAUNCH_DECISIONS for adopted operating policy. No need to repeat broad visual/auth audits.
