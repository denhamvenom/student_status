# Historical Timeclock import

The owner requested importing a legacy clock CSV into existing Timeclock attendance. Source records and derived per-student previews remain in ignored local files. No production record is embedded in application code, tests, Git history or release notes.

## Approved interpretation

Match first or preferred name plus last initial to the current roster; ambiguous matches stop the import, while unmatched names can be excluded. For Team Meetings, use the existing calendar start and the final valid OUT on that date, counting continuously through any break. Ignore earlier OUT entries that would precede the meeting start. Use the full scheduled window for the two owner-identified outreach activities. Interpret local times in America/Chicago. Reuse the existing calendar occurrence rather than inventing or duplicating an event.

## Import design

A bounded internal mutation derives and checks the Coach identity, validates the reviewed calendar revision and schedule, current season, student membership, dates and all intervals. It checks existing operational/legacy attendance and cross-session overlap before writing. Each occurrence imports atomically as a closed historical session. The source SHA-256, reviewed payload, reason and actor are retained in a dedicated audit table. Exact replay is a no-op; changed payload or an existing unrelated session fails rather than overwriting attendance.

A session-level optional outreach override preserves the existing calendar title while explicitly classifying imported outreach. Existing sessions continue to use title-based classification. The normal report rebuild and aggregate paths process imported intervals. Late meeting clock-outs extend the historical effective end without changing the original scheduled end.

## Verification and execution

Before posting, run synthetic authorization, invalid-input, rollback, duplicate/replay, overlap, outreach classification and report rebuild tests; review the shared report changes. Deploy the reviewed backend, run the private payload with dryRun, and apply one occurrence per transaction. Check every imported interval and finalized summary against the approved private preview, then repeat the requests and verify no new records are created.

Implementation and independent review are complete with no blocking findings. New import regressions passed 3/3, existing attendance maintenance 11/11 and existing dashboard reports 9/9. Source lint passed. A combined test attempt hit the known Windows temporary-module ENOENT environment issue; single-worker file runs passed without weakened tests. Production preview, posting and report verification remain pending.
