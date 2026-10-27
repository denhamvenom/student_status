# Handoff

October 27, 2026 | Branch: feature/student-home-redesign (from main 7376a71)

## Venom Status (formerly Student Status)

[v0.1.0-onboarding.19](https://github.com/denhamvenom/student_status/releases/tag/v0.1.0-onboarding.19) is live (main `7376a71`). Production backend and both Workers were verified; no real-account production walkthrough or real email send was done. [Release receipt](docs/releases/RELEASE_2026-10-25_VENOM_STATUS.md)

## Timeclock

Clocking, PIN controls, automatic closing, fixed event roster and historical import remain implemented; Calendar checks run at 6 AM/3 PM Central plus manual refresh. Rollout reached 100%.

## In progress

Student Home redesign (Claude Design "Student Home — chosen direction", October 26; the newest design folder is the reference, page background deep purple, never black). Built and committed locally through `8fd1051`, synced to development `third-bandicoot-18` only, not pushed. Owner decisions: docs/DECISIONS.md "Redesign dashboards"; wording: docs/LANGUAGE.md; scenarios: docs/DEVELOPMENT.md "Student Home scenarios".
Open polish (in `src/features/student-home/`):
- Countdown: for Competitions show "{n} days to go" with the event name on its own smaller line (keep "to kickoff"); update the LANGUAGE.md row.
- Desktop: the inset panel in `tiles/ActionCard.tsx` and `tiles/RoomChoiceCard.tsx` shrinks to its content.
- Date pill: no repeated date; 7 or more days out shows "Due {Mon D}".
- Compact "Show more signups" target to at least 44px; add a `dotColumns` test (`src/components/dashboard/HeroStack.tsx`).
Then: live scenarios (busyWeek, allDone, newStudent, reset) as the developer Student at 390/1440, light/dark, compared with `test-results/smoke` and the design renders (evidence outside Git in `Logistics Work\Student Home Redesign Evidence`); `bun run check`, `bun run check:timeclock`; remove helper worktrees `student-status-sh-d`…`sh-j` once merged (sh-d's uncommitted dev harness is not needed).

## Top open risks

- **Exposed key fragments (October 25):** rotation awaits the owner's decision. List production settings by name only.
- Build hours need Recalculate attendance on production before kickoff. [Backlog](docs/BACKLOG.md#product)
- Contact admin email has not been sent for real; a dev test send awaits owner approval.
- Signed-in transportation walkthrough, real PDF signing (deferred), backup/restore proof and security reviews remain open. [Backlog](docs/BACKLOG.md#testing)
- Coach Season overflows at 390px (deferred to its redesign).
- Heavy tests (feeBulk, bulkInvites and others) time out intermittently in full runs here; rerun alone. [Testing](docs/BACKLOG.md#testing)

## Next step

Finish the Student Home polish list above, run typecheck, lint and targeted tests, and commit; then the live screenshot pass. No push, merge or production action without the owner's explicit approval.
