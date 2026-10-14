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

Before changing design behavior, an opt-in timer measured one actual `ar/light/desktop` case on this workstation against a freshly migrated isolated MariaDB. The after observation used the same workstation, tools, source application, matrix cell and fresh separate database. This is a single paired observation, not a statistical flakiness study or a claim about GitHub runner speed.

| Local design case stage | Before | First optimized observation |
| --- | ---: | ---: |
| Complete measured case body | 132.527s | 83.101s |
| Top-document axe, 104 scans | 73.200s | 43.133s |
| Capture readiness, 104 calls | 29.958s | 12.013s |
| Screenshots, 104 full-page PNGs | 12.578s | 12.807s |
| Named page navigations, 53 calls | 4.880s | 4.997s |
| Login, one independent session | 0.295s | 0.303s |
| Preview axe, five independent preview documents | 2.173s | 1.501s |

The paired case reduced elapsed time by approximately 37.3%; screenshots and navigations were retained. Additional explicit visible-image and finite-animation readiness conditions were added after this first observation; final run profiles must be used for the final implementation's numbers. The TLS readiness timer measured 4.077s in a separate smoke run; the old GitHub log does not expose pure server startup separately from Playwright/configuration/global setup, so no old-server-startup improvement is claimed.

Final hosted before/after stages, complete coverage totals and the documentation-update experiment are recorded below after the corresponding runs complete. **The 5–10 minute target is not established by the local observation above.**

Local raw evidence is ignored synthetic working data under `.migration/ci-performance/`: baseline job/log summaries, before/after per-stage profiles, coverage manifests and command logs. Committed expectations in `tests/e2e/fixtures/design-coverage.json` come from the successful pre-optimization design case. Its source test blob matches both baseline `develop` and the cited #107 CI revision.

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

Selection uses the complete PR diff and conservative dependency groups. All server business services are full-suite triggers because they contain ownership/authorization as well as persistence. New files that cannot be confidently classified select full coverage. Multiple domain edits select the union. No test file is silently omitted because it is absent from an old domain list.

Smoke has eight cases: real login, request creation/persistence, list/detail navigation and cross-owner denial, plus the existing real workflow editor/queue/transition journeys, for AR/EN × desktop/mobile. Full functional coverage uses four shards. The full design matrix uses eight isolated jobs (AR/EN × light/dark × 375/1280), with the existing preference/density cases and new axe/readiness parity cases assigned exactly once. All jobs keep `workers: 1` and conflicting cases inside a job remain serial.

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

## Running and measuring

Use a freshly migrated isolated `so7ob_*_test` MariaDB and explicitly set its `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_USER` and synthetic `DATABASE_PASSWORD`. No production `.env`, mail worker or webhook destination is needed. Run one local environment at a time.

```sh
npm run test:ci-policy
npm run test:e2e                         # unchanged complete serial local suite
SO7OB_E2E_SUITE=full npm run test:e2e:ci  # same complete suite with case/timing accounting
SO7OB_E2E_SUITE=smoke SO7OB_E2E_PROJECT=desktop npm run test:e2e:ci
SO7OB_E2E_SUITE=design SO7OB_E2E_PROJECT=mobile SO7OB_E2E_LOCALE=ar SO7OB_E2E_MODE=dark npm run test:e2e:ci
SO7OB_E2E_PROFILE_DIR=.migration/profile npm run test:e2e -- tests/e2e/design-system.spec.ts
gh workflow run ci.yml --repo so7ob/web --ref develop
```

The GitHub manual dispatch always runs full coverage. Before publishing a release, require a successful full run for its exact source through the main promotion/full push gate or explicit dispatch; a docs-only/reused gate is not a substitute. This workflow does not merge, tag, release or deploy anything.

Each browser job uploads case/status/timing JSON and synthetic screenshots; design jobs also upload capture manifests and per-stage timers. Server readiness is timed through the test TLS proxy. Final browser coverage is compared with the build job's complete Playwright catalog. The profile data deliberately excludes request arguments, cookies, tokens and page contents.

## Validation, risks and rollback

Before the first PR commit: 958 existing unit/integration tests passed in 57 files on fresh MariaDB; lint, typecheck, build, independence and infrastructure checks passed; the policy/gate/evidence tests passed; actionlint 1.7.12 validated the workflow; the original and optimized paired design cases passed; engine/readiness parity passed; desktop smoke passed four cases including existing workflows. Complete optimized hosted execution remains a separate required measurement until recorded below.

Risks: conservative selection may run more tests than necessary; GitHub runner limits and cold caches can dominate wall time; eight matrix cells and additional isolated workspaces have setup/runner-minute costs. Reuse is deliberately stricter than content equivalence when the target base changes, and unavailable API/artifact evidence costs a full run. The single paired observation cannot establish absence of flakiness. Full CI results must disclose any failure and queue time rather than conceal it with retries or relaxed thresholds.

Rollback is a normal revert of this independent PR: restore the former single-job workflow and capture helper. There are no product migrations or production-data changes. Do not change branch protection or merge the PR automatically.

## Completed hosted comparison

Pending actual execution; no 5–10 minute gate or full-suite speed claim is made yet.
