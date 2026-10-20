# Current integration handoff

## Contact entry formatting — development

Based on released main96b38c6 (PR28, v0.1.0-onboarding.9). Mentor/fundraiser release is complete; both production builds succeeded. Release notes record exact evidence.

Current work enforces shared phone/email format and validation across live contact entry forms and backend writes. US phone format (555) 123-4567; email trim/lowercase and structural checks. Optional and unchanged legacy data preserved; no signed snapshot or OAuth rewrite. See CONTACT_INPUT_FORMATS.md.

84 backend/helper and two frontend CSV tests covered, actual input/wizard desktop-phone checks and independent review passed. Development third-bandicoot-18 synced. No production authorization for these changes. Root owns branch feature/parent-email-invitations; other chat holds shared sync pending handoff. Development email remains disabled and Calendar writes production-only. Unrelated historical 501-charge fee-test timeout remains separate.
