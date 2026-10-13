# Accounts and permission implementation contract

Current status, October 13, 2026: accounts/profile workflows and the full synthetic consent backend/UI are implemented and source-reviewed. Root synchronized this permission checkpoint to development at 08:45:38. Backend 169 tests across 28 files and UI five tests in one file passed separately; lint/types/build pass with a roughly 917 KB bundle warning. Commit/push is pending at this update; no new hash is asserted. Live permission journeys and four-combination visual verification remain pending, so G5 and all other numbered goal items remain open.

Implemented consent includes immutable version authoring and typed snapshots, electronic/paper workflows, current coverage, correction/re-sign, receipts, compact acceptance markers and exports collected in pages of ten with collection-range timestamps. Snapshots have a 128 KiB UTF-8 cap. Export grants are checked per page; denial/cancellation yields no partial download. The development-only fictional fixture and explicit verified Parent link have been created live without changing roles. Real signing remains server-blocked; wording approval and production release remain separate gates.

The following baseline and design sections preserve the rationale and frozen contracts. Historical deficiencies are not claims about current source. Exact account reassignment/archival and remaining G5 scope still follow GOAL_ACCEPTANCE; this checkpoint does not close the whole goal.

## Historical baseline before implementation

- `convex/permissions.ts:submit` rejects every submission after parent and student-scope checks. A season permission-version label cannot enable signing.
- `src/PermissionDraft.tsx` is a static draft. Existing `permissionSubmissions` store signer, version label, event IDs and arbitrary answers JSON; these fields do not prove an immutable exact wording/contact/health/event snapshot.
- `permissions.review` appends accepted/correction reviews. It lacks an expected latest review guard and can review legacy records without complete snapshot evidence.
- `lib/readModels.ts:permissionAccepted` examines recent submissions and returns true for any covered submission whose latest review is accepted. A newer correction submission can fall through to an older accepted submission. Completion must instead use explicit current coverage and supersession rules; older signatures remain history and must not silently override a requested correction or new-signature requirement.
- Parent invitations already verify the signed-in Google account email, use one-use hashed tokens, expire after seven days, and save a versioned parent relationship attestation. Linking expressly does not sign travel or medication consent. Revoked family links remove access on the next server check.
- `app.updateProfile` separates student preferred-name/shirt edits from linked-parent/Coach health and emergency edits. It does not enforce first-time setup, an optimistic profile revision, or initial room-category locking. The schema already has `roomCategoryLocked`; no replacement lock field is needed.
- `admin.approveJoin` can link an explicitly selected unlinked same-email active-season record. Existing account/archived matching, account reassignment and reactivation require further explicit workflows. Historical records must not be overwritten as though they were a new profile.
- There is no `convex/userAdmin.ts` or complete general adult invitation/role management module.
- `appUsers.financialEdit` is distinct from Travel Lead. There is no separate health-export grant yet.

Inspected references: immutable sibling `student-status-operations/design-reference` onboarding, Profile & health, Users & Roles and Permission review copy; existing access, parent invitation, profile, permission and readiness code; `docs/GOAL_ACCEPTANCE.md`, `docs/FINANCE_AND_CONSENT_DECISIONS.md` and `docs/DEVELOPMENT_CHECKLIST.md`. Later user decisions govern when prototype wording differs.

## Settled policy and remaining gates

