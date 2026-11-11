# Release 2026-11-10: Usability audit (wizards, money edits, readiness, roster, Mentor scope, Parent Home, Ask a Coach, sign-in)

**Status: release candidate. Not merged and not deployed.** [PR #88](https://github.com/denhamvenom/student_status/pull/88), branch `feat/usability-audit`, HEAD `9aa78a8` on origin/main (VERIFY base commit at merge). Merge needs the owner's explicit approval, and so does the production deploy. Placeholders marked (VERIFY) are filled in after release.

| Item | Value |
| --- | --- |
| Commits | 4: `ad9b32b`, `614f034`, `27ab9ce`, `9aa78a8` |
| Size | 260 files, +8021/-1756 |
| Merge commit on main | (VERIFY) |
| Production Convex deploy | (VERIFY) amicable-eel-413, time and result |
| Workers Builds | (VERIFY) student-status and timeclock |

## Scope
Decisions are in docs/DECISIONS.md (Usability audit, November 9 and November 10, 2026); the November 10 lines win where they differ.
- **Wizards:** Health information, setup Review steps, fee entry, Add a fee, season transition (Mark all as Returning), Add driver, announcements, New event and event page.
- **Money:** amount guard; overpayment check (confirmation at $1,000 or more over Balance due); cash payments and cash returns need no check/receipt number; Edit payment (amount, method, check/receipt number, student) for a Coach or a Travel Lead with Money editing access, reason required, original never overwritten, amount change re-applied in fee order, move to another student, $0 undoes a payment, shown in Recent changes; no default payment method; Record payment is 3 steps with the note on Review; reasons need at least 8 characters.
- **Event readiness and requirement kinds:** lists only events with requirements to complete; inapplicable columns hidden; permission status only while signing is open. Custom requirements are "Something to know" (information only) or "Checked off by a Coach or Travel Lead".
- **Shifts counting:** a confirmed student below the event's minimum shifts is not ready (Event readiness, Team roster, family views). Students pick shifts on the event page; Parents see them but cannot pick.
- **Roster:** requirement chips (Needs attention, FIRST registration, Permission form while open, Balance due, Missing profile information); Needs attention means an open item on the next confirmed event.
- **Mentor scope and inbox:** Who's here now, Join and Team report default to the Mentor's subteams (Show all subteams; no health, money or contact data; 40-student cap stated); New meeting notices limited to whole-team or the Mentor's subteams; Inbox "Older" for notices whose event has ended.
- **Parent Home:** unfinished setup shows a "Finish setup" card and What's left item with the full wizard on Home (`/setup` still works); room status wording.
- **Ask a Coach:** Parents, Students and Mentors send topic and message to coach@team8044.org; recipient fixed on the server, Reply-To is the sender; 3 per hour and 10 per day per account; no health or money data in the email.
- **Google account chooser and email-code step:** Google always shows the account chooser, wrong-account screens offer "Use a different Google account"; the email-code step keeps the sign-in email in the browser for up to 15 minutes (never the code).
- **Wording:** plain-language pass over fee, payment, season, operations, family and navigation copy.
- **Developer sign-in (development only):** fictional account Travel Lead with Money editing access (no Health export access), with each account's description under its button.

## Schema
Both additive; no existing data changes.
- New table `paymentEdits` (indexes `by_sourceEntryId_and_at`, `by_movedEntryId`, `by_actorId_and_idempotencyKey`).
- Optional field `requirements.kind` (`"info"` or `"checkoff"`).
- **No backfill needed:** a missing kind means checked off, so existing requirements behave as before. No environment variable, secret or Cloudflare setting changes.

## Verification (implemented, reviewed, tested)
- `tsc`, lint and build clean.
- Full vitest 2863/2865; the 2 failures are known load timeouts that pass when run alone.
- Opus security reviews: no High or Medium findings.
- Six role walkthroughs on development deployment rounds v2 to v4 with fictional data.
- Production: calendar writes on and the email key present, checked without printing values (VERIFY at deploy).
- Production-verified: nothing yet.

## Validation limits
- No real Google sign-in was tested.
- Installed-app sign-in was not tested on a real phone.
- Walkthroughs used the development deployment, where Team Calendar writes are off; calendar behavior with writes on is untested in walkthroughs.
- Ask a Coach email delivery in production not exercised (VERIFY after deploy).

## Known open items (follow-up, not blocking)
- Team transfer review sender.
- Record payment short note.
- Parent setup save wording.
- "Alternate" vs "Other emergency contact".
- Home "Next" after FIRST.
- Profile leftover Step block.
- Money returned banner and placeholder.
- Room reason message location.
- Season step 5 stale save.
- Older label wording.
- "I don't know" for allergies and medications.

## Release steps
1. Owner approves; merge PR #88 (merge commit) -> (VERIFY) main commit.
2. Pull main in a clean worktree; confirm HEAD equals origin/main.
3. `convex deploy` from main, announcing the target first (dry run, then deploy) -> (VERIFY).
4. Workers Builds for both Workers succeed -> (VERIFY).
5. Verify https://students.team8044.org and https://timeclock.team8044.org return 200 with new assets, and `bunx convex function-spec` against production lists the new functions (VERIFY).

## Rollback
- Revert the merge commit on main and redeploy main. The `paymentEdits` table and `requirements.kind` are unused by older code and can stay; older code treats all requirements as checked off.
- Payment edits recorded after release stay in the ledger as corrections; reverting hides the Edit payment history view but does not alter balances.
- Frontend: revert the merge or restore the previous Worker versions.
