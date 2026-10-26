# Automatic event archive release — October 23, 2026

Release: v0.1.0-onboarding.18. Owner explicitly authorized production deployment. PR38 reviewed head: 68f8ad9056ec1889f1f4ea28f83fd55f7b90eab3. Merged at 51ca4d5c5df403911383fd60648dce4e2655ad40 on October 23 at 8:17:34 PM Central.

Events automatically archive at their end time. A bounded one-minute catch-up handles existing past events. Archived events and their remaining requirements disappear from Student/Parent views; old event and permission-receipt links are denied. Coaches and Travel Leads have a read-only Archived events section covering previous seasons, recorded requirements and paginated participants. Charges, payments, balances, attendance and stored permission evidence remain recorded. Outstanding money remains visible in Money.

## Validation and rollout

- Source matched the reviewed head and merged main. Reused 657/657 passing tests, lint, both apps' type/build checks and synthetic phone/desktop light/dark browser checks. No real-account production walkthrough is claimed.
- Rebuilt Student Status against https://amicable-eel-413.convex.cloud. Production Convex deployment completed schema validation and added events.by_archived_and_endsAt and events.by_seasonId_and_archived_and_endsAt. Production metadata confirms eventArchive:page/detail public queries and atEnd/sweep internal mutations. The deployed cron invokes the bounded sweep every minute.
- Backend deployed before merge. Frontend packaging dry-run passed. While the automatic frontend build ran, published the identical approved production build with configured variables preserved.
- Student Status Worker version 61870361-9c39-4343-b1e6-a7d466701057, deployment f64bd2e0-5f7f-4f5c-b717-64ed0c58b08e, at 100% traffic.
- https://students.team8044.org returned HTTP 200. Served HTML matches the build after removing only Cloudflare's injected analytics script. All five JavaScript/CSS files match the local production build byte-for-byte; the app bundle contains the archive feature and the entry uses the production backend.
- Entry index-hp_hGxw_.js SHA-256 d7ddafc011ffa9e324adfa3651f8bffa72a542c69a7788b7fab1a857f3b7c4d9.
- Deferred app LiveApp-C-C7mtHo.js SHA-256 910897b6afc3e9e7b90e70159de995d71c49ef3e03da5302337c8a442149fb5e.
- Automatic Timeclock rollout: version a3d1cbaf-49a9-4cb4-9749-a375c425c0a9, deployment 91f0eb7e-ffe1-4fca-952a-0861b226d3a8, at 100% traffic.

## Rollback limits

Previous Student Status Worker: de7b817c-5ab8-4239-a16c-5108beaa8f28. Previous main: 9136197ab273305335940962fee0a105a168b8e1. A frontend rollback restores that version but does not reverse backend archival. The sweep only changes the existing archived flag; no financial or historical records are deleted. Reverting backend scheduling does not unarchive events already processed. Do not bulk clear archived flags, because older manually archived records cannot be distinguished by this flag alone. Keep the additive indexes if reverting code requires them for schema compatibility. Financial corrections and account changes are outside this release.

Final automatic rollout: Student Status version c086729f-2046-4e6f-a480-0a4971724ec7, deployment d03fb121-fd07-4e4d-adf3-a1a9926ebde0, superseded the direct deployment at 100% traffic. Public verification after that rollout again matched all five application files exactly.
