# Language

The agreed words for Student Status. Owner-approved October 25, 2026, from the "Student Status Language Dictionary" workbook (extracted at `749005e`). Timeclock and the `?review=` fixture screens are out of scope.

Write every new or changed user-facing string to this page. Rewrite screen by screen with the screenshot beside the change, never as a find-and-replace (typography in "Writing rules" is the one exception).

## Writing rules

- The app is **Venom Status** (renamed from Student Status, owner decision October 25). Use "VENOM STATUS" where the design uses capitals. Repository, Convex project, Worker and domain names are unchanged.

- US spelling: canceled, canceling; "cancellation" is also correct.
- Use the ellipsis character `…`, never three dots, in "Loading…", "Saving…".
- Role titles are always capitalized: Student, Parent, Coach, Mentor, Travel Lead.
- When a Coach or a Travel Lead can act, say "a Coach or Travel Lead". Say "a Coach" only when only a Coach can.
- Students are addressed in second person ("your events").
- Parent screens use the student's name wherever possible ("Dev Student's profile", "Dev Student still needs…"). Never repeat the name twice in one sentence.
- Every error says what happened and what to do next, following [ACTIONABLE_ERRORS.md](ACTIONABLE_ERRORS.md). If nothing can be done, say who to contact.
- No engineering words reach people: revision, evidence, snapshot, transaction/retry/batch key, integrity check, SHA-256, hash, cursor, read budget, immutable, exact-cent, job, actor. Say what happened instead, e.g. "This changed since you opened it. Reload to see the latest, then try again."
- Show a PDF as "PDF" only when people download or print the copy.

## Roles

| Role | Who they are | How to write about or to them |
|---|---|---|
| Student | A team member in the active season, signed in with their own account. | Second person. |
| Parent | A parent or guardian linked to one or more students. | Use the student's name; "parent or guardian" only on forms and invitations. |
| Coach | Runs the team; full access, including money editing and health exports. | "a Coach" when any Coach can act. |
| Mentor | Adult volunteer without travel or money access. | Capitalized. |
| Travel Lead | A Mentor given travel access: events, readiness, drivers, rooming, permission forms. | Never "travel lead", "Mentor Lead", "Mentor + Travel Lead" or "Travel Team". |
| Parent with staff access | A Parent who can also switch to Mentor or Travel Lead. | The switch is labeled "Switch role"; the dialog lists Parent, Mentor and Travel Lead. |

## Terms

