# Staff setup wizard release - October 20

Owner reviewed the localhost wizard and authorized production publication of staff setup, including the latest optional-item, driving/trailer and wording changes. Reviewed source: 280bc81. The release includes source, tests and documentation together.

Coaches, Mentors and Travel Leads with missing basic details receive a four-step wizard. All personal answers are optional; skipped values preserve existing data. Finishing suppresses repeat prompts. Skip for now is temporary; Don’t ask me again persists across sessions. Account email is not requested. Driving uses the contact phone, supports vehicle/passenger seats/trailer capability, can be skipped independently and retains existing ownership/approval safeguards. Coach Profile remains available for later editing.

Validation: 17 focused backend tests, independent review, focused lint, application types/build and synthetic desktop/light and phone/dark browser flows passed. The signed-in localhost wizard was observed without saving real profile data. Prior full suite passed561/562; the 501-charge fee-history test exceeded its unchanged30-second limit. That unrelated timing follow-up remains unresolved and is not reported as a clean full-suite pass.

Production backend deployment and website build results are recorded in the release notes and release pull request. No bulk migration, test invitations, real-profile writes or email/environment changes are part of this release. Preserve staff completion/dismissal flags if rolling back code.
