# Account inquiry ownership — issue #102

## Scope and provenance

Base: `f3935f3ccfccbb205707619888c352aba68d1517` (develop fetched explicitly from `https://github.com/so7ob/web.git` on 2026-10-15). The restored checkout was clean and the remote develop head matched the snapshot. GitHub connector inspection found no open PRs and no assignees/comments on #102. The shell GitHub API returned Forbidden; repository reads and PR creation use the connected GitHub app instead. No work on #107/#122 or #123/#124 was repeated.

Implementation and test source commit: `586ceaba07f52ee899784152a903e7dd69e921e9`. The initial evidence commit changed only this document. A follow-up CI catalog correction described below preserves those same product and browser/integration test blobs. Runtime: Node 24.21.0, npm 10.8.2, Docker MariaDB 10.11.18 bound to loopback port 33102, fresh database `so7ob_issue102_test`. No worker, external mail, external webhook, production data or persistent credential was used.

## Reproduction and change

The new integration matrix ran before the production edit against real isolated MariaDB. All six cases failed: support/super_admin owners had an empty account list in Arabic and English, despite persisted `clientId` matching the actor and `assigneeId` being null; the two client cases exposed the converse problem, where an assigned non-owner carrying administrative permissions could read the record through the account list.

`InquiryService` serves account routes. Its ownership predicate and list now consistently use `clientId`, regardless of staff permissions. Account detail always excludes internal notes and their attachments. Reply authorization uses the same owner predicate. Administrative services, assignment/team authorization, workflow engine, database schema, translations and rendering were not changed. Staff manage assigned conversations through administration, not the customer account endpoint.

Regression coverage exercises client, support and super_admin owners in both languages; persistence ownership; list uniqueness; repeated detail reads; private notes/files; assigned non-owner rejection for list/detail/reply; concurrent reply idempotence; and one persisted inquiry rather than duplicate submission. Browser coverage creates through the UI, follows the success action, reloads, revisits the list and checks the same conversation in administration for admin actors.

## Verification

The local evidence logs are ignored under `.migration/issue102/`; pre-fix evidence is `/tmp/issue102-before.log`. No logs containing user data are committed.

| Check | Result |
| --- | --- |
| New integration matrix before fix | 6 failures, as described above |
| `npm run lint` | Passed, including independent ESLint and design token check |
| `npm run typecheck` | Passed |
| `npm test` | 59 files, 968 tests passed, including administration/workflow/authorization suites |
| `npm run build` | Passed |
| `npm run test:independence` | Passed |
| New browser spec with system Chromium | 8 passed: ar/en × admin/client × 1280/375 widths |
| Standard Playwright browser run | Blocked: bundled Chromium headless shell v1234 is absent; download returns HTTP 403 `Domain forbidden` |
| `npm run test:infra` | Failed before configuration checks because nginx is absent; systemd-analyze is present |
| `git diff --check` | Passed |

The successful browser run used Chromium 154.0.8037.57 via an ignored local Playwright config that imports the repository config, preserves one worker, projects, assertions and setup, and overrides only the executable path and local reporting/path resolution. It is not evidence that the pinned CI browser or the full browser suite passed. The standard full-suite attempt uses `--max-failures=1` to stop at the known missing-browser failure; it does not skip or relax assertions.

Initial browser execution found a test locator selecting a hidden duplicate reference and a shared account quota exhausted across scenarios. The final test selects the visible reference and preserves/restores synthetic per-account quota state. The production rate limiter is unchanged. All eight final focused scenarios passed.

CI policy selects full coverage for this server/test change. GitHub Actions status must be reviewed at the final PR SHA; local results are not a claim of remote CI success. Worker/restore/operational checks were not separately run in this session. No visual code changed; no new axe or keyboard audit was performed. The two previously reported design-system QueryFailedError observations were not investigated or claimed fixed.

## Risks and rollback

The intended behavior change removes staff-assignment access through account inquiry endpoints; administrative endpoints remain the supported staff workspace. Custom-workflow browser journeys were not newly added; existing workflow integration coverage passed. No migration or data rewrite is required. Revert the implementation commit to restore the old endpoint behavior, which also restores the reported defect. Leave this PR Draft for the owner's review, CI and merge decision; do not merge or deploy automatically.

## CI follow-up

The first remote run [38662927613](https://github.com/so7ob/web/actions/runs/38662927613) failed in `npm run test:ci-policy` before product checks: the newly added browser spec was missing from the requests-domain catalog, causing the existing affected-selection assertion to receive `full`. This was reproduced locally (12 passed, 1 failed). Registering `account-inquiry-ownership` in the requests domain fixes the cause; an explicit assertion now requires its inclusion. All 13 policy/evidence/gate/documentation tests pass. No assertion or gate was weakened, and this PR still selects full coverage because it edits server code. Remote CI must be reassessed on the updated head.
