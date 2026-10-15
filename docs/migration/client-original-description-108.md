# Original request in the client portal (#108)

The pre-fix browser regression ran against develop `d77418b2378d74e24d6e49df5b6900f2ef344fa2`. It verified the synthetic owner's persisted role was `client`, and confirmed the exact bilingual multiline description in both MariaDB and the owner's successful `/api/account/requests/:id` response. The actual client detail page displayed its reference and conversation but failed to display that stored text. The retained screenshot showed the client account portal, not an administrative or capability-link view. Baseline test commit: `6b69194`.

The client detail page now displays a labelled “Original request” section before the conversation. It renders the existing description as plain React text, preserving authored whitespace, wrapping long words and selecting text direction automatically. An empty or whitespace-only historical description shows a localized statement that no original description was recorded. The section remains present in print.

The implementation only changes the client view and its Arabic/English labels. It adds no message, author, timestamp, API field, storage write or SLA operation. The existing conversation and its live announcements retain their behavior. Request ownership, staff/internal-note filtering, file access and API authorization remain unchanged.

## Validation

- Actual-client baseline: one expected regression failure because visible original text was absent, after successful database/API/role checks; report duration 69043.674ms. SHA256: `f914de8445c4ffe38b008fbb80b10033615ba928d6957fce2b62e61db0fc0b56`.
- Corrected browser matrix: **8/8 passed**, zero skips/unexpected/flaky, 188338.328ms. Report SHA256: `46903d619053a01253ea28ecfb1fa5a2b18e44b1f2c41924892cd465947bb8fd`. The scenarios cover client creation, keyboard follow-up navigation, reload, exact original text, public replies and uploaded/downloaded attachment bytes; they also cover long bilingual/multiline text, literal HTML, empty historical descriptions, print, internal-note exclusion, other-client/anonymous denial, and unchanged messages/workflow/history on read.
- Arabic/English at 375/1280 widths use the existing full accessibility helper and original body deadlines. Synthetic fixtures preserve rate-limit buckets and use their own cleanup deadlines; global synthetic teardown owns prefix-addressed records and queued mail even after a body deadline. No real mail or external webhook is sent.

No schema migration or backfill is needed. Revert the view and label changes to roll back; original request data remains intact. Local browser version and any incomplete or failed checks are reported explicitly rather than treated as passing.

The first expanded test probe was not green (one passed, seven failed): its staff-message fixture used a nonexistent administrative API prefix, and identical creation text for the shared synthetic client correctly triggered duplicate protection. The fixture now uses the existing authorized account-conversation endpoint for staff setup, and each locale/device creation has distinct text. No production route, duplicate protection, permission, timeout or assertion changed. The actual client-creation journey already passed in the first probe; the corrected full matrix retains all its checks.
