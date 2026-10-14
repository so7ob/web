# Synthetic design-system review captures

The route matrix deliberately uses magenta/teal primary and secondary colors to make theme propagation visible. The three workspace examples below use the default identity. Neither changes the platform's configured identity. Accounts, records and reference codes are synthetic.

The [coverage manifest](coverage.json) records the locally tested product revision, every route/tab/state label, the 32 additional workspace-composition captures, runtime/assertion results and SHA-256 hashes of the local PNG set. The CI workflow independently repeats the matrix and uploads its own captures and coverage records as `design-system-92-synthetic-interfaces`; retrieve them from the successful [exact-source CI run](https://github.com/so7ob/web/actions/runs/38599256847/artifacts/11914639586). CI uses its checked-out PR merge revision and fresh synthetic records, so its image hashes are not expected to match the local manifest.

| Capture | Language / mode / width |
|---|---|
| [Users workspace](workspace-ar-desktop-light-users.png) | Arabic / light / 1280 |
| [Settings workspace](workspace-ar-desktop-light-settings.png) | Arabic / light / 1280 |
| [Outbox workspace](workspace-ar-desktop-light-outbox.png) | Arabic / light / 1280 |
| [Administration requests](ar-desktop-light-admin-requests.png) | Arabic / light / 1280 |
| [Appearance settings](en-desktop-dark-settings-appearance.png) | English / dark / 1280 |
| [Identity details](ar-mobile-dark-admin-user-detail.png) | Arabic / dark / 375 |
| [Account profile](en-mobile-light-account-profile.png) | English / light / 375 |
| [Editor properties and canvas tools](ar-desktop-dark-editor-properties-tab-2.png) | Arabic / dark / 1280 |
| [Published responsive surfaces and nested card](en-desktop-light-published-tablet-surfaces.png) | English / light / 768 |
| [Public home](ar-mobile-light-public-home.png) | Arabic / light / 375 |
| [Authentication](en-mobile-dark-auth-login.png) | English / dark / 375 |

Settings previews have an independent mode selector; a light preview inside a dark workspace is intentional. Editor content has its own draft language and device selection. Dense tables scroll locally while page controls wrap.

These are review baselines, not pixel-difference tests against the previous design. Route contact sheets and segmented long pages support visual inspection; axe, computed colors, document/dialog overflow, keyboard focus and control geometry are checked by the browser suite. Chromium is the automated browser target. No production account, content export or deployment is represented here.

[Validation details](validation.json) and [visual review provenance](visual-review.json) distinguish the successful 290/290 CI run from the local 289/290 run, whose single CSS transport failure passed on an independent unchanged-case rerun. All 832 local matrix captures passed their checks. The CI artifact is retained for 30 days; this curated gallery and local capture hashes remain versioned.
