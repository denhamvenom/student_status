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
