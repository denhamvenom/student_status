# Batch 2 exact copy changes

Compared with Batch 1 checkpoint `41fb348`. Tables list removed and added source text in order. Templates retain live values. Code identifiers, CSS class names and routing expressions are not copy; additions inside Home select the approved text without changing destinations. Payment receipts keep their existing name.

## convex/financeOperations.ts

| Before | After |
| --- | --- |
| Method reference | Check or receipt number |

## convex/fundraisers.ts

| Before | After |
| --- | --- |
| Original fundraiser credit was spent or transferred. Balances remain unchanged; a Coach must resolve this hold. | This student's travel credit was already spent or moved, so it can't be lowered yet. Balances have not changed. A Coach must sort it out. |

## convex/lib/permissionSigningMode.ts

| Before | After |
| --- | --- |
| Permission signing is closed for this deployment. | You cannot sign for this student right now. |

## convex/permissions.ts

| Before | After |
| --- | --- |
| Permission signing is closed for this deployment or account. | You cannot sign for this student right now. |
| Receipt not found. | Signed form not found. |
| Used draft receipt is unavailable. | The signed form from this draft is unavailable. |
| Separate health-review permission is required for PDF receipts. | The Health export permission is required to review signed form PDFs. |
| This receipt no longer controls an actionable event or a new signature was requested. | This signed form no longer covers an event that can be reviewed, or a new signature was requested. |

## convex/permissionsV2.ts

| Before | After |
| --- | --- |
| Receipt not found. | Signed form not found. |
| PDF receipt not found. | Signed form PDF not found. |

## src/ChargeAdministration.tsx

| Before | After |
| --- | --- |
| Original obligation for this command | Charge amount before this correction |
| Requested target obligation | New charge amount requested |
| The correction is committed. Automatic allocation may still be processing. | The new charge amount is saved. Money may still be applied to other charges. |
| Reviewed current obligation | Current charge amount reviewed |
| Target obligation | New charge amount |
| Target outstanding amount | Amount still due after correction |
| The preview is not ready, or the charge or financial revision changed. Review again before posting. | The charge or account changed, or this review is no longer ready. Review the amounts again before saving. |
| These source records preserve the origin of funds applied to this charge. Source availability is the remaining amount in that source across the account. | These records show where the money used on this charge came from. Available money in each record can also be used elsewhere on the account. |
| The transferred source retains its original funding origin. | Transferred money keeps a record of where it originally came from. |
| Source evidence is unavailable while financial records are being prepared. | Money source details will appear when account records are ready. |
| · Committed | · Saved |
| Previous effective obligation | Previous charge amount |
| Updated effective obligation | New charge amount |
| Released to original sources | Returned to available funds |

## src/ConsentProfileV2Form.tsx

| Before | After |
| --- | --- |
| Fill this in before you sign the permission form. If you change these details after preparing a form, prepare and review a new PDF before signing. Existing signed receipts keep their original information. | Fill this in before you sign the permission form. If you change anything after preparing a form, prepare a new PDF and check it before you sign. Forms already signed keep their old information. |

## src/FirstRegistration.tsx

| Before | After |
| --- | --- |
| Check both in FIRST, then verify. | Look up both in FIRST. Then check both boxes and press Verify. |

## src/Fundraising.tsx

| Before | After |
| --- | --- |
| Some amounts held for Coach review | Some amounts need Coach review |
| Posting stopped; Coach review needed | Posting stopped; a Coach needs to review it |
| Some amounts held for Coach review | Some amounts need Coach review |
| Posting stopped; Coach review needed | Posting stopped; a Coach needs to review it |
| Held for Coach review | Needs Coach review |
| Posting failed | Posting stopped |
| Held for Coach review | Needs Coach review |
| Posting failed | Posting stopped |
| All edited rows must be ready before posting. Resolve held rows or discard and review a smaller set. | All edited rows must be ready before posting. Resolve rows on hold or discard and review a smaller set. |
| Planned target amounts. This change is not yet included in recorded fundraiser totals. | Planned amounts. Fundraiser totals do not include this change yet. |
| recorded · | saved · |
| held | need review |
| recorded · | saved · |
| held · | need review · |
| processed in this pass. | checked in this pass. |
| Immutable gross amount | Original reviewed amount raised |
| Only rows you have reviewed are retried. Other held rows stay on hold. | Only rows you have reviewed are retried. Other rows needing review stay on hold. |
| Held balances remain unchanged. Review each row’s reason before retrying. | Amounts on hold have not changed. Review each row’s reason before retrying. |

