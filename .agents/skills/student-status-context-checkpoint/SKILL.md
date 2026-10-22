---
name: student-status-context-checkpoint
description: Rewrite the current Student Status handoff when the user says "handoff", "new window", "time for a new context window", or is ending a session.
---

# Student Status context checkpoint

Use this existing skill and repository. A handoff does not authorize implementation, publication, deployment or operational writes.

1. Read HANDOFF.md first, then AGENTS.md. Verify the actual repository, branch, dirty state and task-relevant Git evidence with read-only commands. Preserve unrelated work; open only files relevant to the active task.
2. Keep the documentation roles separate: HANDOFF.md is the short current status; docs/DECISIONS.md holds domain policies; docs/BACKLOG.md holds unresolved work; CHANGELOG.md holds dated completed history; docs/releases/ holds release receipts. Read DECISIONS before changing parent linking, consent, finance, rooms or retention. Read BACKLOG only when requested or when the active task relates to an item there.
3. Reconcile the latest owner decisions, completed outcomes, active work, known risks and authorization boundaries. Attribute owner confirmations and historical checks accurately; use VERIFY only when actual production status needs confirmation. Do not resurrect closed Zeffy/inbox/device evidence gaps from old notes, and preserve the owner's real-signing deferral until explicitly changed.
4. Rewrite HANDOFF.md, do not append a diary. Keep the entire file under 40 lines in plain language, with only date and branch as header details: 2–3 lines for Student Status, 2–3 for Timeclock, in-progress work, one line per top risk with a pointer to BACKLOG, and one next development step. Remove stale session details; do not copy policies, detailed backlog or deletion candidates into it.
5. Update AGENTS.md only if structure, commands or conventions changed; keep it under about 100 lines. When the current task warrants it, update the relevant existing DECISIONS/BACKLOG entry instead of duplicating details in HANDOFF. Do not browse or rewrite unrelated backlog items merely to make a checkpoint.
6. Add one dated, concise line to CHANGELOG.md for completed work or the checkpoint. Distinguish local changes, verified publication, earlier release evidence and production checks; never label unfinished work released.
7. Create no other files. Do not create a new handoff, notes file, script, skill, cleanup plan or release receipt during this checkpoint. Use the existing canonical documents; if one is missing, report it before creating anything. The temporary Phase 2 cleanup plan was removed after cleanup and must not be recreated.
8. Review the diff for scope, valid references, current facts and private data. Documentation-only work needs diff/link review, not application test runs. Do not commit, push, message another chat, merge, synchronize, enable signing or deploy unless separately authorized.
9. Reply with exactly two sentences the user can paste into a new window: identify the repository/branch, completed outcome and local/published state; then give the next step and the material unresolved risk or approval boundary. Do not create a separate summary file.

Keep real student records, account-specific evidence, secrets and conversation transcripts out of these documents.
