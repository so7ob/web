# Visual and load evidence — #180

[Open the offline comparison viewer](comparison.html). Select a route and viewport for the original screenshots; the dashboard also includes the pinned v1/v2/v3 reference. Images retain their native pixels and can be opened individually. [SHA-256 and dimensions](manifest.json).

Sources: develop `e8d0f6cf7367d8732abaa179a1c118010cd86f5e`; client candidate `551b17f7c4378a3fb1428ff49fb87c2f33650421`; AdminLTE v4.10.1 `e13df78a4d0c287e5fa57308e293f63e44e9dd0f`. Local comparison build predates the later server-only legacy-settings validation correction. The final validation record must verify client asset hashes against this build and identify the exact final CI head. All fixture records, identities, uploads and text are synthetic.

## What to inspect

- Dashboard: four colored Small Boxes, three secondary Info Boxes, count chart/status progress, striped requests, activity cards; 250px sidebar, 57px navbar, 24px gutters, Source Sans 3/IBM Arabic, 6px radius.
- Site appearance versus administration appearance: separate tabs, drafts, previews, saved defaults and personal modes. Site preview omits administration chrome. All 29 presets include independent sidebar/navbar/footer region mode/background controls and primary color.
- Eight bilingual light/dark dashboard captures; gradient-indigo and original yellow-light show regional palette application. Existing design CI artifacts cover all 105 screens, 31 block types, interactive/permission/error states.

## Deliberate differences

So7ob keeps its logo, names, content, Lucide icons, actual metric links and business data. Its seven metrics combine v1 Small Boxes with v2 Info Boxes above a v2/v3 report composition; no demo sales, maps or invented trend series. The chart includes an accessible data table. Arabic uses the existing licensed Arabic font and logical RTL layout. 44px targets, focus outlines, readable semantic text and AA-enforced regional gradients are retained even where the demo is denser. The administration heading and Info Boxes may grow for translated text. So7ob cards use the semantic border #dee2e6; the pinned reference card uses Bootstrap's translucent black border. No pixel-identity score is claimed for different content.

Reference screenshots: AdminLTE MIT, see [license/source notice](../../../design-system/adminlte.md). Source Sans 3 OFL and existing icon notices are recorded there. The reference checkout and demo controllers are absent from the runtime and build.

## Bundle size

Production Vite manifest, bytes on disk and deterministic gzip level 6; route chunks are not total page payloads. [Complete static import closures](bundles.json).

| Asset | Before raw / gzip bytes | After raw / gzip bytes | Raw delta |
| --- | ---: | ---: | ---: |
| Entry JS | 211863 / 66933 | 212191 / 67009 | 328 |
| Application CSS | 169442 / 24566 | 165785 / 24834 | -3657 |
| src/screens/admin/dashboard.tsx | 11116 / 3278 | 10723 / 3502 | -393 |
| src/screens/admin/layout.tsx | 21304 / 6129 | 25902 / 7119 | 4598 |
| src/screens/admin/settings.tsx | 33255 / 11509 | 46963 / 15369 | 13708 |
| src/screens/account/dashboard.tsx | 7208 / 2164 | 6340 / 1951 | -868 |
| src/screens/account/layout.tsx | 7520 / 2592 | 7575 / 2610 | 55 |

## Local load samples

140 interleaved fresh-context samples: five per route, viewport and version; Chromium 151.0.7922.34, Node v24.21.0, loopback TLS, no CPU/network throttling, reduced motion and identical fixtures in two independent MariaDB databases. Normal CSRF login. The old combined tab is the baseline for both new logical appearance routes. Resource bytes/count cover subresources (JS/CSS/fonts/images/API), **exclude the HTML document**, and are not total wire bytes. Ready time measures navigation through network-idle and document.fonts.ready. Timings share a host with other validation and are descriptive, not a statistically established speedup or regression. [All samples](load.json), [medians](load-medians.json), [unchanged dashboard projection](dashboard-fixture.json).

| Width / route | DCL ms before → after | Ready ms before → after | Subresource bytes before → after | Requests before → after |
| --- | ---: | ---: | ---: | ---: |
| 1280 / admin | 406.3 → 347.3 | 1127.08 → 1153.93 | 1298247 → 1335679 | 75 → 83 |
| 1280 / admin/settings?section=appearance | 251 → 320.3 | 1016.54 → 1134.86 | 1367394 → 1429854 | 86 → 98 |
| 1280 / admin/settings?section=adminAppearance | 244.8 → 280.1 | 1044.22 → 1129.26 | 1367394 → 1429854 | 86 → 98 |
| 1280 / account | 248.9 → 275.8 | 886.47 → 942.93 | 1248222 → 1225895 | 60 → 61 |
| 1280 / contact | 286 → 264.8 | 833.01 → 842.16 | 1472254 → 1448180 | 63 → 63 |
| 1280 / auth/login | 241.9 → 214.1 | 798.69 → 768.71 | 1269466 → 1246672 | 56 → 57 |
| 1280 /  | 268.6 → 285.5 | 828.34 → 853.15 | 1472254 → 1448180 | 63 → 63 |
| 375 / admin | 255 → 277.4 | 963.41 → 1031.38 | 1298247 → 1335679 | 75 → 83 |
| 375 / admin/settings?section=appearance | 224.1 → 227.6 | 1019.43 → 1047.97 | 1367394 → 1429854 | 86 → 98 |
| 375 / admin/settings?section=adminAppearance | 268 → 244.6 | 1082.59 → 1097.19 | 1367394 → 1429854 | 86 → 98 |
| 375 / account | 303.9 → 238.4 | 928.35 → 882.21 | 1248222 → 1210243 | 60 → 60 |
| 375 / contact | 271.1 → 242.9 | 817.39 → 837.15 | 1448070 → 1432528 | 62 → 62 |
| 375 / auth/login | 252.4 → 220.5 | 794.51 → 761.37 | 1245282 → 1231020 | 55 → 56 |
| 375 /  | 286.3 → 256.9 | 853.43 → 821.81 | 1472254 → 1448180 | 63 → 63 |

The settings route adds the actual generator, catalog, scoped preview and independent settings controls; dashboard route JS is smaller. Shared CSS decreases. Locally served fonts remain part of the measured requests. [Computed reference/product geometry](measurements.json) includes all eight product dashboard cells and both widths of all three reference dashboards. Browser/functional/CI acceptance is recorded in the [implementation report](../../adminlte-180.md), not inferred from these images.

## Arabic platform tour selections

Original develop captures were taken before implementation. Candidate captures are from the completed AR/light/1280 105-view tour, client 551b17f. These intentionally exercise the tour's custom rose palette in both independent scopes, rather than the default blue shown above. They use independently generated synthetic tour fixtures, so dynamic timestamps and counts may differ; the fixed-fixture dashboard/load comparison above is the data-controlled comparison.

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
