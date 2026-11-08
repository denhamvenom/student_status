# Release 2026-11-08: November 2026 audit cleanup (docs drift, dead code, strict Travel Lead rule, shared helpers)

Owner approved the release on 2026-11-08 ("Go ahead and go live"). Four PRs merged with merge commits, one at a time, each code PR deployed to production from main before the next merge. Previous main: `1e9768b`.

| PR | Branch | Commits | Merged as main | Convex deploy |
| --- | --- | --- | --- | --- |
| [#81](https://github.com/denhamvenom/student_status/pull/81) Docs: fix drift found by the November 2026 audit | `docs/audit-drift` | 5 | `ab7824b` | not needed (docs only) |
| [#82](https://github.com/denhamvenom/student_status/pull/82) Remove dead code found by the November 2026 audit | `chore/remove-dead-code` | 7 | `4c9894a` | yes |
| [#83](https://github.com/denhamvenom/student_status/pull/83) Use one strict Coach-or-Travel-Lead rule everywhere | `fix/travel-lead-check` | 4 | `08eb5e7` | yes |
| [#84](https://github.com/denhamvenom/student_status/pull/84) Share Chicago-time, money and announcement-audience helpers | `refactor/shared-helpers` | 3 | `480b44e` | yes |

## Scope
- **#81 (docs only):** stale pre-release text removed from the withdrawals handoff (cherry-picked from `docs/handoff-withdrawals-cleanup` `b89599b`); Travel Lead check lines refreshed; README handoff pointer and app name fixed; CHANGELOG entries for the November 6-7 releases; missing AGENTS.md code map areas and the Venom Status display name; CLAUDE.md code map synced with AGENTS.md; PR #80 recorded in HANDOFF. Files: AGENTS.md, CHANGELOG.md, CLAUDE.md, HANDOFF.md, README.md.
- **#82 dead code:** 23 public/internal Convex functions removed, none added (production function count 577 to 554):
  - `admin.js`: `recordAttendance`, `createMeeting`, `setMeetingCancelled`, `createDriver`, `assignDriver`
  - `attendanceReportMaintenance.js:rebuildSession`, `financeReportMaintenance.js:status` (no client caller)
  - `bootstrap.js:productionFirstCoach` (refuses any deployment that already has a Coach; production has one)
  - format-1 consent signing: `permissionVersions.js:createVersion`, `createVersionV2`; `permissions.js:listSubmissions`, `prepare`, `submit`, `submitDraft`, `preparePaper`, `recordPaper`
  - `profileSetup.js:complete` (ProfileSetup replaced by SetupWizard)
  - `bulkInvites.js:previewCode`
  - `fundraiserLinks.js:save` (replaced by `importLinks`)
  - `eventSeries.js:list`, `get`; `mentorInvites.js:myInvitedEvents`, `forEvent`
  - Deleted files: `src/ProfileSetup.tsx`, `src/PermissionDraft.tsx`, `src/lib/attendance-display.ts`, UI primitives `alert`, `progress`, `scroll-area`, `separator`, `tooltip`, three unreferenced public assets (`status-na.svg`, `logo-mark-black-text.png`, `style-guide.png`) and `convex/productionBootstrap.test.ts`. Unused locals/parameters reported by tsc cleared. Tests now cover consent signing refusals and paper retries on the current path, and assert Mentor invitations and finance progress through user-facing queries.
- **#83 strict Travel Lead rule:** new shared Coach-or-Travel-Lead staff rule (`convex/lib/staffRule.ts`, a helper, not a registered function) used in the remaining strict checks. It tightens 15 checks that trusted a stored `travelLead` flag on non-Mentor roles; no site is looser. No function added or removed.
- **#84 shared helpers:** one Chicago date/midnight/end-of-day/time-zone helper; one exact-cent formatter and parser for fundraising, reports and Zeffy; shared announcement audience rule and signup status labels. Old-vs-new helper equivalence sweep: 512,640 comparisons, 0 mismatches. No function added or removed.

No schema or index change in any PR; no environment variable, secret, data or Cloudflare setting was changed.

## Release steps
1. Pushed the four reviewed branches (no force push); opened #81 and #82 against main, #83 stacked on #82, #84 stacked on #83. origin/main was `1e9768b` throughout.
2. Merged #81 (`ab7824b`). No `convex/` file, so no Convex deploy.
3. Merged #82 (`4c9894a`). `wt-release` pulled, clean, HEAD equal to origin/main. `CONVEX_DEPLOYMENT=prod:amicable-eel-413 bunx convex deploy --dry-run`: target `amicable-eel-413`, "No indexes are deleted by this push", schema valid; again listed "Change the server's version for Node.js actions" with no detail (as in earlier releases). Then `bunx convex deploy --yes` 15:41:16-15:41:42 UTC. Redeployed the same main unchanged at 16:21:49-16:22:20 UTC to confirm the deploy (function list unchanged).
4. Deleting the `chore/remove-dead-code` ref after the #82 merge made GitHub close #83 (a closed PR cannot be retargeted). With the owner's approval the unchanged branch (`72a9eed`, already in main) was pushed back as a normal push, #83 reopened, retargeted to main (4 commits, mergeable) and merged without deleting its branch, so #84 stayed open. No new PR was opened.
5. Merged #83 (`08eb5e7`); deployed from `wt-release` at `08eb5e7` 16:24:02-16:24:25 UTC.
6. Retargeted #84 to main (3 commits, mergeable), then deleted the stale `chore/remove-dead-code` and `fix/travel-lead-check` refs; #84 stayed open. Merged #84 (`480b44e`); deployed from `wt-release` at `480b44e` 16:25:07-16:25:31 UTC.

Each deploy ended with:

```
✔ No indexes are deleted by this push
Pushing code to your Convex deployment...
Schema validation complete.
Finalizing push...
✔ Deployed Convex functions to https://amicable-eel-413.convex.cloud
```

## Function list (`bunx convex function-spec` against `amicable-eel-413`)
| After | Functions | `admin.js:createDriver` | `bulkInvites.js:previewCode` | `announcements.js:create` |
| --- | --- | --- | --- | --- |
| Before this release (production as left by earlier releases) | 577 | present | present | present |
| #82 `4c9894a` (and redeploy) | 554 | absent | absent | present |
| #83 `08eb5e7` | 554 | absent | absent | present |
| #84 `480b44e` | 554 | absent | absent | present |

After #83, `rooms.js:workspace` and `participation.js:setParticipation` are present and no `staffRule` entry is registered.

## Frontends
Workers Builds (GitHub check runs) succeeded for both Workers on `4c9894a`, `08eb5e7` and `480b44e` (final: timeclock 16:25:46 UTC, student-status 16:26:16 UTC). After the final builds https://students.team8044.org returned 200 serving `assets/index-SQW16d_J.js` (was `assets/index-DDiHZTOY.js`), and https://timeclock.team8044.org returned 200 serving `assets/index-CBqClJm3.js` (was `assets/index-BB1gzqMF.js`). Worker version IDs were not recorded (VERIFY in the Cloudflare dashboard). The merge of this receipt (docs only) triggers a further Workers Build with identical app code.

## Checks
- `bun run check`: lint, typecheck and build pass; tests 2498/2499 on the final stack. The one failure is the documented `feeBulk` load timeout; it passes alone (9/9).
- `bun run check:timeclock`: pass.
- Security review: safe to merge (#82, #83, #84). Testing review: PASS (#82, #83, #84). Docs reference review: PASS (#81).
- Development smoke: all five personas clean; Coach and Student persona walkthroughs.
- Helper equivalence sweep (#84): 512,640 comparisons, 0 mismatches.

## Known gaps
- Timeclock authenticated console not browser-verified (Google-only sign-in). Its two console messages (a script-tag message and a favicon 404) are pre-existing.
- No signed-in production walkthrough after this release.
- Dashboard check still open from earlier releases: Node actions (push, email) after the reported Node.js action version change.

## Limits and rollback
- Previous main: `1e9768b`. Redeploying it restores the 23 removed functions; no data was changed, so the backend rollback is clean. Frontend: revert the merges or restore the previous Worker versions.
- `bulkInvites.previewCode` caveat: the [2026-10-25 receipt](RELEASE_2026-10-25_VENOM_STATUS.md) kept it so the backend stayed compatible with the pre-2026-10-25 frontend. This release removes it, ending that rollback compatibility: rolling the frontend back past 2026-10-25 now also needs a backend at or before `1e9768b`. The current service worker is network-first and shipped after the frontend stopped calling `previewCode`, so current clients do not call it.
- Strict Travel Lead rule (#83): accounts that relied on a stored `travelLead` flag without the Mentor role lose those Travel Lead actions; that is intended.