- Organization names: **Denham Springs High School** and **FIRST Team 8044, Denham Venom**.
- Final wording must explicitly permit minor first aid as appropriate. Exact legal and administration wording remains subject to Coach approval.
- Medication categories are Pain Medication, Allergy Medication and Cold Medication. Every category requires an explicit Allow, Contact me first or Do not allow choice. Nothing is preselected.
- Products, ingredients, exceptions and medication administration procedures still require Coach approval before any real signature is accepted.
- Build and test the full synthetic signing, paper, correction, receipt and export workflows now. Retain a server gate against real signing. A client `synthetic` flag, version label, or Coach-looking draft name cannot bypass that gate.
- Initial room category is locked after first setup; subsequent category correction belongs to the Coach and must flag existing room placement for review.
- Parent linking and consent are separate workflows. Every signing action rechecks the current active family link and verified Google account.
- Financial editing and health export are separate grants. Changing or revoking a grant must take effect on the next server request.
- Archived records are retained for five years from Coach archival. Reactivation clock treatment, deletion coverage, backups and holds remain unresolved; this account work must not trigger deletion or invent a new retention clock.
- Whole Team later additions apply only to upcoming, nonarchived events. Existing withdrawals and financial history retain their disposition.

## Proposed additive schema

All additions to existing populated tables are optional. Missing fields have explicit legacy behavior; they must not falsely mark old profiles complete or old submissions as full snapshot evidence.

| Table | Proposed additions | Notes |
| --- | --- | --- |
| `appUsers` | `healthExport?: boolean`, `phone?: string`, `shirtSize?: string`, emergency contact fields, `archivedAt?: number`, `accessRevision?: number` | Existing `active`, role, Travel Lead and financial-edit fields remain authoritative. Coach capability is implicit; Travel Lead health export requires the new grant. |
| `students` | `profileCompletedAt?: number`, `profileRevision?: number`, `guardianName?/guardianRelationship?/guardianPhone?/guardianEmail?: string`, `archivedAt?: number` | Guardian contact is distinct from emergency contact and verified parent account linking. Existing room category lock remains authoritative. |
| `seasons` | `activePermissionVersionId?: Id<permissionVersions>` | Existing `permissionVersion` label remains for legacy display. |
| `permissionSubmissions` | `versionId?`, `draftId?`, `source?: electronic|paper`, server-set `synthetic?: boolean`, `recordedBy?`, `signerName?`, `signerEmail?`, `snapshotJson?`, `supersedesSubmissionId?`, `idempotencyKey?`, `paperReference?`, `paperSignedAt?`, `paperAttestation?` | Preserve old required fields. Paper recorder and actual named signer are separate. New snapshot format must have a version and server-side typed validation. Index `draftId` and `idempotencyKey`. |
| `permissionReviews` | `field?: general|emergencyName|emergencyPhone|allergies|medications|medicationChoices`, `supersededBy?` only if required by final current-coverage design | Reviews remain append-only. Exact current-coverage model is root/reviewer-owned, not inferred from review insertion order alone. |

New tables proposed:

1. **`adultInvitations`**: normalized `email`; desired `role: coach|mentor`; `travelLead`, `financialEdit`, `healthExport`; `tokenHash`; `status: pending|accepted|revoked|replaced`; creator/time/expiry; optional accepted actor/time. Index token hash, normalized email/status. Seven days is a proposed engineering default matching existing invitation infrastructure, not a newly settled adult policy. Links are copied/shared; no email is sent by this app.
2. **`profileCorrectionRequests`**: student, requesting actor/time, field `roomCategory|legalName|account`, note, state `pending|approved|denied`, optional decision actor/time/reason. Index student and status. A correction decision applies authorized changes and records a reason atomically.
3. **`permissionVersions`**: season, version, title, exact wording, organization names, bounded medication definitions `{key: pain|allergy|cold,label,productsText,exceptionsText}`, administration text, creator/time, approval metadata. Index season/version. Body content is immutable; a wording edit creates a new version. Approval metadata can be separate append-only approval records if root prefers fully immutable version documents. Content approval alone does not open the real-signing gate.
4. **`syntheticConsentSubjects`**: student, eligible parent account, enabled, internal creator/time. Index student/parent. Only an internal, approved-development-URL-bound initializer may register validated fictional fixture records and authorized test accounts. No public mutation accepts this eligibility. Paper fixtures need an equivalent server-owned fictional-student eligibility check; paper acceptance does not require pretending the recorder is the parent.
5. **`permissionDrafts`**: student, preparing parent, version, exact server-built snapshot, created/expiry times, optional used submission. Index student/parent. Prepare binds the draft to the authenticated account and fictional subject. Submission rechecks current profile/event/version/family-link evidence before consuming it once.

