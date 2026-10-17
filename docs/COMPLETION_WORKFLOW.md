# Completion-first development

User-directed working policy, October 13, 2026. The goal is a working, verified candidate for Coach visual approval. Preserve the full G1-G7 requirements in GOAL_ACCEPTANCE.md; do not redefine completion around what is already built. Production deployment still requires separate authorization.

## Latest verification direction

The Coach explicitly requested less testing and token use on October 13. Finish functional workflows first. Use targeted verification for permissions, financial correctness and record preservation, one integrated check at meaningful checkpoints, and representative phone/desktop/light/dark comparisons. Do not require every visual state in every viewport/theme permutation. Preserve existing tests, but do not expand their count without a concrete risk. This supersedes exhaustive visual-matrix instructions in older plans and skills; product requirements and production boundaries remain intact.

## Work in complete workflows

- Choose the next user-visible workflow and state its acceptance conditions before starting. Finish its backend, screen, ordinary error/recovery path and essential tests together before starting another dependent feature.
- Prefer the simplest implementation that satisfies the actual requirement and existing architecture. Do not build a generalized framework, speculative migration or extra feature without a concrete need in the agreed workflow.
- Parallelize independent work with explicit file ownership. Use Sol for implementation and Astra for consolidated review. Root owns integration, Git and deployment. Avoid repeatedly reviewing isolated fragments that cannot yet be used.
- Identify the critical path. Assign parallel work only when it shortens that path or completes another required workflow without creating integration conflicts.

## What blocks completion

Fix before approval: incorrect money or source provenance; privacy/authorization failures; lost or corrupted records; unsafe deployment or secrets exposure; broken required workflows; misleading success or missing essential recovery; significant deviation from approved design or accessibility that prevents use; and unmet explicit acceptance requirements.

Defer to the existing checklist's follow-up section: cosmetic micro-adjustments, speculative edge cases with no credible failure path, optional refactors, abstractions for hypothetical future needs, redundant tests and documentation polish. Record a deferred item once with its impact. Do not quietly defer a requested feature, required visual comparison, security check or data-integrity condition. If a proposed deferral materially changes agreed acceptance, explain the tradeoff to the Coach and obtain a decision.

## Make reviews converge

- Review a coherent workflow in one batch. Each finding must identify the affected requirement, a concrete failure or observed mismatch, its impact, and the smallest adequate correction.
- Label findings blocking or follow-up. A reviewer preference alone is not a blocker. Do not expand the review into unrelated code or new product scope.
- Re-review changed areas and unresolved findings, not the entire app after every small edit. After two correction rounds, root and Astra reassess the remaining blockers and choose a direct resolution; this is an escalation of focus, not permission to ignore a defect.
- Stop polishing when the acceptance conditions are supported by evidence. Do not add another review round merely because further improvement is imaginable.

## Test once at the right scope

- Use focused tests during implementation for real risks: permissions, financial conservation, retry/idempotency, state transitions and required behavior.
- Run the full integrated checks at a coherent milestone. Repeat only when relevant source changes or unresolved failures justify it. Preserve test assertions; diagnose infrastructure/timeouts rather than rerunning blindly or hiding failures.
- Compare representative changed workflows with the prototype on phone/desktop and in light/dark; expand only for an observed layout risk. Record concrete mismatches and fix material ones. Do not equate more screenshots with more completion, or recollect valid unchanged evidence.
- A passing build is not a live rehearsal; a live happy path is not a permission audit. Collect the missing evidence without repeatedly re-proving what is already established.

## Conserve context and report outcomes

- CURRENT_STATE.md is a concise current handoff, not an append-only diary. Replace superseded current statements; retain detailed historical evidence in the relevant logs.
- DEVELOPMENT_CHECKLIST.md is the human progress guide; VISUAL_CHECKS.md is the only visual queue. Update them at completed workflows, changed decisions and meaningful blockers, not after every tool call.
- Read the handoff and only task-relevant files. Delegate with concise contracts, file ownership and acceptance conditions rather than repeatedly copying the entire conversation.
- Report completed workflows, remaining blockers and the next deliverable. Test counts are supporting evidence, not product progress. Do not present a rough percentage as a measured completion statistic.
- Commit and push coherent reviewed development checkpoints. Do not create tiny documentation-only commits merely to narrate every intermediate step. Never include student records, secrets or account-specific evidence.
- If effort is not producing an integrated workflow, say so plainly, identify why, and change the approach. Push back on both unnecessary perfection and shortcuts that would compromise correctness, privacy or the agreed scope.

## Immediate delivery sequence

1. Finish the connected Finance table, account actions and trustworthy history; validate and rehearse it. Required export/import/correction work remains on G6, not silently removed.
2. Finish remaining attendance and account/season workflows with stable shared contracts; coordinate Timeclock at the boundaries.
3. Complete the outstanding role rehearsals and required visual comparisons, resolve blocking findings, then present one review candidate with explicit limitations.

These rules change the working process, not the seven-part scope or the user's approval gates.