## src/LiveApp.tsx

| Before | After |
| --- | --- |
| Waiting on your parent to complete your FIRST registration. | Your parent still needs to complete your FIRST registration. |
| Finish setup (health task) | Finish health profile |
| Finish setup (FIRST task) | Finish FIRST registration |
| Your parent fills this in. | Your parent adds this. You cannot see it here. |
| No explanation under the FIRST task heading | FIRST's yearly form that a parent signs on the FIRST website. |

The parent-facing Coach waiting sentence stays unchanged after the already-approved Batch 1 “Nothing for you to do right now.” line. Non-FIRST setup buttons and every link destination remain unchanged.

## src/SetupWizard.tsx

The FIRST step now displays the shared explanation: “FIRST's yearly form that a parent signs on the FIRST website.” No step or completion behavior changes.
## src/PermissionWorkflow.tsx

| Before | After |
| --- | --- |
| The original one-page form layout and wording, including minor first aid, are the Coach-approved template. | This is the Coach-approved field trip form. It keeps the original one-page layout and wording, including minor first aid. |
| Selected for future PDF preparation. | New forms will use this form. |
| Approved form selected for new PDFs. Existing receipts keep their original layout and wording. | Approved form selected for new PDFs. Existing signed forms keep their original layout and wording. |

## src/SeasonReviewSteps.tsx

| Before | After |
| --- | --- |
| Departing funds are normally nonrefundable. Special family requests, Coach approval and actual personal payouts are handled separately in Finance. Archiving never moves money. | Money left by students who leave is usually not refunded. Family requests, Coach approval and real refunds are handled on the Money page. Archiving never moves money. |
| . Every active student requires a roster decision, an account / profile review, and explicit dispositions for each unpaid charge and available source. Missing or changed decisions stop the transition and link back through its error. | . Each active student needs a stay-or-leave choice and an account and profile check. Every unpaid charge and all leftover money (personal payments and fundraising credit) also need a choice. If a choice is missing or changed, the switch stops and shows where to fix it. |

## src/SecurePermissionPdf.tsx

| Before | After |
| --- | --- |
| Signed PDF receipt | Signed form PDF |

## src/features/operations/FinanceOperations.tsx

| Before | After |
| --- | --- |
| Transfer submitted. Committed amounts and remaining work are shown below while processing continues. | Transfer started. See below for money already moved and work still processing. |
| Financial processing stopped. A Coach must review and retry the remaining work. | Money processing stopped. A Coach must review and retry the remaining work. |
| Financial processing is updating. These are committed balances; this account is not ready for another operation. | Money records are updating. These amounts are already saved, but this account is not ready for another change. |
| Committed source releases | Money already returned to available funds: |
| The target obligation has not committed; the original obligation remains recorded until release processing finishes. | The new charge amount is not saved yet. The old amount stays on record until the extra money has been returned. |
| Committed | Amount already saved: |
| Remaining amounts have not been committed. | The rest is still waiting to finish. |

## src/lib/account-copy.ts

| Before | After |
| --- | --- |
| Financial editing and health exports are separate permissions for Travel Leads. | These are extra permissions for Travel Leads. Financial editing lets them record and correct money (payments, charges, refunds). Health export lets them download health records and signed form copies. |

## src/lib/charge-administration-copy.ts