Snapshot JSON is only a storage encoding. The implementation must validate a concrete bounded typed schema, not accept arbitrary client answers JSON. Store exact version body and medication definitions, student identification, named signer/account, selected original event IDs plus names/type/dates/destination/travel details, emergency contact, allergy/medication reports, each explicit medication choice, acknowledgment text and typed signer name, source/provenance and timestamps. Products and exceptions in a synthetic draft are visibly unapproved. Snapshot/event scope remains unchanged when the live profile or events later change.

## Proposed public contracts

| Module | Contract | Server rules |
| --- | --- | --- |
| `profileSetup` | `get`; `complete({expectedRevision,shirtSize,roomCategory,preferredName?,guardianContact?})` | Own active-season student only. Shirt and room category required; preferred name optional with sensible display fallback. Lock category and stamp completion once. Parent invitation remains a separate optional step. Return setup-needed state from viewer; ordinary edits cannot bypass lock. |
| `accounts` | Paginated `workspace`; `inviteAdult`, `revokeInvitation`, verified-account `preview/accept`; `updateAdult({targetUserId,expectedAccessRevision,role,travelLead,financialEdit,healthExport,reason})` | Coach-only management. No silent student/parent conversion. Protect the last active Coach. Finance grant requires Mentor plus Travel Lead; health grant is independent and role-scoped. One-use matching-email Google acceptance. Authenticate actor server-side and guard stale/replayed state. |
| `accounts` | Explicit `archiveStudent`, `reactivateStudent`, archived-match preview/link, account-change invitation | Coach-only with reasons. Preserve history; verify matching new account before linking; reject cross-role conflicts or already-linked identities. Same-account reactivation is distinct from creating a new record. Reactivation calls the Whole Team upcoming-membership helper without reversing withdrawals. |
| `permissions` | `workspace({studentId})`; `prepare({studentId,eventIds})`; `submit({draftId,typedName,acknowledgment:true,medicationChoices})` | Linked parent only for electronic signing; fresh verified Google email and active link. Current season, bounded selected event scope, confirmed participation, complete event enrollment and approved eligibility checks. Synthetic server allowlist required while real gate is closed. Every category explicit. Recompute and compare snapshot-sensitive state to reject stale drafts. |
| `permissions` | `recordPaper({studentId,versionId,eventIds,signerName,paperSignedAt,paperReference,attestation:true,medicationChoices,idempotencyKey})` | Coach/Travel Lead records a fictional paper fixture under the same real-signing gate. Separate recorder and parent named on paper. Capture exact version/event/contact/health/choice snapshot and external paper reference. Real paper consent cannot bypass the gate. |
| `permissions` | `review({submissionId,expectedLatestReviewId,status:accepted|correction,note,field?})`; `requestNewSignature` | Coach/Travel Lead; correction requires a note. Never mutate signed answers. Stale decisions reject. Re-sign creates a new immutable submission and explicit supersession link. Latest controlling coverage must prevent older accepted fallback. |
| `permissions` | Own `receipt`; scoped `export({eventId,includeHealth})` | Linked parents may retrieve their child's complete own receipt. Operator bulk export is Coach or authorized Travel Lead; including health requires Coach or Travel Lead plus separate health-export grant. Ordinary Mentor denied. Default manifest omits health and full snapshots. Audit bulk exports without duplicating sensitive snapshot contents in general audit rows. |

Draft issuance and submission use server-authoritative version and event snapshots. New events added after signing are shown separately and do not become covered implicitly. Requests for a new signature need explicit current-coverage state; accepting an older archived submission must not erase that requirement. A current-scope projection may be added after root freezes this contract; it must update transactionally alongside reviews and signatures.

