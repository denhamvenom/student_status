# Family operations presentation pass — October 12, 2026

This pass covers the financial-operations panel, the Coach permission-form draft, and parent-invitation surfaces. It changes presentation only. Queries, mutations, identity checks, idempotency keys, invitation token handling, and consent restrictions remain as they were.

The reference is the sibling `student-status-operations/design-reference` README, `tokens/tokens.css`, and `source/ui-copy.json`, together with the approved `design-drift-report.md`. The reference uses 8px bordered cards with a light shadow, 4px controls, Anton section headings, gold primary actions, purple secondary actions, and 44px mobile targets. The permission draft and actual money-return/fundraising-transfer panel are newer workflows without an exact prototype screen, so they inherit those patterns rather than copying prototype fixture data or implying those older flows are complete.

| Surface | Change | Comparison limit |
| --- | --- | --- |
| Financial operations | Reduced the separate panel from 16px to 8px radius, applied the shared card border/shadow and Anton H2, separated balances with a rule, and stacked operation choices and submit controls on phones. The text still distinguishes recorded external money returns from fundraising-credit transfers. | No live financial transaction or browser comparison was run in this pass. The older prototype has no exact payout/transfer counterpart. |
| Permission draft | Added consistent vertical space between seven review cards and clearer spacing inside cards, including medication-category rows. | This remains draft wording, with no signing choices or submission. No real consent was tested. |
| Parent invitations | Kept the seven-day, one-use invitation and matching-account flow. Scoped card styling improves row wrapping, long-address handling, share-link grouping, and narrow-screen actions without changing access controls. | The prototype specifies a 14-day link and QR presentation; the later approved seven-day decision governs this app. QR and other missing functional states were not added. Live expired/used/mismatched-account variants were not exercised here. |

The earlier audit includes malformed desktop Parents captures; those images do not establish desktop visual parity. This pass is source-backed presentation work, not a four-matrix visual acceptance or a production readiness claim. No backend, deployment, role grant, real record, or Git publishing step is part of this pass.

The follow-up copy pass places approved text for the permission draft and the live parent invitation/access flow in `src/lib/family-copy.ts`. It preserves invitation values, mutation arguments, and rendered wording. The synthetic review fixtures and Dashboard/Finance page strings still contain local literals; their extraction remains pending. Focused ESLint and TypeScript checks passed after the extraction.
