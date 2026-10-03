# Client portal — phase D portion (#5)

Stacked on files/claims PR #15 at `8288946`. That predecessor's reference and target CI passed in [run 37081418535](https://github.com/so7ob/web/actions/runs/37081418535). The nine account screens are ported from Website `5321b7fd11db421c83290b262f276811e5f04e5f`, retaining their actual React markup, CSS, translations, dialogs, focus controls and browser behaviors. Imports of Next navigation/link/auth helpers are replaced by the already tested React Router and server-session adapters. No simplified replacement portal or fixed product data is introduced.

| Screen | Behavior |
| --- | --- |
| `/[locale]/account` | Scoped indicators, recent requests, filtered deep links and empty state |
| `/account/requests` | Search/status/awaiting filters, pagination, claim dialog/outcome banners |
| `/account/requests/new` | Original project form; account-scoped restore/autosave/clear and real submission |
| `/account/requests/:id` | Conversation, attachments/downloads, status/history, cancellation and print view |
| `/account/inquiries` | Search/status/pagination and new inquiry dialog |
| `/account/inquiries/:id` | Conversation, replies, attachments, status and print view |
| `/account/notifications` | Pagination, read-one/read-all and linked navigation |
| `/account/profile` | Validated profile update and saved language navigation |
| `/account/security` | Password change, active devices and session revocation |

Paths in the table retain their `ar` or `en` prefix. Page titles use the source translations. Public header/footer, the desktop sidebar/mobile drawer, unverified-email banner, unread polling, toast notifications and draft-clearing behavior remain intact. Each screen loads its own module; opening the dashboard does not import every form and conversation implementation.

## Server rendering and data boundaries

The Nest rendering service resolves recognized account routes only after validating the current opaque server session. Unauthenticated requests retain the original 307 destination `/[locale]/auth/login?next=/[locale]/account`; it does not silently replace that source destination with a different deep link. Client navigation uses the same authorized view service and `no-store` responses. Account detail screens preserve the original client fetch and error presentation, backed by the previously tested server ownership checks. Their SSR shells contain no conversation or attachment data from another record.

Dashboard/profile SSR payloads use browser-safe contracts, not database entities. Password hashes, session fingerprints, roles' permission storage, internal notes and unrestricted database rows are never serialized. Dashboard SQL aggregates reproduce the source owner/assigned-staff scope, archived totals, open-status sets and awaiting-reply definition (which also includes an unarchived closed request if its last staff reply is newer). Recent rows retain the source order and five-record limit. Relative time labels on this server-rendered dashboard are formatted on the server as in the source, so its initial browser bundle does not load the conversation screens’ date-formatting library. Four actual MariaDB statements serve empty and populated accounts; no per-record query loop is used. Profile SSR includes only its form fields and verified state.

The server draft contract intentionally excludes email, as the pinned source whitelist does. Name, request fields and permitted optional fields are restored; email must be entered after reload. This is recorded rather than silently changing the contract. The source three-second autosave and successful-submission draft deletion are retained. The already documented oversized-JSON rejection protects the prior draft.

The active-device API now distinguishes operational sessions with an explicit `opaque-v1:` fingerprint prefix and respects the account's revocation cutoff. Imported legacy session rows remain unmodified historical data and are not presented as usable devices. Earlier unmerged development snapshots used an untagged fingerprint; those synthetic sessions require re-login after this change. This implements the accepted one-time login boundary without extending expiry, reviving a revoked session or deleting historical records. A real database test verifies that the old unrevoked row is retained while only the fresh session is listed.

## Frozen visual baseline and inherited defects

Before porting this portion, 36 source captures covered all nine screens, both languages and 375/1280 widths at height 900, with reduced motion and local requests only. Their actual HTML/status/console/request/axe observations are preserved. The target uses an independently imported synthetic MariaDB fixture. The comparison requires <=0.5% exact RGB differing pixels, equal dimensions/status, no runtime/request failures and no additional axe rule, affected-node count or normalized selector.

Live session content differs at the accepted re-login boundary. The source stores no User-Agent for fresh sessions and continues to display its older active-session rows. The target records device metadata and excludes historical/cutoff-invalid sessions; fewer rows naturally change the page height and footer position. Original failing live comparisons and screenshots are retained rather than changing the product or claiming those differing records are equal.

For the security screen's **visual-only** equal-input comparison, the capture tool supplies session display metadata from read-only source rows bounded by each frozen screenshot's timestamp and fixes the browser date to that timestamp. The current marker follows the most recent source row; last-seen values are capped just before capture when needed. This fixture has no cookies, raw tokens or fingerprints and is intercepted only in the visual capture tool's GET `/api/auth/sessions`. Other screen/data requests remain real. There are no screenshot masks and the original pixel threshold is unchanged. All operational security journeys, revocation/cutoff/history assertions, and CI browser tests use the real server and MariaDB; they do not import this visual fixture. This comparison establishes equal-input layout, not equality of old and new usable sessions.