A successful receipt displays exact signed evidence and distinguishes electronic/paper, synthetic test evidence, submitted/accepted/needs correction, and original event scope. Corrections show the requested field/note and keep prior receipt history readable. Health/profile changes after signing do not rewrite any receipt.

## Ownership proposal

Implementation agent: new `convex/accounts.ts`, `convex/profileSetup.ts`, `convex/permissionVersions.ts`, `convex/lib/consentSnapshot.ts`, updates to `convex/permissions.ts`, and focused account/profile/consent tests. Existing parent invitation infrastructure should be reused through a shared verified-account helper with one owner rather than duplicated.

Root: schema/generated API; shared access and verified-Google helper extraction; viewer setup/grants; ordinary profile revision increments; readiness/current permission coverage integration; Coach correction/archival reconciliation; all centralized UI routing and screens; deployment/Git. Root should freeze precise module ownership before edits to `admin.ts` or `parentInvites.ts`.

## Required evidence

- First setup, incomplete-field denial, repeat/stale save, room lock, Coach reasoned correction and room-review flag.
- Own-student and linked-parent access; unlinked/revoked/cross-season refusal; explicit historical matching and no cross-role account takeover.
- Adult invite wrong account, expired/replayed/revoked link, matching verified Google acceptance, last-Coach protection and immediate role/grant revocation.
- Full synthetic electronic receipt with three initially unselected choices; unsigned or unregistered real subjects refused even when a client requests synthetic mode.
- Immutable version/body/event/contact/health/medication evidence after live records change; stale draft/profile/event/version and wrong-account submissions refused.
- Correction and re-sign with original receipt retained, latest current coverage enforced, and no older accepted fallback.
- Paper provenance, duplicate operation conflict/replay, restricted default and health exports, minimized response fields and health-grant revocation.
- Complete parent child-switching, Coach review, paper, invite, setup and export interfaces at the required phone/desktop and light/dark combinations. Synthetic backend tests are distinct from live account journeys and user visual approval.

The later real-signing gate remains deliberate. None of these proposed schemas, synthetic journeys, or content approval metadata independently authorizes real permission signing or production release.

## Frozen implementation recommendation: current permission coverage

Astra design review, October 13, 2026. This section makes the proposed synthetic workflow concrete for root to freeze. It does not authorize real signing. Implement the full workflow below; the real-signing gate remains a separate server restriction.

### Authoritative coverage table

Add `permissionCoverage` with required `seasonId`, `studentId`, `eventId`, `state` (`required|pending|accepted|correction`), integer `revision`, `updatedAt`, `updatedBy`; optional `latestSubmissionId`, `versionId`, `latestReviewId`, `signatureRequestedAt`, `reason`, `correctionField`. Index `by_studentId_and_eventId`, `by_seasonId_and_eventId`, and `by_latestSubmissionId`. The student/event index must resolve uniquely through transactional lookup. Missing row means required, never implicitly accepted.

The row is a mutable projection of append-only submission/review/request evidence. A submission's immutable snapshot and original covered events never change. `latestSubmissionId` identifies the controlling submission for this event, not the most recent historical record globally. A new submission becomes controlling only for its explicitly signed event IDs. It does not change the student's other events. Later-created events have no coverage and remain required.

Use an append-only `permissionSignatureRequests` table for Coach/Travel Lead requests: student, season, bounded event IDs, actor/time, reason, and prior coverage revisions/submission IDs. A request sets affected coverage to required and increments revision, retaining the prior submission pointer for history. Set `signatureRequestedAt`; review must refuse to make that old submission accepted again. A fresh submission after the request clears this blocker on its selected events and moves them to pending.

`permissionAccepted` reads this one coverage row and returns true only for state accepted with a valid controlling, sealed submission covering that exact student/season/event and matching the controlling review. It must not scan history for an older accepted fallback. Legacy submissions without the new typed snapshot/coverage remain readable history but cannot establish current acceptance. No backfill infers acceptance from arbitrary legacy answers JSON.

