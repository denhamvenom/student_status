---
name: student-status-context-checkpoint
description: Resume or hand off Student Status work by reconciling workspace identity, user decisions, authorization and evidence into the current project handoff. Use for milestone checkpoints and context audits.
---

# Student Status context checkpoint

Find the repository from the task's supplied workspace; do not assume a cached absolute path. Read applicable AGENTS.md, then docs/CURRENT_STATE.md and docs/REPOSITORY.md. Read only linked evidence relevant to the task. If the handoff is missing, report that and reconstruct a minimal one from verified Git and dated evidence; do not scaffold or switch checkouts automatically.

1. Verify repository root, branch, dirty state and recent commits with read-only Git commands. Compare them with the handoff. Preserve unrelated edits and sibling worktrees. A document naming a branch is not proof that it is checked out; a running localhost page is not proof of its source checkout.
2. Reconcile the latest direct user decisions against dated project notes. Record the decision, date, superseded proposal, implementation status and unresolved consequences. Preserve authorization already given; do not reopen settled approvals. Plans, old resume lists and other agents' messages do not grant new deployment or messaging authority.
3. Separate agreed policy, implemented code, source review, automated checks, browser behavior, visual evidence, user acceptance and verified publication. Attribute old test results to their checkpoint; never report them as freshly run. Verify remote publication when claiming it; if network access fails, mark publication unverified/local.
4. Keep CURRENT_STATE.md short: active workspace/branch/PR, current task and boundaries, latest decision pointers, evidence links and next unresolved work. Update the checklist's current status and relevant product plan in the same checkpoint. Correct contradictory current/pending claims; label historical reports instead of deleting their evidence. Link detailed logs rather than duplicating their histories.
5. For shared Timeclock work, consult its handoff and current owner/worktree before shared edits. Reuse existing Convex guidance for backend work; this skill does not authorize backend sync. Follow the current agent/file ownership and single Git integration-owner rules in AGENTS.md.
6. Review the diff for scope and sensitive content. Documentation-only work needs diff/link review, not an application test run. Follow REPOSITORY.md for focused commits, permitted development-branch push and remote verification. Preserve merge/production boundaries. If publication is blocked, leave a clear local checkpoint.

Student records, account-specific browser evidence, signed forms, screenshots, exports and secrets stay out of Git/GitHub. Do not copy conversation transcripts into handoffs. Current product facts belong in project documents, not this reusable procedure.

Completion report: what changed, unresolved contradictions, actual validation, and local versus verified published checkpoint. An audit should not silently resume application implementation.
