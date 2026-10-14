# Issue #107 — customer request list JSON boundary

## Scope and provenance

- Repository: `https://github.com/so7ob/web.git`; branch: `fix/107-client-orders`; PR base: `develop`.
- Latest fetched `develop` at the start: `d09aaf2ac2e045696b280aeb5d4fe60dd0ec2c80`.
- Original manual report used `b3ec4955109bd99fec23136b3569393758ed6435`. Reproduction below uses the newer base, not that historical checkout.
- #107 remained open and the repository had no open PR or existing subsequent fix for it when checked. #98 is the umbrella reference; #94 / merged PR #95 is excluded.
- This PR addresses only #107. It has no stacked dependency. Inquiries' ownership/follow-up behavior in #102, tracking in #116, drafts in #110, and currency policy in #105 are not changed.

## Reproduction before the fix

Node 24.21.0 / npm 10.8.2, MariaDB 10.11.18, existing TypeORM 1.1.1 / mysql2 3.24.3. Fresh migrated databases `so7ob_issue107_unit_test` and `so7ob_issue107_browser_test`; all identities and records synthetic, loopback browser origin, no mail/webhook worker or external delivery.

`requests-workflow.integration.test.ts` measures the exact scalar expression used by the production list query. With the unmodified configured driver, `typeof workflowStage === 'object'`; with the test connection's field-level text cast, it is `'string'`. The normal-driver regression fails before the fix with `SyntaxError: "[object Object]" is not valid JSON` at `RequestService.list`. The text-driver control passes. SQL NULL occurs for old requests without a workflow and legacy workflow instances.

The new Arabic desktop browser journey also fails before the fix: CLIENT submits a request through the actual form, POST succeeds with 201 and persisted owner/version, then GET `/api/account/requests` returns 500 instead of the asserted 200. Server frames match the report: `packages/server/dist/business/requests.js:70:59` and `:66:28`. The test waits for confirmed submission before navigating, and types at human speed so the existing anti-bot minimum-fill protection remains enabled.

Local ignored reproduction evidence: `.migration/issue-107/before-integration.log`, `before-browser.log`, `before-list-500.png`, `before-list-500-trace.zip`. These contain synthetic test evidence only and are not runtime dependencies.

## Root cause and change

The SQL JSON projection may already be decoded by mysql2. `JSON.parse(String(value))` converts that object to `[object Object]`, causing the entire mixed request list to fail. Creation and detail reads are separate paths.

`decodePublicStage` parses strings once, accepts already decoded objects, preserves SQL NULL, validates the three public fields (`nameAr`, `nameEn`, `status`), and projects those fields only. Malformed projections still fail explicitly; the implementation does not suppress an invalid stage by returning null. The request list uses this boundary without changing SQL, query count, pagination, owner/assignee filters, workflow access rules, or persisted data. No migration, data repair, recreation, or configuration change is required.

## Regression coverage

- Unit: text/object/NULL, Arabic and emoji, public-field projection, rejection of malformed JSON and invalid shapes.
- Real MariaDB: default object and field-cast text representations; mixed custom/legacy/no-workflow requests; repeated reads; exact public stage; exclusion of another owner's records and private fields; denied unrelated detail access; unchanged assignment-based staff list behavior; owner access to a restricted stage.
- Browser: real published custom workflow, real CLIENT form submission, persisted owner/version, list and refresh, public-stage translation, keyboard opening of details, record retention, Arabic/English and RTL/LTR in both configured projects (375 and 1280), axe on form and list. Screenshots attached by Playwright use synthetic records.

## Validation results

Observed before the initial PR commit (all successful commands exited 0):

| Command | Observed result |
| --- | --- |
| `npm run lint` | ESLint independently passed; design token checks passed |
| `npm run typecheck` | Passed |
| `npm test` | 962 tests in 59 files passed, including the new unit/MariaDB regressions |
| `npm run build` | Server, browser and SSR builds passed |
| `npm run test:independence` | Passed |
| `npm run test:e2e -- tests/e2e/request-list-workflow.spec.ts` | 4 passed; AR/EN × 375/1280, axe and keyboard assertions included |
| `TMPDIR="$PWD/.migration" npm run test:infra` | Passed; no service started or deployed |
| `git diff --check` | Passed |

The complete `npm run test:e2e` run and GitHub CI are additional gates: their final outcomes belong in the PR's validation summary and checks for the exact commit, not an assumption based on the focused tests above. Local logs are under `.migration/issue-107/`, including `e2e-full.log`. Commands use explicitly selected isolated test databases; no production environment file is loaded for the test server. No checks were disabled or weakened.

## Manual retest

1. In an isolated environment, publish a custom **requests** workflow for a service, with distinct Arabic and English public stage names.
2. Sign in as CLIENT. Create a project request at `/ar/account/requests/new` using that service. Confirm the request reference and one persisted request.
3. Open `/ar/account/requests`. Confirm the reference and public stage; refresh the page and confirm both remain visible without an error.
4. Open the request reference by keyboard. Confirm its details and public stage. Repeat in English and at 375/1280 widths.
5. Include a request with the legacy workflow and an older request without a workflow. Confirm both remain visible with their ordinary status labels.
6. Use another CLIENT account: the first client's requests must not appear; direct detail access must be denied. Existing staff assignment and stage restrictions must still apply.

## Risks and rollback

Only the request list's JSON decoding changes. Invalid projections remain errors and should be investigated rather than hidden. The analogous inquiry list decoding is outside this PR and must be evaluated during #102 separately from that issue's ownership defect. Roll back by reverting this PR; no schema or data rollback is needed. Passing local checks or CI does not establish production behavior or authorize a merge, release, or deployment.

## Initial queue review

All requested issues were open at the initial GitHub review. Only #107 has been reproduced in this PR; open status does not establish that the other reports still reproduce on the latest code.

| Issue | Report classification / next action |
| --- | --- |
| #107 | Confirmed current defect; this independent PR |
| #102 | Next priority: reproduce admin-created inquiry ownership and follow-up |
| #116 | Next: reproduce language switching with tracking context |
| #110 | Next: reproduce unsent form retention across language switches |
| #99 | Transition destination clarity; reproduce before editing |
| #100 | Deadline timezone clarity; reproduce before editing |
| #101 | Proposed workflow-event processing status feature; establish product scope |
| #103 | Notification counter synchronization; reproduce before editing |
| #105 | Budget currency clarity; requires an explicit currency decision, not an inferred default |
| #106 | Proposed profile autofill feature; establish product scope |
| #108 | Proposed original-description display; establish product scope |
| #109 | System-event translations; reproduce before editing |
| #111 | Announcement audit differences; reproduce before editing |
| #112 | Proposed media alt-text suggestion; establish product scope |
| #113 | Revision-history current label; reproduce before editing |
| #114 | Past-publication validation message; reproduce before editing |
| #115 | Medium-width brand compression; reproduce before editing |
| #117 | Tracking reply eligibility and rejection; reproduce before editing |
| #118 | Calendar interval validation message; reproduce before editing |
| #119 | Nested administrative preview layout; reproduce before editing |