| Before | After |
| --- | --- |
| Cancel charge obligation | Cancel charge amount |
| Cancelled obligation | Cancelled charge amount |
| Enter the resulting obligation, not the amount of the adjustment. Original charge records are preserved. | Enter the new total charge amount, not the amount of the change. The original charge stays on record. |
| Required source release | Money to return to available funds |
| A correction changes the recorded obligation. It does not send a refund or move cash. | A correction changes the recorded charge amount. It does not send a refund or move cash. |
| Planned target. The corrected obligation commits only after all required source releases finish. | Planned amount. The new charge amount is saved only after the extra money already used on it is moved back. |
| Committed source-release progress | Money already returned to available funds |
| Charge revision history | Charge correction history |
| No charge revisions have been recorded. | No charge corrections have been recorded. |
| Older revisions | Older corrections |
| Processing needs Coach review. Already committed source releases remain recorded. | Processing stopped. Money already returned to available funds remains recorded. Review and retry the remaining work. |

## src/lib/fee-administration-copy.ts

| Before | After |
| --- | --- |
| Some earlier charges are not yet matched to a shared fee. Match them before confirming the full season payment order. | Some earlier charges are not matched to a shared fee yet. Match them before you confirm the payment order. |
| Match older charges to the fee they belong to. Names or amounts alone aren't enough; anything unmatched waits for a Coach. | Match earlier charges to their shared fee. A matching name or amount alone is not enough. Anything not matched waits for a Coach. |
| Preparation records the proposed scope for review and changes no money. Review every prepared row before committing charges. | Review which students and charges this change will affect. No amounts change until you confirm. |
| The prepared scope contains the definition’s existing charges. Its exact rows are captured for a separate review before monetary changes. | This review includes the charges already connected to this shared fee. Check each row before changing amounts. |
| The proposed effective obligation is $0.00. Applied source funds are released through audited processing. | The new charge amount will be $0.00. Money already used on these charges will return to available funds as processing finishes. |
| Original prepared scope | Students in the original review |
| Reviewed immutable rows | Students and charges reviewed |
| Scope rows | Rows in this review |
| Preparing exact scope… | Finding the students and charges… |
| Planned obligation per row | Planned charge amount for each student |
| Committed rows | Rows saved |
| Held rows | Rows needing review |
| Prepared effective obligation | Charge amount when reviewed |
| Prepared applied amount | Money used on charge when reviewed |
| Original financial revision | Original account version |
| Original charge revision | Original charge version |
| Current effective obligation | Current charge amount |
| Current applied amount | Money currently used on charge |
| Source release required | Money to return to available funds |
| The original target and scope stay fixed. Select up to 20 held rows to retry using the displayed current financial revisions. Finish any failed money child before resuming its parent operation. | The amount and the students stay the same. Pick up to 20 rows on hold to try again. Finish any failed student step first, then resume the whole job. |
| Committed source release | Money already returned to available funds |
| Retry remaining student source processing | Retry remaining student money change |
| Resume this student’s existing source operation before retrying the shared fee operation. Its frozen target and already committed work are preserved. | Finish this student’s money change before retrying the shared fee job. The planned amount and money already moved stay the same. |
| Load all rows and finish any unfinished student source processing before resuming the shared operation. | Load all rows and finish each unfinished student money change before resuming the shared fee job. |
| Student source processing in progress | Student money change in progress |
| Student source processing failed | Student money change stopped |
| Student source processing complete | Student money change complete |
| Reviewed current financial revision | Current account version reviewed |
| Selected retry evidence changed. Deselect the changed rows and review their current revisions again. | One or more selected rows changed. Remove those rows from the retry and review their current amounts again. |
| Active members captured at preparation | Active students included when reviewed |
| Reviewed selected students | Selected students reviewed |
| Confirmed participants captured at preparation | Confirmed participants included when reviewed |
| Charges captured at preparation | Charges included when reviewed |
| Waiting for current financial operations to finish. | Waiting for current money changes to finish. |
| Preparing the immutable scope. No money has changed. | Finding the students and charges. No money has changed. |
| Exact scope prepared. No money has changed; confirmation is still required. | Ready for your final review. No money has changed yet. |
| Applying reviewed rows. Only committed rows are final. | Saving the reviewed rows. Only rows marked saved are final. |
| This pass finished with held rows. The definition remains blocked until Coach resolution. | This pass finished with rows needing review. A Coach must resolve them before this shared fee can be changed again. |
| Processing failed. Committed work remains recorded and unfinished financial work stays locked. | Processing stopped. Saved rows remain recorded. A Coach must review unfinished money changes before retrying. |
| Every reviewed row has finished and the operation is complete. | Every reviewed row is saved and this job is complete. |
| The untouched prepared operation was cancelled. Its evidence remains recorded. | The prepared job was cancelled before any amounts changed. Its review remains on record. |
| The uncommitted held targets were superseded by a completed, reviewed full cancellation. Their original scope remains recorded. | The earlier rows on hold were resolved by a completed, reviewed cancellation. Their original review remains on record. |
| Earlier uncommitted held targets | Earlier planned amounts still on hold |
| Full cancellation also proposes to resolve these earlier held targets. Review the original rows before preparing this replacement. | Cancelling the full charge may also resolve these earlier rows on hold. Review the original rows before preparing this cancellation. |
| Review these held targets for full cancellation | Review earlier rows on hold for full cancellation |
| Earlier held targets proposed for superseding | Earlier rows on hold this cancellation may resolve |
| Earlier held targets superseded after final cancellation | Earlier rows on hold resolved by completed cancellation |
| The earlier targets remain unresolved until all linked current charges finish cancellation. Cancelling an untouched prepared replacement preserves the earlier held operation. | The earlier rows stay on hold until every linked charge is fully cancelled. Cancelling this prepared job leaves the earlier work in place. |
| Source processing in progress | Student money change in progress |
| Committed row | Saved row |
| Held for Coach review | Needs Coach review |
| Superseded by a reviewed replacement | Resolved by a reviewed replacement |
| This records charge obligations and source changes. It does not move cash or make a payment. | This changes recorded charges and the money used on them. It does not move cash or make a payment. |
| Shared fee processing needs Coach review. Already committed work remains recorded. | Shared fee processing stopped. A Coach must review it. Rows already saved remain recorded. |
| Committed | Saved |
| Planned changes remain separate from committed charges until processing finishes. | Planned changes are not saved charges until processing finishes. |
| This processing pass finished with held rows. The shared fee remains blocked until those rows are resolved. | This pass finished with rows needing review. The shared fee stays on hold until those rows are resolved. |
| Effective obligation | Current charge amount |
| Charge revision | Charge version |

