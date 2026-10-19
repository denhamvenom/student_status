# Batch 1 exact copy changes

Compared with documentation checkpoint bd7ab86. Each file lists removed text and its replacement. New helper text is marked Added; shared-copy moves are noted at their original UI location. Stored keys are unchanged. Templates preserve interpolated values.

## convex/setupWizard.ts

| Before | After |
| --- | --- |
| Choose a valid T-shirt size. | Choose a valid shirt size. |
| Choose a valid T-shirt size. | Choose a valid shirt size. |

## src/CoachRosterManagement.tsx

| Before | After |
| --- | --- |
| Access active | Can sign in |
| Access inactive | Sign-in turned off |
| None identified | Nothing missing |
| `Showing all ${page.results.length} ${active?'active':'archived'} students.` | `Showing all ${page.results.length} ${active?'active':'archived'} student${page.results.length===1?'':'s'}.` |

## src/CoachStudentRecord.tsx

| Before | After |
| --- | --- |
| No linked student account | None linked |
| Linked student account · access active | Can sign in |
| Linked student account · access inactive | Sign-in turned off |
| Student account<br>Required setup<br>Incomplete<br>Recorded | Student sign-in<br>Student setup<br>Not done<br>Done |
| `${data.missingSummary.length} item(s)`<br>None identified | `${data.missingSummary.length} missing`<br>Nothing missing |
| Personal available<br>Fundraising available | Unused personal payments<br>Unused fundraising credit |
| Open Coach finance workspace | Open Money |
| Open team readiness | Open Readiness |
| Open correction requests | Open profile corrections |
| Open Coach attendance workspace | Open Attendance |

## src/LiveApp.tsx

| Before | After |
| --- | --- |
| Close account | Close details |
| Waiting on your parent to finish your health profile. | Your parent still needs to finish your health profile. |
| Team (event category/cards/detail/wizard review) | Team activity; explicit option values preserve stored Team |
| Added | Travel Team: students chosen by mentors and Coaches through an application. They go to all out-of-state events and our local event. |
| This page is for Coaches. | This page is for Coaches and Travel Leads. |

## src/SeasonAdministration.tsx

| Before | After |
| --- | --- |
| Review and save each decision before confirming. Historical records remain attached to their original season. | Save each choice before you confirm. Old records stay with the season they came from. |

## src/SeasonReviewSteps.tsx

| Before | After |
| --- | --- |
| Needs Coach review | Needs your review |
| Locked, read-only historical records. Original student IDs, attendance, signatures and financial evidence remain in this season. | These past-season records are locked. Attendance, signatures and money records stay with this season. |

## src/SetupWizard.tsx

| Before | After |
| --- | --- |
| T-shirt size | Shirt size (shared setupWizardCopy.shirt) |
| T-shirt size | Shirt size (shared setupWizardCopy.shirt) |

## src/TeamReports.tsx

| Before | After |
| --- | --- |
| Attendance totals start at kickoff. | Attendance totals start at kickoff, when the FIRST build season begins. |
| Paid | Applied to charges |
| Showing 1 student. | Moved to shared copy / removed |
| `Showing ${rows.length} of ${page.results.length} ${studentNoun} shown so far. More students may be available; filters and CSV include only students shown.` | `Showing ${rows.length} of ${page.results.length} loaded ${studentNoun} for these filters. Press Load more to see more. Filters and the CSV file use only the students shown.`<br>`Showing ${page.results.length} ${studentNoun} so far. Press Load more to see more. Filters and the CSV file use only the students shown.` |
| Choose an event to see readiness and outstanding requirements. | Choose an event to see who is ready and what is still to do. |
| Attendance totals start at kickoff. | Attendance totals start at kickoff, when the FIRST build season begins. |
| Paid | Applied to charges |
| Tuesday attendance<br>Thursday sessions | Tuesday meetings<br>Thursday meetings |
| Outstanding | Still to do |
| Paid | Applied to charges |
| Tuesday attendance | Tuesday meetings |
| Thursday sessions | Thursday meetings |
| Outstanding | Still to do |

