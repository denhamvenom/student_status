# Student grade dropdown

## Scope

October20 owner request: replace free-text Grade with Freshman, Sophomore, Junior and Senior, preserving existing entries and converting recognized values. Local/development implementation only; production deployment is not authorized.

Student setup, parent setup and parent health/contact profile must use the same choices. Recognized legacy numeric/ordinal/class-name entries should select the matching class. Ambiguous or unknown values must remain visible as an existing value and can be retained unchanged; never guess from age or graduation year. Conversion occurs in editable views and on the next normal save, not through a bulk rewrite. Signed permission snapshots remain unchanged. Semantically equivalent normalization alone should not invalidate a previously confirmed profile.

## Verification

Implemented in student setup, parent setup and parent health/contact profile. Shared alias conversion covers numeric, ordinal and named grades with case/spacing variants. Unknown saved entries remain selectable as an earlier saved value; server saves permit only canonical/recognized values or an exact existing value. Setup normalization preserves parent confirmation for an equivalent grade; a confirmed profile may retain its original spelling until the next parent confirmation. Signed snapshots are not edited.

Focused helper tests15, setup tests7 and permission profile tests7 passed, as did focused types/lint. Independent Astra review found no blockers. Actual GradeSelect component browser checks passed recognized alias preselection, four choices, unknown preservation/reselection, and no overflow at1440px light/390px dark. This is a component rehearsal with synthetic data, not a real profile save. Full integrated suite552/102 files, lint and application build/typecheck passed; development third-bandicoot-18 synchronization passed with backend typecheck. No production records or real invitations are used for this task.


## Release status
Coach accepted and authorized production publication October 20. Production backend sync succeeded; see releases/RELEASE_2026-10-20_GRADES_ROSTER.md and the release notes for frontend build outcomes. This supersedes the development-only status above.
