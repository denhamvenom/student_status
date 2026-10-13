# Accounts and permission implementation proposal

Read-only design checkpoint, October 13, 2026. This document proposes contracts for G5 in `GOAL_ACCEPTANCE.md`; it does not claim these workflows are implemented or approved for real signing. Root owns shared schema, generated API, access helpers, UI integration, Git and development synchronization. No G5 implementation should begin until root freezes the additive contracts below.

## Existing facts

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
