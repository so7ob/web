# Public SSR and authentication screens — phase D portion (#5)

Stacked on server authentication PR #12 (`8a0d972`); all PRs still target develop and none has been merged. This portion preserves the published public presentation and ports the existing authentication forms. It does **not** complete phase D or Website parity: private account/admin screens, the editor, most business APIs and public form submission are still pending.

## Implementation

The original bilingual auth cards/forms/translations/styles now use React Router and the Nest session endpoints. Login, registration, forgot/reset, verification, invitation and logout screens are dynamically server-rendered. CMS and auth screen chunks are independently loaded; the initial login document no longer loads all CMS blocks. Server-rendered markup is retained during hydration. Direct reloads, SPA title/metadata updates and the original branded 404 presentation preserve their HTTP status.

The public DTO contains published blocks and explicit public settings only. Page access is checked on the server, including role-restricted pages. An anonymous visitor is redirected to login with the original return path; an unauthorized account gets 404. Draft blocks and allowed-role metadata never appear in the browser DTO. Published content and metadata are read on every request, with `Cache-Control: no-store`; updating a publication is visible on the next HTML request.

Canonical, hreflang, Open Graph, Twitter tags, robots and sitemap follow the observed source output; historical SEO captures are in `evidence/public-auth-ui/reference-seo.json`. Favicons preserve the old icon paths. The source's CMS Open Graph overrides omit site_name/type; auth pages inherit them, and do not invent canonical/alternates. Date-only announcement scheduling retains the observed Asia/Aden process timezone. SQL timestamps remain explicitly UTC, independently of process timezone (migration 4).

## Limited security corrections

- The source login return-path heuristic accepts `/\\external.example`, which a browser can normalize as an external authority. The target rejects backslashes, controls and external origins while preserving internal deep links, queries and fragments; negative unit cases cover this.
- Reset/invite token pages explicitly use `noindex, nofollow`; the source inherited index/follow there. The 404 has one unambiguous noindex tag instead of conflicting inherited robots tags. No token expiry or acceptance rule is relaxed.

## Test setup and acceptance evidence

`npm run test:e2e` runs Playwright against a compiled production Nest/Vite build and actual MariaDB. It requires a named `so7ob_*_test` database and loopback origin. A test-only HTTPS proxy creates a one-day local certificate so both the browser and Playwright's HTTP client exercise Secure/__Host- cookies without weakening production policy. The proxy is not a production service. Fixture accounts, tokens and encrypted mail are synthetic; no external mail is sent. Setup inserts missing synthetic public fixture content without replacing existing rows; teardown removes only records owned by the test run.

The 16 browser cases cover both languages and 375/1280 widths, direct reload/RTL/LTR, auth navigation and titles, incorrect credentials, real sessions/logout and draft cleanup, registration plus encrypted queued verification and replay rejection, keyboard-driven recovery, password-confirmation errors/reset/replay, actual 404 and SEO, immediate publication, legacy page redirects and restricted-page access/DTO filtering. Recovery links retain the account's stored language, independently of the language of the requesting screen. The original reference registration axe results were captured first: zero WCAG 2 A/AA violations in all four language/width cases; target assertions require the same. This is not yet a complete keyboard/axe audit of every Website screen.

`tools/migration/compare-public-visuals.mjs` compares 16 fixed original screenshots (home/contact/works/login × Arabic/English × 375/1280; height 900, reduced motion). It uses exact RGB inequality, no masks, and fails dimension changes or differences over the predeclared 0.5%. Existing reference screenshots remain unchanged. `tools/migration/compare-public-performance.mjs` alternates the source/target over five rounds of 50 sequential requests per route on the same host and synthetic public data. Both initial script sets are gzip-compressed at level 6 for comparison. Thresholds remain max(10%,20ms) for p50/p95 and +5% for initial JavaScript. The first run detected excess login JavaScript; the retained before/after reports show the CMS chunk correction. These limited warm, sequential measurements are not load/concurrency tests or evidence for private workflows/query counts.

Axe 4.13.0 currently resolves a newer playwright-core than the pinned Playwright 1.62.1; an explicit compatible override keeps one core version and passes the real browser checks. No type casts or skipped accessibility checks conceal the mismatch.

The evidence directory records the exact outcomes. Logs have trailing whitespace/extra EOF blank lines normalized only. Browser errors and failed network requests are recorded by the visual comparison. Public request/inquiry submissions and private destination pages remain nonfunctional until the corresponding business migration; login tests deliberately use an explicit public return URL and do not claim private portal acceptance.

## Review and rollback

Review incrementally against PR #12. No production service/domain/database was changed. Before any future cutover, the full acceptance matrix must pass. The approved full rollback window ends before reopening writes; after new writes, recover forward and preserve MariaDB, files, queue and sessions. This UI PR adds no schema migration and does not authorize deployment.
