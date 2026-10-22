---
name: student-status-prototype-verification
description: Compare Student Status screens with the preserved design prototype and record scoped outstanding visual checks in the existing backlog. Use for frontend conformance work and visual evidence review.
---

# Student Status prototype verification

Read HANDOFF.md first, then applicable AGENTS.md and task-relevant visual evidence in CHANGELOG.md or docs/releases/. Read docs/BACKLOG.md only for visual work related to an item there. Locate the immutable design reference through those documents. Apply latest explicit user decisions before Flow index v2 changes, prototype screens, shared copy/options and tokens. Added features inherit the prototype's patterns; do not invent missing data or actions to imitate reference fixtures.

## Select and compare

- Choose a matrix row and identify role, route, record state, viewport and theme. Verify the live app comes from the intended checkout, not the legacy fixture-only review UI. Verify the prototype role/screen before comparison. If a reference or role is unavailable, record the gap rather than assuming the screen.
- Use available supported browser tooling, reading its documentation first. Compare phone 390px and desktop 1440px in light and dark. Record actual viewport/document/image dimensions; scrollbar and tool scaling mean a nominal width does not prove pixel-exact comparison.
- Check hierarchy, labels/options, typography, spacing, shared colors/components, wrapping, navigation, focus, sticky offsets and lower-page controls. Inspect all relevant sections of long forms; a readable top screenshot does not cover the bottom or validation state.
- Confirm each capture actually shows the target route, role, loaded state and theme. Reject stale, wrong-theme, distorted or wrong-screen images, regardless of filename. Previously unreliable full-page/debugger capture paths need verification before reuse. Use supported visible-browser captures when available; re-inspect the output. Stop claiming progress if valid evidence cannot be obtained and record the limitation.
- Distinguish screenshot comparison, DOM dimensions, source inspection and exercised behavior. None substitutes for another. Do not claim a successful save, permission denial or validation state unless exercised or explicitly attributed to a separate test.

## Boundaries and records

Use authorized synthetic states only. Do not grant roles, alter domain records, submit financial/consent forms or enable signatures just to manufacture a screenshot without task authorization. Missing roles/states are evidence gaps, not automatic backend defects. Restore temporary viewport/theme settings when practical and record any persistent test changes.

For frontend-only work, flag unsupported contracts separately; do not edit backend, generated files, dependencies or deployment configuration outside authorized scope. Preserve actual values and existing financial/withdrawal/consent semantics. Use shared labels/tokens/Base UI, and route backend review to existing Convex skills when separately authorized.

Maintain task-relevant outstanding visual comparisons in docs/BACKLOG.md; do not recreate a separate visual matrix or notes file. Each unresolved item identifies role/surface/state, existing evidence, precise remaining comparisons and dependencies. Record one concise dated outcome in CHANGELOG.md and task-relevant unresolved detail in docs/BACKLOG.md; do not create competing current matrices. Mark a row complete only when its stated scope is verified, retaining the evidence link. Separate unavailable backend states and pending Coach acceptance from completed presentation.

Keep screenshots, account identities and record-specific evidence outside Git. Commit only sanitized findings, source and documentation under docs/REPOSITORY.md. A visual review never grants production or main-merge permission.