## src/lib/finance-admin-copy.ts

| Before | After |
| --- | --- |
| In progress. Only amounts shown as committed are final. | Still processing. This amount may still change. |

## src/lib/fundraising-copy.ts

| Before | After |
| --- | --- |
| The allocation is fixed after awards have been recorded. | The split can't change after amounts are posted. |
| The original travel credit has been spent or transferred. This reduction is on hold for Coach resolution; balances remain unchanged. | This student's travel credit was already spent or moved, so it can't be lowered yet. Balances have not changed. A Coach must sort it out. |
| Recorded original-credit reversals: | Travel credit already taken back: |
| Source reversal progress is separate from the target gross/team/travel totals, which commit only when the entire row finishes. | The fundraiser totals (raised, team, travel) change only after the whole row is done. |
| Review this held row | Review this row on hold |

## src/lib/operations-copy.ts

| Before | After |
| --- | --- |
| Passenger seats exclude the driver. Only active, approved drivers count toward event capacity. | Passenger seats do not count the driver. Only seats from active, approved drivers count for events. |
| Unavailable | Not approved or inactive |
| Classify event charges as the main event/travel fee or an extra, such as lunch. Outstanding credits will apply by priority. | Choose if this is the main event or travel fee, or an extra like lunch. Money the student already has pays charges in Priority order. |
| Standalone charge | Not for an event |
| Correction or fifth-occupant reason | Reason (for a fix or a 5th student) |
| Authorize a fifth occupant | Allow a 5th student |
|  A fifth occupant requires authorization and a note; six are never allowed. |  A 5th student in a room needs your OK and a note. A room can never have 6. |
| Students may choose roommates until the room deadline. | Students can pick roommates until the room deadline. |
|  · requested assignment |  · asked to be assigned |
| Team transfer submitted. Remaining source amounts are not committed until processing finishes. | Team transfer submitted. The remaining amount is not final until processing finishes. |
| Other external method | Other |
| Method reference | Check or receipt number |
| Enter the date and method reference. | Enter the date and check or receipt number. |
| `Return to student account: ${returned} · retain paid: ${retained}. Unpaid extras ${unpaidExtras} will be canceled. Returned funds automatically apply to other outstanding charges by priority; any remainder stays available in its original payment or fundraising source. This is not a cash or check payout.` | `Back to student account: ${returned}. Team keeps (not refunded): ${retained}. Unpaid extras (${unpaidExtras}) will be canceled. Money put back pays the student's other charges first, in fee order. Anything left stays on the account as the same kind of money (personal payment or fundraising credit). This is not a cash or check refund.` |