| Idea | Students & Parents | Staff | Avoid |
|---|---|---|---|
| The money section | Money | Money (section); account (one student's money: "Dev Student's account") | Finances, Finance, Student accounts (as a section name) |
| Landing page after sign-in | Home | Team (Coach, Travel Lead); Profile (Mentor) | Status (as a page name) |
| Profile pages | Profile (Student menu); {Student's name}'s profile (Parent menu, one or several students) | Profile (own); student record (a student's staff page) | Profile & health, health profile, Parent health and contact profile, My profile, Student profile |
| Health section | Health information: Allergies, Medications, Insurance, Physician | Health information | Medical (as a step name), Prescriptions |
| Event permission form | Permission form; Permission forms (menu) | Permission form; Permission forms (menu) | Forms (menu), field trip form, field trip PDF, consent snapshot/evidence, PDF wording version |
| FIRST's registration | FIRST registration (includes FIRST's Consent & Release, explained once) | FIRST registration | team invitation (say "FIRST team invitation link") |
| Waiting for staff | Waiting for Coach approval; Waiting for Coach or Travel Lead approval | Needs review (your queue); Pending approval (status label) | Awaiting approval, Awaiting review, Pending review, Waiting on the Coach |
| What a student is billed | fee; travel fee when tied to an event | Fee settings (what an event or the season costs); fee / travel fee (on one student) | charge, Charges |
| Money already used to pay a fee | Paid so far | Paid ("Paid $60 of $100") | Applied, Applied funds, Used toward this charge |
| Money still owed | Balance due | Balance due; Unpaid (status chip only) | debt, outstanding amount, owed, Due (alone) |
| Total money on a student's account | Available funds | Available funds | Personal available |
| Payments not yet used for a fee | Unused payments (small breakdown line under Available funds) | Unused payments (always shown under Available funds) | Personal payments, Unused personal payments |
| Student's share of fundraiser money | Fundraising credit (breakdown line) | Fundraising credit | travel credit, Student travel, travel share, Earned from fundraisers, Fundraising available |
| Adults who run the team | team staff (only when it means all adults); otherwise name the role | Coach, Mentor, Travel Lead | Mentor/Staff, adult accounts |
| Parent or guardian | parent; parent or guardian (forms and invitations) | parent | Parent / guardian, Legal guardian (except on the signed form) |
| Putting a student on an event | Sign up (verb), signup (noun); Signed up, Waitlisted, Waiting for approval, Not signed up | Signups | registered (for events), enrollment, Participants |
| Joining the team | Join the team; invitation code (6 digits) | Join requests; invitation code | individual code, team code vs student code, enroll |
| Hotel rooms | Rooms (page); Room type (Boys / Girls); Room choice | Rooming; Room type | Rooming category |
| Leaving an event | Withdraw from this event; withdrawal request (statuses say refunded, moved to Available funds, or still owed) | Withdrawal requests | Financial work complete, Returned to travel accounts |
| Ended events | Past events | Past events; Record review (the `/retention` page) | Archived, retention |
| What a student still needs | What's left (Home); requirements | Event readiness | Readiness (alone), Open Readiness |
| Travel Lead / Travel Team | Travel Lead (adult role); Travel Team (students chosen by application for out-of-state events and the local event) | Same | Mentor Lead; Travel Team for adults |
| Extra staff permissions | (not shown) | access: "Money editing access", "Health export access" | grant, capability, health-record grant |
| Trying again | Try again | Try again (an action); Reload (fresh data) | Retry |
| Longer lists | Show more {items} | Show more {items} | Load more, More …, Older … |
| Getting to an event | Transport; ride with a team driver; own transport | Transport; drivers; vehicles | independent travel, travel on their own (mixed with own transport) |
| Signing in | sign in (verb), sign-in (noun) | Same | log in, login |
| Team reports | (not shown) | Reports (Coach, Travel Lead); Team report (Mentor); menu label matches heading | Report (alone) |
| Attendance | Attendance; meetings | Attendance; meetings | sessions, practices, Attendance fixes (as a menu name) |

## Student Home (October 27)

Owner-approved October 26–27 for the redesigned Student Home. Strings live in `src/features/student-home/copy.ts`; this table records the words, not every sentence.

| Place | Words | Avoid |
|---|---|---|
| Greeting | Hey, {first name}; {Weekday, Mon D} — Here's what needs your attention; {Weekday, Mon D} — You're all set (desktop); {Weekday, Mon D} · Hey, {first name} (phone) | Season · Week N |
| Done state | You're all set | Paid up, All clear, All caught up |
| Top card stack | Highlights (screen-reader name); Previous card, Next card, Show card {n} of {m}; Nothing new from the team right now. | Coach's tile (in the app) |
| Highlights to-do cards | Invite a parent; Remind your parent to finish FIRST registration and Consent & Release.; Finish FIRST registration; The fee for {event} is past due. Your parent needs to review the payment due.; Remind your parent to complete the permission form for {event}.; Open event; Open Money; Overdue; Due {weekday}; Due {Mon D}; Due today | Tasks, To-do |
| Room choice card | Room choice; Closes {weekday}; Closes today; {n} days left (with the date after it only when the pill shows a weekday); Last day; Your room group; Not chosen yet; Start a group, accept an invitation or ask to be assigned.; Assignment requested; Final; Invitations; {name} invited you; Waiting for your reply; No changes after the {Mon D} deadline; Choose your room | Pick your room type, Pending your reply |
| Announcement card | Coach announcement; Travel Lead announcement; Show full message | |
| Countdown card | Countdown; {n} days to kickoff; {n} hours to kickoff; {n} days to go (the Competition name on its own line below); Now; Kickoff · {Mon D}; Upcoming milestones | Weeks to kickoff, Pre-season |
| Open signups | Open signups; {n} closing soon; {n} open; Closes {Weekday, Mon D}; Closes today; Starts {Weekday, Mon D}; Show more signups; No open signups right now. New events show up here. | sign-up (noun) |
| Signup sheet | When; Fee; No fee; Spots; {n} spots left; Full; What happens; You're signed up when you press Sign up. The fee is added to Money.; A Coach or Travel Lead reviews your signup. Any fee is charged when you're confirmed.; You'll join the waitlist.; A Coach assigns students to this event, so it has no signup. Ask a Coach if you still need to go.; You're signed up.; You're waitlisted.; Your signup is waiting for Coach or Travel Lead approval.; Close | Register |
| What's left | What's left; {n} left for you; Nothing for you right now; {n} due soon; Due {Weekday, Mon D}; Show all; For you; Waiting for your parent; Waiting for Coach approval; Waiting for Coach or Travel Lead approval; {n} waiting for others; Nothing left. You're all set. Item names: Invite a parent, Finish your setup, Health information, FIRST registration, Balance due, Permission form, Choose your room, Your signup, Event records, Event requirement | Tasks not yet complete |
| Balance due | Balance due; Your parent needs to review the payment due.; Fundraise (only when the Student has a fundraiser link); Available funds {amount}; Money is updating. Check back in a few minutes. | Pay now (on Home), Balance (alone) |
| Participation | Participation; Meetings; Outreach; Build hours; {a} / {h} attended; of {n} events; {h}h; of {t} target; since kickoff; Starts at kickoff; No meetings yet; Updating; Participation shows here once meetings start. | practices, sessions |
| Errors | {Tile} could not load. Try again. If it keeps happening, contact a Coach. | Retry |
| Student shell | VENOM STATUS; Team 8044 (account footer); Dark mode; Profile (avatar link) | |
| Event status for Students and Parents | Signed up; Waiting for approval; Waitlisted; Not signed up; Withdrawn (staff keep Pending approval) | Confirmed, Pending, Waitlist, Not registered |
| Parent invitations | Waiting for your parent to accept · expires {date} (Student); Waiting for the parent to accept · expires {date} (staff); Expired · {date}; Accepted · {date}; Revoked; Replaced by a newer invitation | pending (lowercase status) |
| Announcements page (Coach, Travel Lead) | Announcements; Pin up to five messages to Student Home. Students see the newest pin first.; New announcement; Edit announcement; Title (optional); Message; {n} of 500 characters; Show until (optional); Pin to Student Home; Pinned ({n} of 5); Not pinned ({n}); Pin; Unpin; Edit; Remove; Five announcements are already pinned. Unpin one first. | |
| Season page (Coach) | Build hours target; Hours each Student aims to log at Build meetings from kickoff. Shown on Student Home.; No target set.; Current target: {n} hours.; Enter whole hours from 1 to 2000, or leave the box empty to clear the target. | |
