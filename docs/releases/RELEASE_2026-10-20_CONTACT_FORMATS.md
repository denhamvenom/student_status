# Contact input production release — October 20, 2026

Owner authorized production publication of reviewed source fdabbe3. Phone/email input formatting and backend validation apply across live entry forms, setup, invitations, driver details, paper signer emails and payment CSV matching. Phones accept US ten-digit or leading1 input and format as (555) 123-4567; emails trim/lowercase and validate structure. Optional blanks and unchanged legacy contacts retain existing behavior. No bulk rewrite or signed snapshot/OAuth alteration.

Production Convex amicable-eel-413 deployment succeeded with typecheck/schema validation and no index deletion. 84 focused backend/helper tests covered, two frontend CSV tests passed, independent review and desktop/phone actual input/wizard checks passed. Integrated lint/types/build passed. No real profile submissions, invitations or emails sent during release. The historical unrelated501-charge fee-test timeout remains separate.

Source and documentation are released together. Exact merged revision and Student Status/Timeclock build results are recorded in the release PR and release notes. Rollback code does not undo any contacts saved after release; preserve stored values and signed evidence.
