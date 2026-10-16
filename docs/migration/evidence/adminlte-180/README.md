# Visual and load evidence — #180

[Open the offline comparison viewer](comparison.html). Select a route and viewport for the original screenshots; the dashboard also includes the pinned v1/v2/v3 reference. Images retain their native pixels and can be opened individually. [SHA-256 and dimensions](manifest.json).

Sources: develop `e8d0f6cf7367d8732abaa179a1c118010cd86f5e`; client candidate `1753607e533fc3b65b4c9769b78918706df3ef75`; AdminLTE v4.10.1 `e13df78a4d0c287e5fa57308e293f63e44e9dd0f`. The comparison uses the complete application build including the legacy-settings validation correction and stable dark-mode metric fill. Later commits publish evidence and validation text; exact CI head and compiled revision are recorded in the implementation report. All fixture records, identities, uploads and text are synthetic. Final bundle/load measurements use `acd4cf3c2d106d520c153925c55401c08c48ab2b` (140 fresh samples); the later change only restores iframe keyboard tooltips and does not alter the captured visual styles. The native visual/geometry evidence remains explicitly attributed to `1753607e533fc3b65b4c9769b78918706df3ef75`.

## What to inspect

- Dashboard: four colored Small Boxes, three secondary Info Boxes, count chart/status progress, striped requests, activity cards; 250px sidebar, 57px navbar, 24px gutters, Source Sans 3/IBM Arabic, 6px radius.
- Site appearance versus administration appearance: separate tabs, drafts, previews, saved defaults and personal modes. Site preview omits administration chrome. All 29 presets include independent sidebar/navbar/footer region mode/background controls and primary color.
- Eight bilingual light/dark dashboard captures; gradient-indigo and original yellow-light show regional palette application. Custom-preset captures explicitly choose a steel/dark footer to demonstrate independent footer settings; a preset leaves footer choices intact. Existing design CI artifacts cover all 105 screens, 31 block types, interactive/permission/error states.

## Deliberate differences

So7ob keeps its logo, names, content, Lucide icons, actual metric links and business data. Its seven metrics combine v1 Small Boxes with v2 Info Boxes above a v2/v3 report composition; no demo sales, maps or invented trend series. The chart includes an accessible data table. Arabic uses the existing licensed Arabic font and logical RTL layout. 44px targets, focus outlines, readable semantic text and AA-enforced regional gradients are retained even where the demo is denser. The administration heading and Info Boxes may grow for translated text. So7ob cards use the semantic border #dee2e6; the pinned reference card uses Bootstrap's translucent black border. No pixel-identity score is claimed for different content.

Extracted AdminLTE styles/layout: MIT, see [license/source notice](../../../design-system/adminlte.md). Reference screenshots also show upstream demo media; its README credits Pixeden, Graphicsfuel, Pickaface, Unsplash, Uifaces and Unavatar. Those assets are not shipped in the So7ob application. Source Sans 3 OFL and existing icon notices are recorded there. The reference checkout and demo controllers are absent from the runtime and build.

## Bundle size

Production Vite manifest, bytes on disk and Node zlib.gzipSync level 6; route chunks are not total page payloads. [Complete static import closures](bundles.json).

| Asset | Before raw / gzip bytes | After raw / gzip bytes | Raw delta |
| --- | ---: | ---: | ---: |
| Entry JS | 211863 / 67019 | 212265 / 67082 | 402 |
| Application CSS | 169442 / 24599 | 165852 / 24845 | -3590 |
| src/screens/admin/dashboard.tsx | 11116 / 3287 | 10723 / 3514 | -393 |
| src/screens/admin/layout.tsx | 21304 / 6147 | 25902 / 7151 | 4598 |
| src/screens/admin/settings.tsx | 33255 / 11617 | 47112 / 15518 | 13857 |
| src/screens/account/dashboard.tsx | 7208 / 2150 | 6340 / 1940 | -868 |
| src/screens/account/layout.tsx | 7520 / 2581 | 7575 / 2599 | 55 |

## Local load samples

