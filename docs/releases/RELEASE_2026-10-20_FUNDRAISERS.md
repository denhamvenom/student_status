# Mentor landing and fundraiser tools release — October 20, 2026

Owner accepted localhost and authorized production publication of reviewed source f075087, including documentation.

Mentors land on Profile with Report retained. Coach Money tools exports current student fundraiser links and reviews CSV imports before applying up to 500 rows atomically. Blank clears and omitted rows remain unchanged. Coach and Travel Lead rosters, team reports and report CSV show Connected/Disconnected. Students and linked parents see Pay Now/Share only with a link; desktop copy and mobile native-share fallback remain available. Pay Now text uses the dark text-on-gold token in both themes.

Production Convex amicable-eel-413 deployment succeeded with backend typecheck and schema validation; no indexes deleted. No bulk migration, real student writes, test invitations, emails or environment changes. Links are not automatically assigned. Code rollback must preserve stored fundraiser URLs/revisions; reverting code does not undo imports.

Evidence: 25 focused CSV/status tests and earlier 11 landing/family-link/share tests passed; independent source reviews, lint/types/build and synthetic desktop/light and phone/dark browser checks passed. Coach accepted localhost. Physical-phone native sharing and real Zeffy checkout remain untested. Previously recorded unrelated 501-charge fee-test timeout remains separate.

Exact main commit and both automatic Cloudflare build outcomes will be recorded in the release PR and immutable release notes after publication. Source, plan, checklist and feature documentation are included in this release.