### Submission and review transitions

| Action | Required checks | Atomic effects |
| --- | --- | --- |
| Prepare electronic draft | Fresh verified Google identity; active linked parent; active-season fictional subject registered internally; bounded unique confirmed events; enrollment complete; required profile/contact/health answers available; current season version selected server-side. | Save immutable prepared wording/version, profile/contact/health and original-event snapshot, parent identity, profile revision, event fingerprint and expected coverage revisions. Return draft ID and reviewable exact content. No readiness change. |
| Submit electronic draft | Same authenticated parent; active link and synthetic allowlist still valid; unused/unexpired draft; exact typed account name and explicit acknowledgment; each Pain/Allergy/Cold choice explicit; current profile/event/version/coverage fingerprints still match. | Insert sealed immutable submission with server-built final typed snapshot and synthetic provenance. Set draft usedSubmissionId. Upsert selected coverage rows to pending, latestSubmissionId=new ID, versionId, revision+1; clear prior correction/request blocker. Preserve old receipts. |
| Record synthetic paper | Coach or Travel Lead; internally registered fictional student; same version/event/profile validity and real-signing block; actual paper signer distinct from recorder; paper reference/date/attestation and explicit medication choices; stable retry key. | Insert sealed immutable paper submission and pending coverage using the same common transition helper. Record recorder, named signer, source and paper provenance. Never fabricate a parent account login or bypass the synthetic gate. |
| Accept or request correction | Coach/Travel Lead; complete sealed submission; exact expected latest review ID and exact current controlled event IDs with coverage revisions; correction note required. Reject a stale request or a submission controlling no eligible event. | Append review; update only the current controlled event rows to accepted/correction, latestReviewId, revision+1, correction field/note. Do not mutate submission JSON. If any supplied expected coverage changed, reject the entire transaction. |
| Request a new signature | Coach/Travel Lead; active student/event scope, current coverage revisions, reason. | Append signature-request evidence and set affected rows required with incremented revision and request time. Keep prior receipt history. Old-submission review cannot satisfy this request. |
| Re-sign | Same prepare/submit workflow against current required/correction/pending coverage. | New immutable submission with `supersedesSubmissionId` only when one prior submission applies; for mixed prior scope use bounded priorCoverage evidence in snapshot instead of inventing a single parent. Only selected event rows move to new pending submission. |

A draft retry with an already-used draft ID may return its original submission receipt only to the same still-authorized signer; it must never create a second submission. A paper retry compares a stable operation fingerprint and returns the original result; mismatched reuse rejects. A review retry should use a stable idempotency key/fingerprint or explicitly reject stale review state, never append duplicate controlling reviews.

Reviews may cover fewer events than the original receipt when later submissions superseded part of its scope. The review workspace must show the exact still-controlled event list. Supply and compare that full list with revisions, rather than silently reviewing a hidden subset. A request-new-signature row excludes the old submission from actionable acceptance until a new signed snapshot replaces it.

### Version and real-signing boundaries

Version body content, organization names, medication definitions and administration text are immutable. Editing wording creates a new version and changes the season's version pointer for future drafts. Prepared drafts reject if that pointer changes. Existing accepted original snapshots remain history and coverage until an explicit correction or request-new-signature transition; changing a draft version must not silently rewrite or retroactively expand signed scope. The Coach can use the explicit re-sign request workflow when new wording must be signed.

Keep an unconditional real-signing denial in the common electronic/paper transition while this development milestone runs. The only accepted path additionally requires the approved development URL and an internally registered fictional student; electronic signing also requires the registered authorized test parent. Do not accept a public synthetic boolean or infer fictional status from a display name. Content approval metadata alone cannot enable real consent. Public pages and receipts clearly label synthetic test evidence and unapproved wording.

### Minimized UI and export contracts