The live journey also exposed Sonner 2.0.7’s inherited light success-toast contrast (4.29:1). A scoped CSS variable override preserves the green hue/background and raises text contrast to 5.57:1, leaving the dark palette unchanged. Client-authored message timestamps also inherited an 80% text opacity that reduced contrast on the pale-blue bubble; they now use the existing full-opacity muted foreground. The journey waits for the toast entrance to reach opacity 1 and pauses dismissal by hovering and waits for all toast-stack expansion transitions before axe measures its visible text; no contrast assertion is disabled.

Inherited static-screen axe findings remain explicit: request/inquiry tabs have `aria-valid-attr-value` findings; the new-request form has `color-contrast` findings in the original secondary helper/optional labels. They are present in the frozen source observations and are not new target findings. The rest of this captured screen set has no reported axe violations. This scoped result is not an assertion that all Website accessibility defects are fixed.

## Browser and database evidence

Real Chromium journeys in Arabic/English at desktop/mobile sizes exercise protected redirects, SSR/reload, keyboard-operated mobile drawer focus, server draft restore, a persisted request, reply, actual PDF upload/download, awaiting filter, inquiry creation/reply, original-contact claim proof, notifications, profile save, password mismatch/change and current-session revocation. Each journey runs axe against the frozen source rule/node-count/normalized-selector baseline and records console and non-navigation network failures. A separate browser case saves the profile language in both directions and checks the URL, document direction, stored selection and reload. Existing public/auth/submission/files browser cases remain enabled. Tests use a unique synthetic account per journey; the shared loopback network quota is isolated between scenarios, while dedicated negative tests retain the real rate thresholds.

The final local run passes 137 unit/integration tests and all 32 browser cases. All 36 visual cases pass, with maximum exact differing-pixel fraction 0.000174479 (0.01745%).

Database cases cover dashboard counts and scope, recent ordering, safe profile projection and constant actual SQL counts on MariaDB 10.11.18. Evidence and repeated latency/JavaScript comparisons are stored under `evidence/client-portal/`; measurements are distinct from successful builds. The visual comparison covers the first 900 pixels of each screen, not a full-page or all-state claim; interactions cover controls below that viewport.

## Repeated performance comparison

Five alternating rounds of 50 warm requests per runtime covered all nine account screens and three read APIs. Source uses loopback HTTP and target uses loopback HTTPS on the same host, with independent synthetic copies; the extra target TLS hop is included. Cold browser contexts with the same session state capture actual initial script bodies, compressed consistently with gzip level 6. All p50/p95 and initial-JavaScript budgets pass after the dashboard adjustment. The first dashboard script measurement exceeded the 5% budget (187,952 versus 171,944 bytes); that failing report is retained. Moving its original server-side relative-date formatting back to the server reduces target dashboard scripts to 179,666 bytes (about 4.5% above reference). Other portal screens remain within the same frozen 5% bound. These are local workload results, not a production capacity or all-admin/editor performance claim.

## Remaining migration scope

Admin screens/services, user/role/invitation management and the last-active-admin invariant, CMS/editor workflows, full final workload acceptance and complete operational restore/cutover rehearsal remain open. Original source files at the repository root remain transitional reference material. No production data or attachments were supplied or transferred. All reference/runtime fixtures are independent synthetic copies; Website and Rakim remain unchanged. The open stacked PRs are not merged or deployed. Full rollback remains limited to the paused-write window; after reopening, retain new database/files/queues and recover forward.

The first remote target run (37086111373) passed 31/32 browser cases but caught a background toast during hover expansion. The test now waits for the whole stack’s finite transitions; no rule, selector allowance or color threshold changed.

A second remote run (37086857673) reproduced the same stacked-notification contrast finding despite waiting for transitions. Browser acceptance now explicitly uses the correctly scoped reduced-motion context option, waits for dismissed nodes to leave and requires every visible toast/content to have full opacity. Failure output includes the actual axe contrast details and CI retains synthetic browser traces for diagnosis; no violation is exempted.

Reproduction with complete diagnostics identified the second failure as a distinct inherited **info** toast (`Your previous draft was restored`), at 4.35:1 (`#0973dc` on `#f0f8ff`), not an animation-only defect. Its scoped light-theme text changes to HSL(210 92% 38%), giving about 5.71:1 while retaining its hue/background. The stricter visibility checks remain, and the same axe rule now validates both notifications together.
