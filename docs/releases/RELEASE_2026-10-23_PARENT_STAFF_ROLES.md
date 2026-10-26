# Parent staff access release — October 23, 2026

Release: v0.1.0-onboarding.17. Owner explicitly authorized merging PR37 and deploying to production. Reviewed implementation: dbe01b32136132626dbf72093a23bcd8115c9c2c. PR37 merged at 9136197ab273305335940962fee0a105a168b8e1 on October 23, 2026, at 10:06:52 AM Central.

Coaches can grant Mentor or Travel Lead access to an existing Parent from Adults → Parent staff access. Parents keep their family links, choose a role at new sign-in, and switch from the header or staff setup. Current server grants are checked per authenticated session; Parent mode stays family-scoped. Extra finance editing and health exports remain disabled. No real account grants or student records were changed during release verification.

## Validation and rollout

- Reused the reviewed 654/654 test result (two workers), lint and both app builds/checks; source still matched the reviewed head before release.
- Rebuilt Student Status against https://amicable-eel-413.convex.cloud and passed frontend packaging dry-run.
- Production Convex deploy completed schema validation and added operatingRoles.by_sessionId. Production metadata confirms accounts:parents, accounts:updateParentStaffAccess and accounts:selectOperatingRole.
- Deployed the backward-compatible backend before merging PR37. The public site initially served the earlier frontend, so deployed the identical approved production build directly with configured Worker variables preserved.
- Student Status Worker version b40bc644-9fa8-4433-b12a-a6c0b08f0e81; deployment dcf97f58-7369-4d15-9c2b-7ea7567abc30 at 100% traffic. The automatic main build subsequently deployed Student Status version de7b817c-5ab8-4239-a16c-5108beaa8f28, deployment 748ee5a3-9431-4c0f-8152-31f81faa994b, at 100%. Final public asset verification after that automatic rollout still matched all five files exactly.
- https://students.team8044.org returned HTTP 200. Served HTML matches the build after removing Cloudflare's injected analytics script. All five JavaScript/CSS files match the local production build byte-for-byte, including the deferred feature bundle.
- Entry: index-QXGeLdUD.js SHA-256 2db9fd355ed01024c760a85ee2b2043add867ea9217d998304979227ba6ae52a.
- Deferred app: LiveApp-Dv7WLt5_.js SHA-256 da4fafcf809679056dc30c5201556442dc585910b4ac0fd63159d0962744f56b.
- Timeclock public endpoint returned HTTP 200. Its pre-release active Worker version was c6a2580b-f9be-4ff9-a90a-5571848f2fad; no manual Timeclock deployment was needed. The automatic main build subsequently deployed Timeclock version c604ef19-c437-4068-8af6-38db180518fa, deployment 8bdb4778-165d-45b6-be33-ee41689c924f, at 100%; final endpoint check returned HTTP 200.

Synthetic browser checks covered role choice/switching, grant removal, staff setup escape, Coach checkbox dependencies, and failure/retry, with phone/desktop light/dark inspection. Real-account production acceptance remains separate; release verification did not grant access, sign forms, submit payments, or modify student records.

## Rollback limits

Previous Student Status Worker version: aa5f7776-af4e-492b-8fd6-7eb9cde37ce8 at 100%. Previous main: df9cad04. Frontend code rollback can restore that Worker version. If backend behavior must be reverted after grants or selections exist, preserve the additive parentStaffAccess field and operatingRoles table/index in the schema; blindly deploying the old schema may fail validation. Retain Coach audit evidence and family links. A code rollback does not undo grants, selections, or audit history.