The parent workspace returns their selected child's current coverage, original receipts and actionable correction fields. Child switches reset unsaved form state and draft identity. A receipt includes exact signed content, original events, signer/source/version/date and synthetic marker. Coach/Travel Lead review exposes current controlled scope alongside original scope, so accepted historical receipts cannot be confused with present readiness.

Bulk export is Coach-only unless Travel Lead has the separate health-export grant for packets containing health/permission snapshots. Recheck the grant on every export request. A non-health manifest must construct an allowlisted projection without health fields or full snapshot JSON. Ordinary Mentor receives no permission packet or health data. Audit export actor, event/scope/count and time; do not duplicate packet contents into audit records. Paper and electronic exports preserve provenance and synthetic labels.

### Required integration tests

Test old accepted A then correction/new submission B cannot fall back to A; partial event supersession preserves other event coverage; explicit re-sign requirement rejects later review of the old receipt; new events remain uncovered; stale profile/event/version/coverage draft rejects; wrong/revoked parent and real/unregistered subjects reject; paper cannot bypass the real gate; duplicate retries do not create extra submissions/reviews; full typed snapshots stay byte-stable after live edits; cross-role health-export denial and immediate grant revocation. Readiness must use authoritative coverage throughout.

## Frozen schema contract (now implemented for synthetic consent)

October 13, 2026, after development checkpoint `4a9ff62` was published and synchronized by root. That earlier accounts/profile and attendance checkpoint did not implement these permission tables; the subsequent permission checkpoint now does. Root owns schema/generated integration. No goal item is closed. Root subsequently confirmed the live browser tab is working again; browser rehearsal can proceed through the supported connection.

Use existing Convex `v` validators; all new fields on populated tables are optional. Required invariants for new-format records are enforced by common server helpers. `number` revisions must also pass nonnegative safe-integer validation. New table content and per-operation event arrays must have explicit handler bounds.

### Existing table changes

- `seasons.activePermissionVersionId`: optional `id(permissionVersions)`.
- Widen `permissionSubmissions.signedBy` to optional `id(appUsers)`, preserving old records. New electronic submissions require the verified parent ID. New paper submissions omit it and require a separate recorder and actual named paper signer. Never put the Coach recorder in `signedBy` to satisfy a legacy validator. Receipt readers must branch by source and tolerate an absent account signer.
- Optional `permissionSubmissions` fields: `versionId: id(permissionVersions)`, `draftId: id(permissionDrafts)`, `source: electronic|paper`, `synthetic: boolean`, `snapshotFormat: literal(1)`, `snapshotJson: string`, `snapshotHash: string`, `recordedBy: id(appUsers)`, `signerName: string`, `signerEmail: string`, `supersedesSubmissionId: id(permissionSubmissions)`, `idempotencyKey: string`, `operationHash: string`, `paperReference: string`, `paperSignedAt: number`, `paperAttestation: boolean`. Retain required `typedName`, `wordingVersion`, `eventIds`, `answersJson` and `signedAt` for compatibility, deriving their new values server-side. Add indexes `by_draftId [draftId]` and `by_recordedBy_and_idempotencyKey [recordedBy,idempotencyKey]`; preserve existing indexes. Paper retry identity is recorder-scoped.
- Optional `permissionReviews` fields: `field: general|emergencyName|emergencyPhone|allergies|medications|medicationChoices`, `controlledCoverage: array({eventId:id(events),priorRevision:number})`, `idempotencyKey:string`, `operationHash:string`. Add `by_reviewedBy_and_idempotencyKey [reviewedBy,idempotencyKey]`. Reviews stay append-only; no mutable supersededBy field is needed because current coverage governs readiness.

### New tables

