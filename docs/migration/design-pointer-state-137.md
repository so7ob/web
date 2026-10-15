# 404 design-test pointer state (#137)

Base: fetched `develop` at `4af93b10ea32e48125181bdfc519fb2b59c7716c` on 2026-10-15. Initial focused checks used `a6d17c9c73f459e6628c08f191caf45f66ac9e5d`; develop advanced before publication when #139 merged. The unpublished branch was rebased onto the new head. The adjacent CI-list conflict retained the new workflow smoke registration and added the pointer design registration; no workflow implementation/test files were edited. Independent issue branch; #138 remains unchanged at `dd7cef38b49f2337b97a4ed9488e45a87cd68058`. No product colors, styles, routes or workflow files change.

## Evidence and scope

[Issue #137](https://github.com/so7ob/web/issues/137) records the retained CI197 trace and screenshot: after a client 404 navigation, the pointer remained at (256.5,531.54), over the new Arabic primary button. Its hover-colored pixels contain that point. The context uses a mouse (`isMobile:false`, `hasTouch:false`) even at 375×812. The old test measured the base color without establishing a base pointer state. The received `rgb(139,24,75)` is the intentional hover token; the base token remains `rgb(157,23,77)`.

Before work, searches for an existing PR fixing #137, PRs mentioning hover/404/pointer, the #137 branch name and matching issues found diagnosis in #135/#138/#139 and issue #137, with no existing implementation branch or PR. The selected `.agents/skills/ui-ux-pro-max/SKILL.md` guidance on distinct web hover states was reviewed; the focused `hover state` UX search's web interaction result applies. Its native-touch and VisionOS results do not apply to these mouse contexts.

Only `not-found-client-navigation` and `not-found` captures establish a neutral pointer state. A test helper chooses a viewport corner outside the actual control bounds, performs a native mouse move, and checks `:hover` is false. The exact original primary-color assertions remain; an additional exact base-color check completes before each affected screenshot. No CSS injection, disabled hover, color unions, sleeps, skips, retry settings or timeout increases are used.

Other primary checks were inspected. Tab text uses `data-state=active` without a hover color override. Checkbox accent and published card/table/body surfaces do not depend on pointer hover. The existing admin primary-color check follows the now-neutral 404 capture. No speculative edits to those checks were made.

## Deterministic regression

Eight cases cover ar/en, RTL/LTR, light/dark and 375/1280. Each creates one synthetic published CMS page using real authenticated API requests, then exercises both a direct HTTP 404 and a keyboard-triggered React Router client 404. A document sentinel proves the latter did not reload the document. Both contexts explicitly verify mouse-hover capability.

For each route, the test deliberately hovers the new 404 primary button before calling the shared normalization helper. It then verifies exact base background/foreground, native hover background/foreground and pointer-leave restoration of the base pair. Base/hover/leave screenshots are attached separately; axe runs after each route. This gives sixteen route journeys and forty-eight state screenshots without changing the frozen design ledger.

The fixture owns a separate authenticated API context and budget for cleanup. It deletes only its own synthetic page/version/audit rows and transactionally restores the exact four palette setting rows. Existing loopback/database/login-quota guards and one worker per database remain active.

## Verification, limitations and rollback

The focused eight-case matrix passed locally on the first browser run. Disabling only the native pointer move/hover-state normalization in a temporary helper mutation made the Arabic/light/mobile regression fail with expected `rgb(157, 23, 77)`, received `rgb(139, 24, 75)`. The fixed helper was restored byte-for-byte before final checks; the mutation is not committed. Focused screenshots/reports and the failing mutation trace are retained separately under ignored local test output.

The frozen coverage fixture remains **104 views / 31 block types**. The original screenshot, route, theme, responsive and accessibility assertions are retained. The new spec is registered in the existing design matrix, so each locale/mode/project cell runs its matching regression. The first policy check caught the missing registration (12/13); registering it preserves all existing policy expectations and conservative full selection for test/tool changes, without changing selectors, fallbacks or the required gate.

Local checks use Node 24.21.0/npm 10.8.2, the existing disposable MariaDB 10.11.18 test container and fresh `so7ob_issue137_browser_test` / `so7ob_issue137_unit_test` databases. No #136 database, real data, production service, permissions or external messages are changed. Local pinned Chromium 151 download remains blocked by network policy; local checks use installed Chromium 154.0.8037.57. Canonical pinned-browser coverage and final exact-head CI results are reported in the PR validation section; pending checks are not successes.

Rollback is a revert of this issue's test/evidence commit. No merge, deployment or release is performed.