## src/features/design-review/ReadinessReview.tsx

| Before | After |
| --- | --- |
| Team (readiness event type) | Team activity |
| Review season verification | Open student record |
| Review season verification | Open student record |
| Print permission forms from Permission forms | To print permission forms, open Permission forms. |

## src/features/design-review/readinessCopy.ts

| Before | After |
| --- | --- |
| This review screen is available to Coaches. | This page is for Coaches and Travel Leads. |
| Outstanding<br>No outstanding items shown.<br>Print permission forms from | Still to do<br>Nothing left to do.<br>To print permission forms, open |

## src/features/operations/EventOperations.tsx

| Before | After |
| --- | --- |
| 6/14/2027, 7:00:00 PM CDT (date format example) | Jun 14, 2027, 7:00 PM CDT |
| 1 custom requirements | 1 custom requirement (plural retained for other counts) |
| Use a unique short name, such as lunch-order (up to 32 letters, numbers, hyphens or underscores). Keep it unchanged when editing the same requirement. | A short code, like lunch-order. Use up to 32 letters, numbers, - or _. Do not change it later. |

## src/lib/account-copy.ts

| Before | After |
| --- | --- |
| This invitation has expired, was used or was revoked. Ask a Coach for a new link.<br>Sign in with the invited verified Google account to accept this invitation. | This link has expired, was used, or is no longer available. Ask a Coach for a new invitation.<br>This Google account is not the one invited. Sign in with the invited account, or ask a Coach for a new invitation. |
| Invitations expire after one week and must be accepted with the invited Google email. | Invitations expire after one week. The adult must sign in with the Google email you enter. |

## src/lib/adult-profile-copy.ts

| Before | After |
| --- | --- |
| Review unowned driver records with one verified Mentor Google email match. Other conflicts need separate Coach review. | Link a driver to a Mentor when the driver's email matches one Mentor's Google email. Check other cases by hand. |

## src/lib/event-copy.ts

| Before | After |
| --- | --- |
| Participation and event fees are being prepared. Event arrangements will be available when enrollment is complete. | Students and event fees are being added. The rest of the event page will open when this is done. |
| Team | Team activity |
| Individual student selection is not available in this creation flow.<br>Pending signups are charged only when confirmed. Additional charges can be added from student finances after creation. | You can't pick single students here.<br>Pending signups are charged only when confirmed. You can add other charges on the Money page later. |

## src/lib/family-copy.ts

| Before | After |
| --- | --- |
| You are all caught up. | Nothing for you to do right now. |
| Available funds can pay other charges or be used toward a future charge. Money returned from a canceled event stays available here; it has not been paid back to the family in cash or by check. | Available money can pay other charges now or later. Money from a canceled event stays here. It has not been paid back to the family in cash or by check. |
| Control whether students can create new parent invitations across the team. Invitations already issued remain valid until their own expiry, and linked parents keep access. | Choose if students can invite new parents. Invitations already sent still work until they expire. Linked parents keep access. |
| Parent accounts | Parents |
| Ask the student for a new invitation link. | This link has expired, was used, or is no longer available. Ask the student for a new invitation or contact a Coach. |
| Use the Google account that received this invitation. Student information appears only after the invited account is verified. | Use the Google account that got this invitation. You will see student information after we check the account. |
| This Google account does not match the invited email. Sign in with the invited account, or ask the student for a corrected invitation. | This Google account is not the one invited. Sign in with the invited account, or ask the student for a new invitation. |

## src/lib/family-link-maintenance-copy.ts

| Before | After |
| --- | --- |
| Maintenance needs Coach review before it can continue. | Maintenance needs your review before it can go on. |

## src/lib/finance-admin-copy.ts

