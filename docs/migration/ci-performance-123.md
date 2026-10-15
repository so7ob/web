# CI and Playwright performance — #123

This change starts at `develop` `d09aaf2ac2e045696b280aeb5d4fe60dd0ec2c80`. It is independent of #107 / PR #122 and does not include that product fix. No application, permission, database schema or production behavior is changed.

## Measurements and limits

Primary baseline: [successful run 38645921669](https://github.com/so7ob/web/actions/runs/38645921669), Node 24.21.0, npm 10.8.2, Playwright 1.62.1, MariaDB 10.11.18, Ubuntu 24.04, one browser worker. Job timestamps are measured to the second. Individual test durations in the console are rounded, especially minute-long cases; sums of those printed durations are approximate.

| Baseline CI stage | Measured elapsed |
| --- | ---: |
| Entire foundation job, including service setup/cleanup | 44m 34s |
| `npm ci` | 11s |
| lint / TypeScript | 8s / 14s |
| unit/integration tests / build | 87s / 9s |
| worker / file-worker / webhook / auth acceptance | 21s / 8s / 22s / 13s |
| CMS capacity + boundaries | 37s |
| v1 / identity / workflow upgrade rehearsals | 2s / 5s / 13s |
| restore rehearsal / Chromium installation | 20s / 18s |
| complete E2E, 294 passed | **38m 50s** |
| design file: desktop / mobile, summed rounded case times | **approximately 591s / 519s** |
| four #107 browser cases, summed printed times | **27.8s** |

Slowest baseline files after design: account portal 114.0s, admin layout 89.8s, settings/appearance 88.2s, admin navigation 63.5s, identity management 56.2s, CSV download 47.5s, menus 42.5s, workflows 35.6s. These are serial sums across both projects, not parallel wall-clock estimates. Design represents about 47.7% of the baseline E2E step.

The later documentation-only [run 38650995544](https://github.com/so7ob/web/actions/runs/38650995544) completed while this work was underway. It again passed all 294 cases, using **32m 29s** for E2E and **37m 49s** for the job despite having no application/test changes. Its design file summed approximately 904.8s; the next slowest files were account portal 99.3s, admin layout 77.1s, settings/appearance 73.7s and admin navigation 57.3s. The slowest individual cases were desktop EN light/dark (approximately 120s each), followed by desktop AR light/dark (approximately 114s each). This is a useful second baseline and demonstrates substantial runner variation even before optimization; the final comparison includes both runs rather than attributing their difference to this change.

Before changing design behavior, an opt-in timer measured one actual `ar/light/desktop` case on this workstation against a freshly migrated isolated MariaDB. The after observation used the same workstation, tools, source application, matrix cell and fresh separate database. This is a single paired observation, not a statistical flakiness study or a claim about GitHub runner speed.

| Local design case stage | Before | Final implementation `00bf152` |
| --- | ---: | ---: |
| Complete measured case body | 132.527s | **93.151s** |
| Top-document axe, 104 scans | 73.200s | 47.551s |
| Capture readiness, 104 calls | 29.958s | 14.637s |
| Screenshots, 104 full-page PNGs | 12.578s | 14.016s |
| Named page navigations, 53 calls | 4.880s | 5.743s |
| Login, one independent session | 0.295s | 0.321s |
| Preview axe, five independent preview documents | 2.173s | 1.605s |

The final paired case reduced elapsed time by **29.7%**, retaining all 104 views and 53 named navigations. Both observations ran only this single AR/light/desktop case on freshly migrated separate synthetic databases. Intermediate observations of 83.101s and 88.129s preceded the final readiness corrections and are not the final implementation's numbers. The final local mobile EN/light job also passed both cases in 1.7m, including the previously failing client-navigation route. The TLS readiness timer measured 4.077s in a separate smoke run and 4.597s in the final single-case run; the old GitHub log does not expose pure server startup separately from Playwright/configuration/global setup, so no old-server-startup improvement is claimed.

Final hosted before/after stages, complete coverage totals and the documentation-update experiment are recorded below after the corresponding runs complete. **The 5–10 minute target is not established by the local observation above.**

Local raw evidence is ignored synthetic working data under `.migration/ci-performance/`: baseline job/log summaries, before/after per-stage profiles, coverage manifests and command logs. Committed expectations in `tests/e2e/fixtures/design-coverage.json` come from the successful pre-optimization design case. Its source test blob matches both baseline `develop` and the cited #107 CI revision.

All eight successful coverage manifests were also read from the official baseline artifact `11933788555` using ZIP entry sizes/CRC checks. Every locale/theme/viewport cell exactly matches the frozen ordered 104 views and 31 block types, with no recorded browser or assertion errors.

## Changes to design checks

- Preserve every existing test, every locale/theme/viewport cell, every view and tab, every full-page screenshot, all WCAG tags and all existing CSS, keyboard, responsive and authorization assertions.
- The parent document already excludes all iframes and checks sandboxed srcdoc previews independently. Use AxeBuilder's supported `axe.run` mode for that document, avoiding a temporary blank result page for every scan. When frames are in scope, retain the standard cross-frame algorithm. The same pinned axe engine and WCAG 2 A/AA, 2.1 AA and 2.2 AA rules remain active.
- New parity tests compare violation IDs, impacts and targets against the original AxeBuilder path, then mutate the DOM and require a newly correct result. A frame-in-scope comparison protects the cross-frame fallback.
- Replace unconditional `networkidle` capture waits with enabled hydrated theme controls, observed same-origin API completion, absence of visible loaders, ready fonts/images, completed finite animations and rendering frames. A delayed-response regression checks readiness.
- Keep fresh data, independent login and restoration per case: measured login cost is negligible compared with axe/readiness. Do not share mutable sessions, settings, quotas or workflow bindings between cases to save fractions of a second.

## Required suites and triggers

| Change/event | Smoke | Functional | Complete design matrix | Operational rehearsals |
| --- | --- | --- | --- | --- |
| Allowlisted regular Markdown-only PR | documentation validation only | not required | not required | not required |
| Owned request/form/tracking UI | required | request dependencies | required | not required |
| CMS/editor/page/menu/media UI | required | CMS dependencies | required | not required |
| Workflow UI | required, including workflow editor/transitions | workflow cases are in smoke | required | not required |
| Auth, identity, authorization, server, contracts, database, shared UI/translation, infrastructure, scripts/config/test setup, unknown paths or new unclassified spec | required | complete | required | required |
| PR into main, develop/main push, version tag, manual dispatch | required | complete | required | required |

Selection uses the complete PR diff and conservative dependency groups. All server business services are full-suite triggers because they contain ownership/authorization as well as persistence. Account security/profile/session controls, account shared helpers and unrecognized account components also select full coverage; only explicitly listed record views qualify for the request-domain shortcut. New files that cannot be confidently classified select full coverage. Multiple domain edits select the union. No test file is silently omitted because it is absent from an old domain list.

Smoke has eight cases: real login, request creation/persistence, list/detail navigation and cross-owner denial, plus the existing real workflow editor/queue/transition journeys, for AR/EN × desktop/mobile. Full functional coverage uses four shards. The full design matrix uses eight isolated jobs (AR/EN × light/dark × 375/1280), with the existing preference/density cases and new axe/readiness parity cases assigned exactly once. Up to eight design jobs may run concurrently; the first hosted observation used four and exposed a second wave of queued mobile cells despite complete VM/database isolation. All jobs keep `workers: 1` and conflicting cases inside a job remain serial.

Each browser matrix job gets its own GitHub VM/workspace, MariaDB service and loopback server, independently seeded identities/quotas/settings/workflow bindings, TLS files and temporary upload directory. Only immutable compiled application artifacts are shared. No fixtures, cookie storage or runtime data are cached or copied between jobs. The identical database name in each job refers to different isolated database servers. Do not run these jobs concurrently in a shared local checkout/database.

The application is built once. Browser and operations jobs download that build rather than rebuilding it. npm and Chromium caches include OS/architecture, lock hash and pinned tool versions; no broad restore prefix can restore an incompatible browser. Every isolated workspace still performs its own integrity-checked dependency installation. PR concurrency cancels only older runs for the same PR; unrelated branches and PRs have distinct groups.

## Documentation and the stable required gate

Only regular, non-executable `README.md`, `README.en.md` and `docs/**/*.md` are documentation candidates. Scripts, JSON/configuration, skill/agent instructions, symlinks, executable Markdown, unusual/control-character paths and unknown files cannot obtain the docs shortcut. Documentation checks validate UTF-8, nonempty regular files and local links without executing document content.

A docs-only update to an existing application PR cannot merely trust a prior green SHA. It reuses evidence only from a **completed successful** run of this workflow for the same repository/PR/branch, with an ancestor source head, unchanged base SHA, identical actual non-document head and merged checkout fingerprints, identical selected suites and a verified passing coverage proof. Failed, cancelled, expired, unavailable or malformed evidence falls back to application checks. Push/main/release preparation/manual full runs never reuse this shortcut.

The existing check name **Product lint, TypeScript, MariaDB tests and SSR build** remains an always-executed aggregate gate. Every required job must succeed; a failed/cancelled/missing/unexpectedly skipped required job fails it. For browser runs it verifies the exact selected catalog: no missing or duplicate cases, no skipped/expected-failure/retried cases, mandatory bilingual desktop/mobile smoke, and every design matrix cell. A docs-only gate reports that documentation checks passed and any earlier verified application run was reused; it does not claim browser tests executed on that documentation head.

## Coverage retained and added

| Contract | Before | After |
| --- | --- | --- |
| Existing E2E on starting develop | 290 cases | all 290 retained |
| #107 branch-only regressions | four additional cases in cited CI | not imported into this independent PR |
| New smoke | none as a separate small gate | four new journeys + four existing workflow journeys |
| Axe/readiness parity | implicit in original scans | six additional cases |
| Complete current E2E catalog | 290 on develop; 294 in cited #107 CI | 300, with exact ID accounting |
| Design workspace matrix | AR/EN × light/dark × desktop/mobile | all eight cells retained |
| Captured/audited design view labels per cell | 104 in successful pre-change case | frozen sequence required in every cell |
| Rendered block types | all 31 registered types | same 31, frozen against accidental omission |
| WCAG tags, CSS, keyboard, RTL/LTR, responsive checks | existing assertions | retained; parity/readiness checks added |

No existing test is removed. Time is saved by lower execution overhead and safe parallelism, not fewer languages, themes, viewports, screenshots, accessibility rules or business assertions.

The pre-change console catalog was compared with the new complete catalog by project, file and full nested test title: all **290 develop cases** remain, exactly four branch-only #107 cases are absent, and ten cases are added. Both local smoke projects also passed the same final exact-ID coverage gate: eight expected, eight passed (desktop 45.2s; mobile 40.4s).

## Running and measuring

Use a freshly migrated isolated `so7ob_*_test` MariaDB and explicitly set its `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_USER` and synthetic `DATABASE_PASSWORD`. No production `.env`, mail worker or webhook destination is needed. Run one local environment at a time.

```sh
npm run test:ci-policy
CI_DOC_PATHS='["README.md"]' node tools/test/docs-check.mjs
npm run test:e2e                         # unchanged complete serial local suite
SO7OB_E2E_SUITE=full npm run test:e2e:ci  # same complete suite with case/timing accounting
SO7OB_E2E_SUITE=smoke npm run test:e2e:ci # all eight AR/EN desktop/mobile smoke cases
SO7OB_E2E_SUITE=smoke SO7OB_E2E_PROJECT=desktop npm run test:e2e:ci
SO7OB_E2E_SUITE=functional SO7OB_E2E_FILES='["account-portal.spec.ts","files-claims.spec.ts"]' npm run test:e2e:ci
SO7OB_E2E_SUITE=design SO7OB_E2E_PROJECT=mobile SO7OB_E2E_LOCALE=ar SO7OB_E2E_MODE=dark npm run test:e2e:ci
SO7OB_E2E_PROFILE_DIR=.migration/profile npm run test:e2e -- tests/e2e/design-system.spec.ts tests/e2e/accessibility-engine.spec.ts
gh workflow run ci.yml --repo so7ob/web --ref develop
```

For functional subsets, pass the explicit selected spec array from the plan summary; `SO7OB_E2E_SHARD=1/4` is optional when reproducing a particular isolated CI shard. Run local shards sequentially unless each has its own database, checkout, accounts and storage. Operational acceptance commands remain in [CONTRIBUTING.md](../../CONTRIBUTING.md) and the workflow; manual full dispatch includes all of them.

The GitHub manual dispatch always runs full coverage. Before publishing a release, require a successful full run for its exact source through the main promotion/full push gate or explicit dispatch; a docs-only/reused gate is not a substitute. This workflow does not merge, tag, release or deploy anything.

Each browser job uploads case/status/timing JSON and synthetic screenshots; design jobs also upload capture manifests and per-stage timers. Server readiness is timed through the test TLS proxy. Final browser coverage is compared with the build job's complete Playwright catalog. The profile data deliberately excludes request arguments, cookies, tokens and page contents.

## Validation, risks and rollback

Before the first PR commit: 958 existing unit/integration tests passed in 57 files on fresh MariaDB; lint, typecheck, build, independence and infrastructure checks passed; the policy/gate/evidence tests passed; actionlint 1.7.12 validated the workflow; the original and optimized paired design cases passed; engine/readiness parity passed; desktop smoke passed four cases including existing workflows. Complete optimized hosted execution remains a separate required measurement until recorded below.

Risks: conservative selection may run more tests than necessary; GitHub runner limits and cold caches can dominate wall time; eight matrix cells and additional isolated workspaces have setup/runner-minute costs. Reuse is deliberately stricter than content equivalence when the target base changes, and unavailable API/artifact evidence costs a full run. The single paired observation cannot establish absence of flakiness. Full CI results must disclose any failure and queue time rather than conceal it with retries or relaxed thresholds.

During final local validation, an added image-readiness condition incorrectly waited for native lazy images outside the viewport; that attempt failed at the 96th capture. It was corrected to wait for images intersecting the viewport. The readiness regression now also requires success while an offscreen lazy image remains unloaded, and independently holds loading UI after its API response. The failed attempt is not counted as a successful performance measurement.

Rollback is a normal revert of this independent PR: restore the former single-job workflow and capture helper. There are no product migrations or production-data changes. Do not change branch protection or merge the PR automatically.

## Completed hosted comparison

The final source [run 38656630278](https://github.com/so7ob/web/actions/runs/38656630278), head **`00bf152e13fbccc485fa1042474fd448a8354eea`**, passed every required job, **958 unit/integration tests**, 13 policy/evidence/gate tests and **300/300 unique browser cases**, with zero skipped or retried cases. The aggregate checked the complete catalog and emitted a passing proof for the exact source, base and suite selection.

| Measured quantity | Original 38645921669 | Later docs-only 38650995544 | Final 38656630278 |
| --- | ---: | ---: | ---: |
| Entire workflow, creation through completion | 44m48s | 37m51s | **9m57s** |
| Complete browser command interval | 38m50s, serial | 32m29s, serial | **5m46s**, overlapping isolated jobs |
| Executed/passed browser cases | 294/294 | 294/294 | **300/300** |
| Sum of design-system case durations | approximately 1110.3s | approximately 904.8s | **568.816s** |
| Sum of all browser case durations | approximately 2302.5s | approximately 1926.9s | **1623.791s** |
| `npm ci` | 11s | 7s | approximately 10s, warm exact cache |
| lint / TypeScript | 8s / 14s | 5s / 11s | 6s / 13s |
| unit/integration / compilation | 87s / 9s | 71s / 7s | 82s / 9s |
| Sum of job elapsed time, including setup/cleanup | 44m34s | 37m49s | **52m21s** |

The browser interval spans the first Playwright command start through the last command completion; it is not a sum of overlapping jobs. Job elapsed sums are runner occupancy measurements, not a billing statement. Relative to the latest successful baseline, workflow latency fell **73.7%**, the browser interval fell **82.2%**, design-case execution fell approximately **37.1%**, while summed job time **increased 38.4%** because isolation duplicates VM/container/dependency setup. Compared with the user's original run, workflow latency fell 77.8% and summed job time rose 17.5%. This is a latency-versus-runner-cost tradeoff, not a claim that every efficiency metric improved.

Both the later baseline and final run show actual npm cache hits; Node/npm/Playwright/MariaDB and Ubuntu major versions match. Final Node/npm/cache/install setup took 19s compared with 87s in the first cold attempt. Browser setup varied 26–77s across isolated VMs, including cached packages/browser restoration and required OS libraries. GitHub host variation remains visible, and the baseline has the four independent #107 cases described above. A single passing full run at 9m57s is evidence for that run; the usual affected-PR 5–10 minute distribution and a passing cold-cache full run have **not** been independently established.

Final phase/job times: selection 5s; build/validation 2m52s; operations 2m40s; smoke desktop/mobile 1m55s/2m06s (Playwright commands 42s/38s); functional jobs 6m36s, 4m34s, 6m21s and 4m17s (commands 5m39s, 3m14s, 5m24s and 3m04s); individual design jobs 1m47s–3m16s (commands 59s–100s); stable aggregate 12s. These phases overlap after build and must not be added as if serial.

All eight final design cells captured and audited the frozen **104 views / 31 block types**. Their measured work includes 832 parent-document axe scans (293.958s summed), 832 capture readiness checks (90.087s), 832 PNG captures (77.961s), 424 named navigations (31.937s), 40 preview audits (10.840s) and eight independent logins (2.654s). Fourteen measured loopback TLS server starts ranged 1.990–3.512s, mean 3.008s; the old pure startup time remains unavailable.

The slowest final files were design 568.816s, account portal 112.000s, admin layout 85.330s, settings/appearance 63.641s and admin navigation 62.298s, summed across projects. The slowest individual cases were desktop EN/light design 84.135s, desktop AR/dark 78.435s, desktop AR/light 74.971s and mobile EN/dark 70.617s. The remaining critical path is functional shard 1: Playwright's file/test-count partition gives it 339s versus 184–324s for the other shards. Duration-aware partitioning could improve balance later; it was not introduced without a separate measured design, and coverage was not reduced to shorten that shard.

The first complete optimized [run 38655206553](https://github.com/so7ob/web/actions/runs/38655206553), head `9d259f9`, **failed**: 299 browser cases passed and one mobile EN/light design case failed. A new readiness check bound a visible theme-control locator, then waited for that element after client navigation legitimately replaced the header with the 404 screen. The stable required aggregate gate also failed, demonstrating that a required matrix failure cannot produce a green result. No retry or skipped case was used.

The corrected readiness condition waits until visible disabled controls hydrate **or are removed by the destination route**. Its regression removes an old disabled control during a held navigation response and keeps the destination loading UI visible afterward; all six local engine/readiness cases passed on desktop/mobile. Account security/session/shared paths were also explicitly promoted to full-suite selection, with negative selection cases; the eight fully isolated design cells can now run together instead of waiting in two groups of four. A new complete hosted run is required for these source/configuration changes.

The new readiness regression was also run against the actual helper source from `9d259f9` in a local ignored test configuration: Playwright exited **1 as expected**, specifically at `toBeEnabled` because the removed header element no longer existed. The current helper passed the same fixture in the six-case desktop/mobile run. Selection negatives likewise return incorrect `affected` with the old policy and correct `full` with the new policy for account security, shell, API and an unknown account view.

For the failed first observation only: total workflow elapsed was 12m47s, including waiting behind the superseded run. Build took 4m00s (87s cold dependency setup, 83s unit/integration, 9s compilation). The slowest functional shard took 7m12s, including 5m44s in Playwright; the other Playwright shard steps took 3m56s, 4m11s and 4m20s. Operational acceptance took 2m30s. These are diagnostic timings, **not a passing performance result**. A 5–10 minute ordinary PR gate remains unproven until a comparable passing measurement is available.
