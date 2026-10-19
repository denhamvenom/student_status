# Batch 4 copy inventory

This is the local Batch 4 display-copy inventory against [the master audit](master_report_2026-10-18.md). “Added” means there was no equivalent line in that location. Behavior and access changes are summarized in [batch-4-report.md](batch-4-report.md). Role spot-checks and their limitations are recorded in the report. No private records are quoted.

| Area | Earlier display | Current display / meaning | Source |
| --- | --- | --- | --- |
| Sign-in | No team-code advance notice | “New student? You will be asked for a team code after you sign in.” | `src/LiveApp.tsx` |
| Join request | Waiting state held only in page; declined still appeared waiting | Server-backed “Waiting for approval”; detail says “Your request is with your Coach or Travel Lead.” Declined: “Request not approved” and “Your request was not approved. Ask a Coach for help.” | `convex/app.ts`, `src/LiveApp.tsx`, `src/PendingJoinView.tsx`, `src/lib/live-copy.ts` |
| Team code | No nearby explanation or visible revoke action | “Students use this code to ask to join. A Coach or Travel Lead approves each request.” Coach action: “Revoke code”; confirmation explains a different valid code will be needed. | `src/LiveApp.tsx`, `convex/admin.ts` |
| Travel Lead access | New event / Join requests unavailable in the relevant live navigation | “+ New event” and “Join requests” available to Travel Lead; team-code and Parent-access controls remain Coach-only. | `src/LiveApp.tsx`, `src/AppShell.tsx`, `src/lib/navigation-copy.ts` |
| Event card | No signup queue count | “N waiting”, or “100+ waiting” after the bounded count reaches the cap. | `convex/workflowSummaries.ts`, `src/LiveApp.tsx` |
| Student signup | Button without an outcome explanation | Approval: “The Coach will review your signup. Any fee is charged when you are confirmed.” Open: “You are signed up when you press this.” | `src/LiveApp.tsx` |
| Parent event view | No who-signs-up explanation | Assigned: “The Coach adds students to this event.” Otherwise: “Your student signs up for this event.” | `src/LiveApp.tsx` |
| Money navigation | Advanced controls shared the Money page | “Money tools” links to a page described as “Manage fees, match earlier charges, import payments and review exports and changes.” Money retains day-to-day work. | `src/LiveApp.tsx`, `src/AppShell.tsx`, `src/lib/navigation-copy.ts` |
| Money definitions | Amount labels without explanations | Balance due: “The amount still needed to cover charges.” Charged: “The total cost of charges on this account.” Applied to charges: “Personal payments and fundraising credit already used for charges.” Available funds: “Unused personal payments and fundraising credit available for charges.” | `src/lib/family-copy.ts`, `src/LiveApp.tsx`, `src/DashboardReports.tsx` |
| Money source definitions | Source labels without explanations | Personal: “Personal payments that have not yet been used for charges.” Fundraising: “Fundraising credit that has not yet been used for charges.” Raised: “The full amount raised before the team and student shares are split.” Earned: “The student share earned from fundraisers.” Transfers: “Credit received from another account or season.” | `src/lib/family-copy.ts`, `src/LiveApp.tsx`, `src/DashboardReports.tsx` |
| Home Money | Available funds absent | Adds “Available funds” and its amount when above $0. | `src/DashboardReports.tsx` |
| Coach health | Entered but unconfirmed health could appear missing | “Entered, waiting for a parent to confirm.” | `convex/workflowSummaries.ts`, `src/CoachStudentRecord.tsx` |
| Parent independent travel | Less explicit checkbox; no immediate acknowledgement | “My student will travel on their own (not with the team).” After save: “Saved”. | `src/Travel.tsx` |
| Student independent travel | Student editable control | Off: “Your parent or Coach sets this if you will travel on your own.” On: “Traveling on your own (set by your parent or Coach).” | `src/Travel.tsx`, `convex/travel.ts` |
| Profile correction queue | Queue location not signposted on roster | “N profile corrections waiting” links to Users & Roles when positive. | `convex/workflowSummaries.ts`, `src/LiveApp.tsx` |
| Readiness permission item | No student-specific permission link | “Open permission forms” opens the selected Student in Permission forms. | `src/features/design-review/ReadinessReview.tsx`, `src/PermissionWorkflow.tsx` |
| Pre-kickoff Tuesday attendance | Unavailable placeholder | “Not counted yet” when no Tuesday percentage can be counted. | `src/DashboardReports.tsx`, `src/TeamReports.tsx` |
| Subteam choices | Mechanical, Programming, Electrical, Outreach, Business, Other | Final approved list: Build, Electrical, Machining, Programming, Business/Media. This final spelling supersedes the master audit's “Business and Media”. Legacy Mechanical maps to Build; Business and Outreach map to Business/Media. Stored conversion is explicitly deferred by the owner. | `src/lib/subteams.ts`, `src/lib/live-copy.ts`, `src/SetupWizard.tsx`, `src/CoachRosterManagement.tsx`, `src/TeamReports.tsx` |
| Rooming correction | “Ask a Coach to change your subteam, rooming or Travel Team.” | Added the approved line “To change your rooming category, use Request a correction on your Profile.” Coach direction remains for subteam and Travel Team changes. | `src/lib/setup-wizard-copy.ts`, `src/SetupWizard.tsx` |
| Revoke Parent access | Single action | “Revoke access” opens a confirmation identifying the Parent link and Student. | `src/ParentInvites.tsx`, `src/ConfirmAction.tsx` |
| Finalize room | Single action | “Review and finalize” opens a confirmation listing the room and current members; changed membership is rejected on save. | `src/features/operations/RoomOperations.tsx`, `src/ConfirmAction.tsx`, `convex/rooms.ts` |
| Write off | Single action | “Write off” opens a confirmation with the amount and reason and explains this is a season-plan decision, not immediate debt deletion. | `src/SeasonReviewSteps.tsx`, `src/ConfirmAction.tsx` |
| Whole Team departure | Student request/review path | “Leave this event”; confirmation says the Coach will be told; afterward “You have left this event. Your Coach has been told.” If needed, “The fee decision is waiting for Coach review.” | `src/Withdrawals.tsx`, `convex/withdrawals.ts` |
| Whole Team staff notice | No durable on-page notice | “Left Whole Team events” lists undismissed notices; Coach action is “Dismiss”. Fee-only review uses “Deny fee adjustment” or “Save fee decision”. | `src/Withdrawals.tsx`, `src/features/operations/EventOperations.tsx` |

The proposed open-requirement count on **all** event buttons remains deferred because its extra all-event readiness work has not been established as cheap. This is separate from the implemented waiting-signups count on event cards. CSV headers and money behavior were not changed for this copy batch.

| Additional copy | Earlier display | Current display | Source |
|---|---|---|---|
| Locked team code | Ask a Coach for a new code. | Try again in 15 minutes, or ask a Coach for a new code. | `src/lib/live-copy.ts` |
| Team report total | Potentially contradictory total plus more-available warning | Showing all N students when exhausted; Showing N students so far with Load more when incomplete; filtered totals identify the loaded scope. | `src/TeamReports.tsx` |
| Unavailable student link | Could fall back to the first roster student | The linked student is not available in this roster. Choose a student below. | `src/PermissionWorkflow.tsx` |