| Before | After |
| --- | --- |
| Paid | Paid (personal) |
| Paid is personal payments applied to charges. Fundraising applied is fundraising credit used on charges. Fundraising available is unused fundraising credit; account details show unused personal payments separately. Available funds are not cash refunds. | Paid (personal) is personal payments used on charges. Fundraising applied is fundraising credit used on charges. Fundraising available is credit not used yet. Each account's details show unused personal payments. Money still available is not a cash refund. |
| Record | Record payment |
| Each before-and-after amount belongs to that recorded change, not the student’s current balance. Earlier amounts appear only when the original record supports them. | Each before and after amount is for that one change. It is not the student's balance now. Older amounts show only if the old record has them. |

## src/lib/finance-export-copy.ts

| Before | After |
| --- | --- |
| Download charges and payments for the selected students. The charge file separates personal payments from fundraising credit. Available balances repeat on each charge row; do not add those repeated balances together. | Download charges and payments for the students you choose. The file lists personal payments and fundraising credit apart. Each charge row repeats the student's available balance, so do not add those up. |
| Download the JSON file too. It lists every included student, including those with no charges, and records when the data was collected.<br>Records are collected over a time range. They do not all represent one moment in time. | Also download the JSON file. It lists every student included, even those with no charges, and when the data was gathered.<br>The data is gathered over a short time, not at one exact moment. |

## src/lib/fundraising-copy.ts

| Before | After |
| --- | --- |
| Record amounts raised and review how proceeds support the team and student travel. | Record money raised and see how it is split between the team and student travel. |
| Allocate proceeds | How to split the money |
| Known gross raised | Known total raised |

## src/lib/historical-copy.ts

| Before | After |
| --- | --- |
| Historical records are locked. Corrections preserve the original evidence and record your identity, time and reason. Access expires after 15 minutes.<br>I understand that this changes historical records and reports. | Past records are locked. A fix keeps the original and saves who made it, when and why. Fix mode ends after 15 minutes.<br>I understand this changes past records and reports. |

## src/lib/live-copy.ts

| Before | After |
| --- | --- |
| Your request is with the Coach. This page will open your team profile after approval.<br>Student join request<br>Enter the team code from a Coach, then confirm your student name. | Your request is with your Coach or Travel Lead. This page opens your team profile when you are approved.<br>Join the team<br>Enter the team code from a Coach, then type your first and last name. |
| Signed in with the wrong Google account? Sign out, then use the account linked to your team profile. | Wrong Google account? Sign out, then sign in with the right one. |
| Competitions and outreach for the current season. | Competitions, outreach and team events this season. |
| Report | Team reports |
| Tuesday attendance<br>Thursday sessions | Tuesday meetings<br>Thursday meetings |
| Attendance totals start at kickoff. | Attendance totals start at kickoff, when the FIRST build season begins. |
| Review participation changes and how event payments are handled. | Decide requests to leave an event, and what happens to money already paid. |

## src/lib/operations-copy.ts

