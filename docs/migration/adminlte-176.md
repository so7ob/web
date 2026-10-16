# AdminLTE administration implementation — #176 / PR #177

## Provenance and workflow

The environment initially contained clean `work` at `f3935f3ccfccbb205707619888c352aba68d1517`. Read AGENTS.md, CONTRIBUTING.md and the existing design-system documentation, confirmed both origin URLs as `https://github.com/so7ob/web.git`, fetched develop and independently checked remote head `4922dcfc1823e730d0f8d04341516fde9eb9f6a2` (also rechecked before publication). Reviewed issue inventory through #175, #168's nine-key transport scope, and open PRs (none before this work). Created #176, branched `feat/176-adminlte-design-system` from that develop commit and opened draft PR #177 to develop. No merge, deployment, branch-protection change or production operation.

AdminLTE stable v4.10.1: `e13df78a4d0c287e5fa57308e293f63e44e9dd0f`. [Mapping, dependency boundary, profiles and license](../design-system/adminlte.md). Implementation commits: `85acef19de6f58694375bcd382645ed5aad18e60` and `6ccf6a3713dd6adb1d0d77ca45bf00f49c1a434c`, `bdaf84e4a1bd119ae370225f7072f737b8d9bdf0`, and `e1df3c9ad3fa8788d82638d398814d3219fa9429`. The final hover-state correction makes search text/icons inherit the outline button foreground and gives the shortcut chip its own accent pair.

## Delivered behavior

Shared administration shell/navigation, keyboard-operable desktop collapse and existing Radix mobile drawer; reusable card slots used by the dashboard; outline cards/info boxes; table striping and hover/focus/selection; form invalid/disabled states and settings-save busy semantics. Existing actions, routes, permission filters and draft ownership remain intact.

Four coordinated styles: light, semi-dark sidebar, full dark, colored header/dark sidebar. The optional validated `appearance.adminStyle` passes the existing DTO allowlist and checked settings/revision pipeline. There is no schema migration. Missing key preserves previous behavior and the nine existing appearance values. Profile selection proposes only style + default mode in the unsaved draft; it retains fonts, palette, density, radius and personal mode precedence. No #168 import/export or unrelated backlog feature.

Appearance previews use actual React Button/Input/Panel/Table/navigation primitives in a sandboxed iframe via a React portal. The existing theme provider remains the owner; copied compiled styles and draft semantic tokens keep the frame isolated. Tests inspect the rendered frame DOM rather than an empty srcdoc shell. Settings route: 33.25 kB / 11.66 kB gzip, versus 27.85 / 10.28 baseline; an initial server-renderer approach was corrected after measuring 218.49 / 68.16.

## Verification and evidence

Final local runtime: Node 24.21.0, npm 10.8.2, MariaDB 10.11.18. Unit and browser databases are separate loopback-only synthetic containers. Browser fixtures use normal CSRF/credentials login, never fabricated sessions or password resets. No test assertion, retry setting, coverage gate or security boundary was disabled.

| Check | Result |
| --- | --- |
| ESLint + design-token guard | Passed; 236 interface source files checked, existing three exceptions unchanged |
| TypeScript | Passed |
| Unit/integration | 1149 passed in 71 files on a fresh isolated unit database |
| Build | Passed, client and SSR |
| Independence | 3 passed plus standalone runtime scan |
| CI-policy/gate tests | 14 passed |
| Browser regression matrix after both interaction-state fixes | 34 passed: 16 shell/profile cases, 8 admin-layout cases, 10 settings-appearance cases |
| Wider platform tour, saved density and theme preference | 3 passed: ar/light desktop platform tour, saved density/radius, and theme preference |
| `git diff --check` | Passed |
| Full pinned browser / infra / final CI | See limitations below; not claimed passed |

The 16 profile/shell cases cover Arabic/English, RTL/LTR, 375/1280, both personal modes, all four profiles, main document and actual-preview axe, mobile drawer axe, no page overflow, save/reload persistence, preserved personal preference, compact 44px controls and focus restoration. Contract tests add extreme-palette chrome contrast and missing-key compatibility. Integration tests add checked persistence, stale revision rejection, denied permission and invalid enum rejection.

