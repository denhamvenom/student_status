# Field-trip PDF consent revision

Authorized October 14, 2026. Implemented and development-verified October 14; visual approval and real-use release remain pending. This decision supersedes active Medication Choices and seasonal OTC authorization requirements. Existing evidence and historical signed records remain unchanged. It does not authorize real signing, production deployment, main merge or deletion.

## Required workflow

Complete student setup and the linked Parent's required profile information before allowing review of a populated PDF or signing. Unknown health information is incomplete; explicitly reporting none is complete. A linked Parent reviews the server-generated PDF, checks an initially unchecked acknowledgment and types their name. Preserve minor-first-aid wording. Medication reporting does not grant permission to administer or self-carry medication; final district-policy wording remains a release gate.

The supplied source is a one-page raster layout with sample event and health entries, not a fillable template. Generate a clean PDF with the same document hierarchy and actual snapshot values. Do not copy sample trips, health entries or instructions. Allow continuation pages without clipping or omitting information.

## Parent profile information

- Student grade and date of birth; guardian name, relationship, phone and email.

- Alternate emergency contact name, relationship and phone.

- Insurance provider and policy number, or an explicit none/unavailable response.

- Physician name and phone, or an explicit none/unavailable response.

- Allergies: explicit none or bounded rows containing allergen, severity, reaction and response/instructions.

- Prescriptions: explicit none or bounded rows containing medication name, dose, timing/frequency, reason and carried-by arrangement.

Keep legacy free-text health evidence; do not infer structured medical values from it. Record Parent confirmation and use profile revisions to reject stale edits and previews. Existing student setup and parent-health completion are distinct requirements. Retain existing server role/link boundaries and minimize health projections.

## Immutable PDF and signing evidence

Generate the reviewed artifact on the server from the authoritative prepared snapshot. Store its exact bytes and SHA-256 with a pinned template version. Do not trust a client-provided PDF or hash. Require a successfully prepared artifact before signing; generation failures must be retryable without a success state.

At submit recheck the active Parent link, complete profile/setup, profile/event/wording/coverage revisions, expiry, acknowledgment, typed name and synthetic gate. Bind the signed submission to the reviewed artifact. A signature-stamped rendition retains and identifies the reviewed original. Repeated submission is idempotent.

Authorize each PDF retrieval; do not expose persistent public storage URLs. Browser display uses memory-only bytes/object URLs with cleanup. Never store health/PDF content in browser persistence or Git.

Version 2 removes Medication Choices from new drafts, electronic/paper signing, authoring and corrections. Version 1 validators, hashes, receipts and coverage remain readable and unchanged. Preserve review, paper provenance, correction/re-sign and permission/health export workflows. Later profile changes never rewrite a signed PDF; explicit correction/re-sign controls new coverage.

## Finish conditions

- Required profile fields and explicit none/unavailable states save and enforce server-side completion before PDF review and signing.

- PDF includes student/guardian/emergency/insurance/physician, covered trip details, allergy and prescription rows, approved-version wording including minor first aid, and signature evidence. Unknown event metadata is identified, never fabricated.

- Active Medication Choices and OTC controls are gone; historical evidence remains available under existing access policy.

- Focused checks cover incomplete-profile refusal, wrong/revoked Parent access, stale preview, immutable PDF binding, legacy receipts and overflowing PDF content. Integrated validation and consequential review occur at the completed workflow milestone.

- Representative Parent desktop/phone review is recorded; real signing and deployment remain gated.

Unrelated paused Readiness printable-summary edits are preserved and are not folded into this consent milestone.

## Verification checkpoint - October 14

Integrated lint, TypeScript, application tests and build passed. Astra reviewed the backend evidence/access contract and final receipt scope/correction controls with no remaining blocking findings. Development sync completed at 08:32:54 on third-bandicoot-18.

An isolated fictional Parent journey verified incomplete-profile refusal, structured profile confirmation, populated PDF review, initially unchecked acknowledgment, typed synthetic signature, sealed receipt and Coach acceptance. Desktop PDF rendered; phone light receipt layout had no horizontal overflow (375px content width). Renderer checks cover continuation content and signature-page preservation. No real consent was signed.

Browser connector blob-download capture is unsupported, so manual download/device PDF behavior remains an explicit check. Final district-policy/permission wording and Coach visual approval remain required before real use. The broad completion goal stays paused; unrelated Readiness work remains uncommitted and preserved.