| Before | After |
| --- | --- |
| Team transportation required | Students must ride team transport |
| Review Timeclock attendance and make audited corrections. Clock-in and clock-out stay in the separate Timeclock app. | Check Timeclock attendance and fix mistakes. Every fix is logged. Students clock in and out in the separate Timeclock app. |
| Earlier attendance checkmarks are shown separately from clocked time. | Old checkmark records are listed apart from Timeclock time. |
| HTTPS link | Web link (https://) |
| places reserved | places taken |
| . Pending signups reserve a place; charges begin at confirmation. | . A pending signup holds a place. The fee is charged only when the student is confirmed. |
| . Waitlisted students are promoted manually in signup order. | . Waitlisted students move up only when someone presses Promote. They move up one at a time, in signup order. |
| Unallocated personal payments | Unused personal payments |
| Available fundraising credits | Unused fundraising credit |
| `${seats} passenger seats for ${riders} riders (${students} students, ${adults} additional adults).` | `${seats} passenger seats for ${riders} riders (${students} student${students === 1 ? '' : 's'}, ${adults} more adult${adults === 1 ? '' : 's'}).` |
| `${count} places reserved${capacity !== undefined ? ` of ${capacity}` : ''}${available !== null ? ` · ${available} available` : ''}. Pending signups reserve a place; charges begin at confirmation.`<br>`Signup closes: ${date}. Waitlisted students are promoted manually in signup order.` | `${count}${capacity !== undefined ? ` of ${capacity}` : ''} place${count === 1 && capacity === undefined ? '' : 's'} taken${available !== null ? ` · ${available} left` : ''}. A pending signup holds a place. The fee is charged only when the student is confirmed.`<br>`Signup closes: ${date}. Waitlisted students move up only when someone presses Promote. They move up one at a time, in signup order.` |

## src/lib/report-copy.ts

| Before | After |
| --- | --- |
| Attendance totals start at kickoff.<br>Attendance totals start at kickoff. | Attendance totals start at kickoff, when the FIRST build season begins.<br>Attendance totals start at kickoff, when the FIRST build season begins. |
| Clocked attendance<br>Earlier attendance (checkmarks)<br>Earlier checkmarks are shown separately from clocked time.<br>Completed sessions count after one uninterrupted scheduled hour. Sessions still open or needing review are excluded from totals. | Attendance from the Timeclock<br>Earlier attendance (marked by a Coach)<br>Old checkmark records are listed apart from Timeclock time.<br>Completed sessions count after a full hour with no breaks during the scheduled time. Sessions still open or needing review are excluded from totals. |
| A full uninterrupted scheduled hour is required.<br>`Counts after one full uninterrupted scheduled hour. Longest visit: ${duration}.` | A full hour with no breaks during scheduled time is required.<br>`Counts after a full hour with no breaks. Longest visit: ${duration}.` |
| Totals include active and inactive student accounts in the current season. | Totals count both active and archived students this season. |
| Gross Raised | Total raised |
| Gross raised is the total before the team and student split. | Total raised is the amount before it is split between the team and students. |
| Inactive students | Archived students |
| Available personal payments | Unused personal payments |
| Recalculate attendance from the Timeclock and recorded corrections. Totals may be unavailable until this finishes. | Count all attendance again. This uses the Timeclock and your fixes. Totals may say Unavailable until it is done. |

## src/lib/retention-copy.ts

| Before | After |
| --- | --- |
| Review archived records and record holds. Reaching five years prompts review; it does not authorize deletion. | Check archived records and place holds on any that must be kept. At five years a record is flagged for review. That alone does not allow deleting it. |
| Application accounts | Sign-in accounts |
| Archive date missing — needs Coach review | Archive date missing. Please check it. |
| Deletion is disabled pending approved policy and separate verification. | Deleting records is turned off until a policy is approved and checked. |

## src/lib/roster-management-copy.ts

| Before | After |
| --- | --- |
| Archive this current-season student profile. Records and balances are retained. This changes roster status; it does not deactivate or reactivate the linked Google account.<br>Restore this current-season student profile. Eligible upcoming Whole Team events include reactivated students while preserving earlier withdrawals. This changes roster status; it does not deactivate or reactivate the linked Google account. | This moves the student to the archived list. Their records and balances stay. Their Google sign-in does not change.<br>This moves the student back to the active list. They rejoin upcoming Whole Team events, but not events they left. Their Google sign-in does not change. |
| Student status changed. Review the current roster and choose the appropriate action again. | This student's status just changed. Check the list and choose again. |
| Manage active and archived student profiles in the current season. | See and manage this season's active and archived students.<br>Travel Team: students chosen by mentors and Coaches through an application. They go to all out-of-state events and our local event. |

## src/lib/season-admin-copy.ts

| Before | After |
| --- | --- |
| Prepare the next season and review each student before any transition. | Set up next season. Check each student before you switch seasons. |
| Attendance totals start at kickoff. | Attendance totals start at kickoff, when the FIRST build season begins. |

## src/lib/setup-wizard-copy.ts

| Before | After |
| --- | --- |
| Added | Shirt size<br>The Travel Team is chosen by mentors and Coaches through an application. Travel Team students go to all out-of-state events and our local event. |

## src/lib/ui-copy.ts

| Before | After |
| --- | --- |
| No requirements apply to this participation.<br>Participants | No requirements for this event.<br>Signups |