140 interleaved fresh-context samples: five per route, viewport and version; Chromium 151.0.7922.34, Node v24.21.0, loopback TLS, no CPU/network throttling, reduced motion and identical fixtures in two independent MariaDB databases. Normal CSRF login. The old combined tab is the baseline for both new logical appearance routes. Resource bytes/count cover subresources (JS/CSS/fonts/images/API), **exclude the HTML document**, and are not total wire bytes. Ready time measures navigation through network-idle and document.fonts.ready. Timings share a host with other validation and are descriptive, not a statistically established speedup or regression. [All samples](load.json), [medians](load-medians.json), [unchanged dashboard projection](dashboard-fixture.json).

| Width / route | DCL ms before → after | Ready ms before → after | Subresource bytes before → after | Requests before → after |
| --- | ---: | ---: | ---: | ---: |
| 1280 / admin | 305.2 → 364.1 | 988.35 → 1127.13 | 1298247 → 1335991 | 75 → 83 |
| 1280 / admin/settings?section=appearance | 274.1 → 264.2 | 1034.13 → 1156.05 | 1367394 → 1441730 | 86 → 99 |
| 1280 / admin/settings?section=adminAppearance | 360.5 → 277.5 | 1188.1 → 1219.22 | 1367394 → 1441730 | 86 → 99 |
| 1280 / account | 275.9 → 314.4 | 951.64 → 999.23 | 1248222 → 1226207 | 60 → 61 |
| 1280 / contact | 276 → 246.5 | 833.71 → 816.51 | 1472254 → 1448492 | 63 → 63 |
| 1280 / auth/login | 281.8 → 324.6 | 822.84 → 890.22 | 1269466 → 1246984 | 56 → 57 |
| 1280 /  | 289.3 → 265.1 | 872.44 → 835.9 | 1472254 → 1448492 | 63 → 63 |
| 375 / admin | 260.1 → 266.6 | 934.08 → 1017.63 | 1298247 → 1335991 | 75 → 83 |
| 375 / admin/settings?section=appearance | 254.9 → 284.2 | 1100.82 → 1169.99 | 1367394 → 1441730 | 86 → 99 |
| 375 / admin/settings?section=adminAppearance | 363.2 → 312.3 | 1173.68 → 1366.11 | 1367394 → 1441730 | 86 → 99 |
| 375 / account | 276.7 → 244.6 | 936.73 → 928.01 | 1248222 → 1210555 | 60 → 60 |
| 375 / contact | 518.3 → 411.7 | 1081.37 → 966.81 | 1448070 → 1432840 | 62 → 62 |
| 375 / auth/login | 544.8 → 621.4 | 1089.53 → 1209.01 | 1245282 → 1231332 | 55 → 56 |
| 375 /  | 627.9 → 588.5 | 1272.45 → 1221.24 | 1472254 → 1448492 | 63 → 63 |

The settings route adds the actual generator, catalog, scoped preview and independent settings controls; dashboard route JS is smaller. Shared CSS decreases. Locally served fonts remain part of the measured requests. [Computed reference/product geometry](measurements.json) includes all eight product dashboard cells and both widths of all three reference dashboards. Browser/functional/CI acceptance is recorded in the [implementation report](../../adminlte-180.md), not inferred from these images.

## Fixed-fixture dashboard matrix

All eight before/after cells use the unchanged develop build versus the final candidate. These baseline cells were reconstructed from the pinned old build; the original 104-view AR/light baseline was captured before implementation.

| Language / mode / width | Before | After |
| --- | --- | --- |
| ar / light / 1280 | [PNG](before/dashboard-ar-light-desktop.png) | [PNG](after/dashboard-ar-light-desktop.png) |
| ar / light / 375 | [PNG](before/dashboard-ar-light-mobile.png) | [PNG](after/dashboard-ar-light-mobile.png) |
| ar / dark / 1280 | [PNG](before/dashboard-ar-dark-desktop.png) | [PNG](after/dashboard-ar-dark-desktop.png) |
| ar / dark / 375 | [PNG](before/dashboard-ar-dark-mobile.png) | [PNG](after/dashboard-ar-dark-mobile.png) |
| en / light / 1280 | [PNG](before/dashboard-en-light-desktop.png) | [PNG](after/dashboard-en-light-desktop.png) |
| en / light / 375 | [PNG](before/dashboard-en-light-mobile.png) | [PNG](after/dashboard-en-light-mobile.png) |
| en / dark / 1280 | [PNG](before/dashboard-en-dark-desktop.png) | [PNG](after/dashboard-en-dark-desktop.png) |
| en / dark / 375 | [PNG](before/dashboard-en-dark-mobile.png) | [PNG](after/dashboard-en-dark-mobile.png) |