## src/lib/payment-admin-copy.ts

| Before | After |
| --- | --- |
| Record personal payments received offline. If an import stops partway, retry with the same batch name so rows aren't recorded twice. | Record personal payments that families made outside this app (cash, check or other). If an import stops partway, retry with the same batch name so no row is saved twice. |
| Recorded rows remain committed. Finish pending financial work, then retry remaining rows. | Rows already recorded stay saved. Finish any unfinished money changes, then retry the remaining rows with the same batch name. |
| Preserve the original receipt and record a reasoned correction. Reductions may restore unpaid charges. Actual refunds use the separate payout workflow. | The original payment stays on record. Enter the right amount and a reason. Lowering a payment can make a charge unpaid again. To record a refund, use Money returned. |

## src/lib/permission-workflow-copy.ts

| Before | After |
| --- | --- |
| Review submitted evidence and current event coverage. Signed receipts retain their original information. | Check signed forms and the events they cover now. What a parent signed is saved and does not change. |
| Signing is unavailable for this student or deployment. | You cannot sign for this student right now. |
| Current event coverage | Permission status by event |
| Other eligible events outside this receipt | Other eligible events outside this signed form |
| View receipt | View signed form |
| Receipt | Signed form |
| Receipt history | Signed form history |
| Current-season receipt history | Signed forms this season |
| No permission receipts yet. | No signed permission forms yet. |
| No permission receipts for this student in the current season. Prior-season records are retained, but are not available through Parent access. Contact a Coach for assistance. | No signed forms for this student this season. Older forms are kept but you cannot see them here. Ask a Coach for help. |
| This receipt is unavailable. | This signed form is unavailable. |
| This legacy record has no sealed signing snapshot and does not establish current permission coverage. | This older record has no saved signing details and does not show current permission. |
| This receipt preserves the wording, event scope, contact and health information supplied at signing. Later profile edits do not change it. | This signed form keeps the wording, events, contact and health information supplied at signing. Later profile edits do not change it. |
| This form does not currently cover an event. | This form does not cover any event now. |
| This receipt cannot currently be accepted. Review its current coverage or prepare the requested new signature. | This signed form cannot be accepted right now. Check the events it covers or prepare the requested new signature. |
| Include permission snapshots and health records | Include signed form copies and health records |
| Download an event permission list as a JSON file. Health details and complete signed records require a separate export grant. | Download a list of permission forms for one event (JSON file). Signed form copies and health details need the Health export permission. |
| Use a new version name. The saved body cannot be edited. The new version applies to future preparation; existing signed receipts keep their original wording. | Use a new version name. The saved body cannot be edited. The new version applies to future preparation; existing signed forms keep their original wording. |

## src/lib/setup-wizard-copy.ts

| Before | After |
| --- | --- |
| — | FIRST's yearly form that a parent signs on the FIRST website. |
