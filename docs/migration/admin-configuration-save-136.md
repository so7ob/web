# Admin configuration acceptance isolation (#136)

Original implementation base: fetched `develop` at `a6d17c9c73f459e6628c08f191caf45f66ac9e5d` on 2026-10-15. Independent of #131; no workflow editor files or product implementation changed.

## Failure and correction

[Issue #136](https://github.com/so7ob/web/issues/136) records CI 196 attempt 1's trace: Save is disabled while a PATCH is pending, and settings section links ignore clicks during that time. The old disabled-only wait let the journey click Announcement before persistence completed. After that body deadline, page-scoped cleanup could not restore the phone, and the next locale entered an identical value and never became dirty.

The acceptance journey now starts the checked-PATCH response wait before clicking Save, checks HTTP 200, waits for the translated all-changes-saved status and an enabled idle control, and retains the disabled Save assertion. Section navigation verifies URL, current link and visible destination field. A synthetic phone value is selected against the current value. Both original locale journeys retain their settings persistence, database announcement, public announcement HTML, menu persistence, public menu HTML and audit assertions.

The configuration fixture owns a separate authenticated APIRequestContext and a 30-second fixture budget, independently of the unchanged 30-second body deadline. Its storage state authenticates browser pages without making teardown depend on the page or browser lifetime. Restoration checks settings, restores exact menu rows/IDs transactionally even if the settings cleanup fails, and checks exact row equality. Only the four settings touched by this spec and header menu rows are restored. The existing isolated database/loopback and login quota guards remain active.

## Regression evidence

- Arabic and English delayed-response cases commit the real first settings PATCH upstream and withhold its response. While held, they assert disabled Save/input, dirty status, the Contact URL and no attempted Announcement click. Releasing the gate must complete the same save/navigation helper and persist the phone after reload. The initial phone deliberately models an interrupted predecessor's old fixed value.
- A separate child Playwright runner performs real synthetic settings/menu writes, deliberately lowers only its failing probe's body deadline, and times out. The following case runs in the runner's replacement worker and compares restored settings and complete menu rows/IDs with the parent's baseline. The parent requires exactly `timedOut`, then `passed`, exit 1 and no runner errors, and attaches the child JSON evidence. This intentional failure is confined to the probe runner; the normal catalog cases must pass without retries or skips.
- The child runner re-exports only the real built database/quota implementations used by the fixture (not mocks), avoiding eager unrelated service imports and repeated source-index transpilation inside the unchanged parent deadline. Its config/case are not ordinary `.spec.ts` catalog entries; their parent is counted normally. No test selection, timeout, assertion or CI policy was weakened.

## Verification and limits

Local configuration validation passed 10/10 cases across both locales and widths. After narrowing child startup imports, both final deadline probes passed again (9.4s desktop / 12.2s mobile). A temporary disabled-only save-helper mutation made the Arabic mobile delayed-response regression fail deterministically: expected Announcement URL, actual Contact URL, after 9.3s. The fixed helper was restored byte-for-byte before final checks; the mutation is not part of the commit.

Final results are recorded in the PR's validation section and linked CI run. Local checks use locked Node 24.21.0/npm 10.8.2 and a newly created disposable MariaDB 10.11.18 container with separate `so7ob_issue136_browser_test` and `so7ob_issue136_unit_test` databases. All accounts, settings, menu changes and credentials are synthetic. No external service or production state is targeted.

Local Playwright's pinned Chromium 151 download is denied with HTTP 403 by the environment's network policy. Local browser results therefore use the already installed Chromium 154.0.8037.57; the unchanged CI installation remains the pinned-browser proof. Local infrastructure validation passed with the extracted Nginx package and a local wrapper relocating only its compiled absolute temporary directories into the check's disposable directory. The initial unadapted invocation failed because `/var/lib/nginx/body` is unavailable; the repository's infrastructure check and product configuration are unchanged. Local serial full-browser acceptance is not claimed in place of the selected complete CI catalog.

The initial local full unit/integration run passed 1024/1025 tests in 64 files. The sole failure was the unchanged `identity.integration.test.ts` concurrent normalized-uniqueness case reaching its existing 5000ms deadline; a focused repeat passed 12/13 with the same timeout. Both ran alongside browser-runner startup. No unit timeout or assertion was changed; whether this is environmental is an inference, and the final CI result must be evaluated independently.

Risk is confined to acceptance infrastructure. Rollback is a revert of this issue's test/evidence commit. No PR merge, release, deployment, permission change or production migration is authorized by these results.

## Synchronization after reviewed #140 merge

Develop advanced to `a04e4bb64da6de427e1bcaf577d9a161d3088735`, containing the reviewed #131 and #137 fixes. It was merged normally into the published #138 branch with original head `dd7cef38b49f2337b97a4ed9488e45a87cd68058` as the first parent; published history was not rebased, amended or force-pushed. Git reported no conflicts.

All six #136 test/helper files remain byte-for-byte identical to the original head. All incoming application, workflow tests, pointer tests/helpers, frozen design fixtures and CI policy/gate files remain identical to develop. The PR's incremental diff against the new base remains confined to #136's tests and evidence. Workflow draft cases remain in mandatory smoke, and pointer regressions remain in the eight-cell design matrix.

The synchronized head is checked again with the ten configuration cases, eight pointer-state cases and canonical complete CI, including workflow smoke and all eight original design journeys. Results and exact synchronized SHA are recorded in the PR validation section; older passing checks are not presented as checks of the new head. Fresh isolated `so7ob_issue136_sync_browser_test` and `so7ob_issue136_sync_unit_test` databases are used for local revalidation. PR #138 stays Draft; this branch update does not merge the PR or deploy the site.