| Table | Required fields | Optional fields | Indexes |
| --- | --- | --- | --- |
| `permissionVersions` | `seasonId:id(seasons)`, `version:string`, `title:string`, `wording:string`, `schoolName:string`, `teamName:string`, `medications:array({key:pain\|allergy\|cold,label:string,productsText:string,exceptionsText:string})`, `administrationText:string`, `acknowledgmentText:string`, `createdBy:id(appUsers)`, `createdAt:number` | `approvedBy:id(appUsers)`, `approvedAt:number` | `by_seasonId_and_version [seasonId,version]` |
| `syntheticConsentSubjects` | `studentId:id(students)`, `enabled:boolean`, `createdBy:id(appUsers)`, `createdAt:number` | `parentId:id(appUsers)`; absent means a paper-only registration | `by_studentId_and_parentId [studentId,parentId]` |
| `permissionDrafts` | `studentId:id(students)`, `seasonId:id(seasons)`, `parentId:id(appUsers)`, `versionId:id(permissionVersions)`, `snapshotJson:string`, `snapshotHash:string`, `profileRevision:number`, `eventFingerprint:string`, `expectedCoverage:array({eventId:id(events),revision:number})`, `createdAt:number`, `expiresAt:number` | `usedSubmissionId:id(permissionSubmissions)` | `by_studentId_and_parentId [studentId,parentId]` |
| `permissionCoverage` | `seasonId:id(seasons)`, `studentId:id(students)`, `eventId:id(events)`, `state:required\|pending\|accepted\|correction`, `revision:number`, `updatedAt:number`, `updatedBy:id(appUsers)` | `latestSubmissionId:id(permissionSubmissions)`, `versionId:id(permissionVersions)`, `latestReviewId:id(permissionReviews)`, `signatureRequestedAt:number`, `reason:string`, `correctionField` using the review field union | `by_studentId_and_eventId [studentId,eventId]`, `by_seasonId_and_eventId [seasonId,eventId]`, `by_latestSubmissionId [latestSubmissionId]` |
| `permissionSignatureRequests` | `studentId:id(students)`, `seasonId:id(seasons)`, `eventIds:array(id(events))`, `requestedBy:id(appUsers)`, `requestedAt:number`, `reason:string`, `priorCoverage:array({eventId:id(events),revision:number,submissionId:optional(id(permissionSubmissions))})` | None | `by_studentId [studentId]` |

Exactly three unique medication keys are required; text lengths are bounded in handlers. Version content is immutable. Approval metadata never enables real signing. Only a development-deployment-bound internal fixture initializer may register fictional consent subjects; no public synthetic switch exists.

Missing coverage uses expected revision zero, while the first materialized row begins at revision one. Coverage uniqueness uses indexed transactional lookup. Signing, review and signature requests compare the complete expected scope/revisions before any state transition. Legacy arbitrary answers JSON cannot establish accepted coverage. Existing accepted snapshots remain original evidence when a version changes; an explicit request-new-signature transition governs any re-sign requirement.

`consentSnapshot.ts` must define and validate the complete bounded typed snapshot described above before JSON serialization. The JSON field validator alone is insufficient. Electronic account signer, paper named signer, recorder, source, synthetic provenance, original event scope and exact wording must remain distinguishable in receipts and exports.

### Coordinated implementation ownership

Root integrated the additive schema; Astra verified its fields/indexes against this contract. The reviewed permission slice was subsequently synchronized to development at 08:45:38. Root integrates generated references and freezes common snapshot/coverage helper contracts. The consent backend owner implements version/workspace/prepare/submit/paper/review/re-sign/receipt/export operations and focused authorization, immutable-evidence, retry and supersession tests. The UI owner implements parent preparation/signing/receipt and operator paper/review/re-sign/export surfaces against those frozen return validators. Root owns shared readiness replacement, routing, generated code, development synchronization, Git and final multi-role integration.

Backend and UI may progress in parallel after return contracts freeze; neither owner independently changes schema or shared readiness semantics. Review must verify the old accepted fallback is gone everywhere and paper cannot bypass the same real-signing gate. Synthetic complete-flow evidence is required before this slice can be called implemented; production and real signing remain gated on explicit later approval.
