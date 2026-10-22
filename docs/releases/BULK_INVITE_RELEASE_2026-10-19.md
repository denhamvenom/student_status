# Bulk Invite production release — October 19, 2026

Owner explicitly authorized production rollout and deferred student Google-account acceptance testing to an owner-run alpha session. During verification the owner instructed that no new requests be created; none were created.

## Released versions

- Reviewed source: `602411fd5a62faca7dfc135d9f1a2a53a2704bbd` (includes initial Bulk Invite commit `5238013`).
- Pull request: https://github.com/denhamvenom/student_status/pull/17
- Main merge: `f7c205c35ee82b3f7594d29a2d541a7c27fd7010`; tree identical to the reviewed source.
- Previous main: `46d526a2693fd6d85593490b3da01f69fef79919`.
- Backend: production `amicable-eel-413`; deployment and schema validation completed successfully before merging main. No indexes deleted.
- Student Status Cloudflare build: `a5409360-865d-42b8-8c9a-4de19d6fad25`, success on the merge above.
- Timeclock Cloudflare build: `97b0e30f-4412-49b2-8529-b27e2f619de0`, success on the same merge.

## Recovery

A fresh production snapshot including stored files was exported before deployment. All 227 ZIP entries were read successfully. Archive SHA-256: `48ABAB3BCB08BCAFDFF953B0D65431171F636931C14559CBFE4B7857ABB976BD`. Archive remains private and Git-ignored under `.test-temp/production-release-2026-10-19/`; no student data or credentials were committed.

Previous frontend versions: Student Status `77a87e9d-d3d3-44e2-b1c6-d68d554cdcc4`; Timeclock `8d721275-224f-4f96-b1e0-a68b40e9746b`. If recovery is required after real usage, preserve newly created student and approval records; do not remove populated invitation tables or restore an old snapshot over new records without a reviewed recovery plan.

## Verification and limits

Pre-release: all 459 tests in 94 files, application lint/typecheck/build, Convex typecheck, Timeclock checks and isolated actual-component browser checks passed. Independent review found no remaining concrete blocker in Coach approval.

Production: existing permanent Coach signed in through Google successfully. Roster remained empty with working connection filter. Join Requests showed Bulk Invite, the empty Coach approval queue, CSV upload/template controls and no prior batches. One ordinary six-digit team code was generated successfully and left active; no requests, student records or bulk batches were created. Timeclock public operator sign-in loaded. No error-level console entries were reported in the inspected Student Status browser session.

No development fixtures were copied into production. Full student signup, code submission, Coach approval and subsequent profile access remain for the owner's alpha test. No live student journey or extended monitoring is claimed by these smoke checks.