[Before/after and profile screenshots](evidence/adminlte-176/README.md) are actual synthetic rendered views. Baseline screenshots were captured from a detached checkout of verified develop with equivalent fixtures. Profile screenshots show the preview draft; tests subsequently save/reload. Build stamps in the first local 34-case run say `85acef19…+dirty`; the intermediate hover run says `6ccf6a37…+dirty`. Final source including the adjacent-control correction is `e1df3c9a…`; its successful 34-case run is stamped `e1df3c9a…+dirty` because evidence documents/images were pending. This is not represented as a clean-build provenance stamp. Exact-commit CI must be assessed separately.

## Corrected findings and remaining limitations

- Initial CI run [38834648193](https://github.com/so7ob/web/actions/runs/38834648193) failed because the new spec was not registered. Registered it in the mandatory exported `design` catalog; the existing runner consumes that list and its locale/mode grep selects two AdminLTE cases per cell. The fail-closed test remains intact. The subsequent exact-source run is [38836446010](https://github.com/so7ob/web/actions/runs/38836446010); completed successfully, including all eight design cells, four functional shards, smoke, infrastructure and the required aggregate gate. It predates the hover-state fixes and cannot establish final-head acceptance.
- Independent review [6206138474](https://github.com/so7ob/web/pull/177#issuecomment-6206138474) identified colored-header search hover contrast. A new browser assertion reproduced the mismatched child foreground on the old build (1 expected regression failure). Search text/icons now inherit the button state color; the shortcut uses its own accent/foreground pair. Added actual focused/hovered search axe, visible focus and child-color assertions, plus hover axe for every adjacent topbar Button. The native theme selector keeps its existing paired surface and focus-within outline. Adjacent-button coverage then exposed a second dark colored-header language-button contrast failure (2.34:1), caused by the shared ghost variant's translucent hover surface (intermediate run: 32 passed, 2 failed, desktop/mobile Arabic dark). A scoped opaque accent/foreground hover pair corrects that combination; state audits wait for CSS transitions to finish rather than sampling intermediate colors.
- First profile HTTP checks exposed a missing explicit SettingsBody DTO field; fixed without a wildcard. Colored-header axe then exposed nested surface-reset foregrounds; scoped base aliases now preserve paired text colors. Final local matrix passed after those concrete fixes, without retries.
- A repeated unit run accidentally reused the browser fixture database and produced 17 failures in migration/file/count assertions. Re-ran against a separately provisioned empty isolated unit database: 1149/1149 passed. No destructive reset of existing data or assertion change.
- The locked Playwright Chromium 151 download returns `403 Domain forbidden` from cdn.playwright.dev. Local rendering uses installed Chromium 154.0.8037.57 through an ignored config overriding only executablePath/report location. The committed Playwright config and CI remain pinned. A full substitute run was interrupted to replace the oversized preview implementation after 41 passes, 1 interrupted and 504 unrun; it is not full-suite evidence. The final full catalog has 554 cases and remains a required CI gate.
- `test:infra` was attempted: no installed nginx initially; a local extracted Debian nginx binary verified syntax, then failed at its compiled default `/var/lib/nginx/body`, unavailable in this restricted environment. No host service/configuration was changed. Full infra remains unverified locally.
- GitHub CLI REST/GraphQL returned Forbidden; connected GitHub tools successfully handled issue/PR reads and writes. Branch-protection settings could not be inspected through that CLI and were not changed.

Only four coordinated profiles and the existing three palette presets are delivered, not the live demo's 17 skins. Keep PR draft until exact-head CI and independent review complete. Rollback is a reviewed revert; earlier code ignores the additive stored style key, and no data/schema rollback is necessary.

Final local interaction regression run: **34 passed in 5.3 minutes**, source `e1df3c9ad3fa8788d82638d398814d3219fa9429`. Evidence-only publication does not change application source. Final remote CI is pending publication; keep the PR draft for independent review and exact-head checks.