## Interactive state captures

| State | EN light / 1280 | AR dark / 375 |
| --- | --- | --- |
| User dropdown | [PNG](after/dashboard-menu-en-light-desktop.png) | [PNG](after/dashboard-menu-ar-dark-mobile.png) |
| Preview tooltip | [PNG](after/appearance-tooltip-en-light-desktop.png) | [PNG](after/appearance-tooltip-ar-dark-mobile.png) |
| Preview dialog | [PNG](after/appearance-dialog-en-light-desktop.png) | [PNG](after/appearance-dialog-ar-dark-mobile.png) |

Additional tooltip pairs: [EN dark / 1280](after/appearance-tooltip-en-dark-desktop.png), [AR light / 375](after/appearance-tooltip-ar-light-mobile.png). These are actual body/iframe portals using shared React components; preview actions are local.

## Arabic platform tour selections

Original develop captures were taken before implementation. Candidate captures are from the completed AR/light/1280 105-view tour, client 1753607. These intentionally exercise the tour's custom rose palette in both independent scopes, rather than the default blue shown above. They use independently generated synthetic tour fixtures, so dynamic timestamps and counts may differ; the fixed-fixture dashboard/load comparison above is the data-controlled comparison.

| View | Before | After |
| --- | --- | --- |
| admin-requests | [PNG](before/tour-admin-requests-ar-light-desktop.png) | [PNG](after/tour-admin-requests-ar-light-desktop.png) |
| admin-request-detail | [PNG](before/tour-admin-request-detail-ar-light-desktop.png) | [PNG](after/tour-admin-request-detail-ar-light-desktop.png) |
| admin-audit | [PNG](before/tour-admin-audit-ar-light-desktop.png) | [PNG](after/tour-admin-audit-ar-light-desktop.png) |
| admin-workflows | [PNG](before/tour-admin-workflows-ar-light-desktop.png) | [PNG](after/tour-admin-workflows-ar-light-desktop.png) |
| admin-media | [PNG](before/tour-admin-media-ar-light-desktop.png) | [PNG](after/tour-admin-media-ar-light-desktop.png) |
| admin-pages | [PNG](before/tour-admin-pages-ar-light-desktop.png) | [PNG](after/tour-admin-pages-ar-light-desktop.png) |
| editor-device-desktop | [PNG](before/tour-editor-device-desktop-ar-light-desktop.png) | [PNG](after/tour-editor-device-desktop-ar-light-desktop.png) |
| public-home | [PNG](before/tour-public-home-ar-light-desktop.png) | [PNG](after/tour-public-home-ar-light-desktop.png) |
| auth-login | [PNG](before/tour-auth-login-ar-light-desktop.png) | [PNG](after/tour-auth-login-ar-light-desktop.png) |
| settings-appearance | [PNG](before/tour-settings-appearance-ar-light-desktop.png) | [PNG](after/tour-settings-appearance-ar-light-desktop.png) |

## Final validation

[Full CI 38958236548](https://github.com/so7ob/web/actions/runs/38958236548), head c1c885ca32d329733a5ecb06e189cb10609c5781 / compiled merge 81127e9e2017daefc5a04d96235aef3795562595, verified 1154 unit/integration tests and **574 expected / 574 passed** browser cases. All eight 105-view design cells passed. Attempt 1 retained two transport failures; only the affected functional shards were repeated in fresh environments on the same source in attempt 2. No browser retries, removed assertions or repaired historical outcome. Operational/migration/recovery/worker/infra gates passed. [Complete results and limits](../../adminlte-180.md).
