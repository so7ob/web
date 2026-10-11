# Verification and running preview

## Source and runtime provenance

- Issue: https://github.com/so7ob/web/issues/70. Branch: `feat/70-audit-investigation`, based on `develop` at `65dba5f99c46f76f7c70aa8ee283921077b22945`.
- Main implementation: `24d1d12782874b41e6f5b1142cf0d39e2cbf359e`. Authorized private-directory download fix and its browser fixture: `26f46b7fd49c789e53e4bfaaa0ed66b59e05b614`.
- Shared transport types: `6f0baac67e2d142f118f6deccb6bee579b5074a9`; final sensitive custom-role grants and additional permission/time tests: `54b8921d94b4c4d4a774a3c8a294cdc01916c071`.
- Node `24.21.0`, npm `10.8.2`, MariaDB `10.11.18`, Linux, four visible Intel Xeon E-2176M CPUs, about 15.6 GiB RAM. Browser acceptance: Chromium via Playwright 1.62.1.
- Existing 3108 was observed initially as PID 251701/build a92f7d0 with the same source tree as the baseline. Its process/build changed independently during the session; the later observed PID was 426355 and the final observed PID is 473812. No acceptance claim uses that service, and this task did not intentionally stop it. All artifact paths/build-info for acceptance are separate.
- Live preview: **https://127.0.0.1:3213/ar/admin/audit** and **https://127.0.0.1:3213/en/admin/audit**; loopback TLS certificate is local/self-signed. API upstream is 3214. Source/build directory: `.migration/audit-implementation/scratch/review`; build-info reports `54b8921…`, dirty=false. Runtime process details are in `evidence/runtime.json`.
- Private synthetic credentials: `.migration/audit-implementation/live/login.json` (0600, ignored). Runtime environment: `live/runtime.env` (0600, ignored); this account has SELECT/INSERT only on AuditLog and no schema-wide ALL grant. Migration/fixture setup uses a different account. The database is `so7ob_audit70_live_test`; private API/worker files share `live/data`.
- These processes are local review services, not installed systemd units or a production deployment. Scratch builds are on an owned tmpfs and require rebuilding after host restart. Source code, tests and documentation are durable Git changes; `.migration` is not a production source.

## Gates

All commands retain their normal assertions and thresholds. `lint` is ESLint, independently of TypeScript. Logs under `.migration/audit-implementation/` are ignored local records; sanitized summaries below and JSON/PNG/PDF evidence are reviewable in Git.

| Check | Result | Source / evidence |
|---|---|---|
| `npm run lint` | PASS, zero warnings | lint-release.log; final source |
| `npm run typecheck` | PASS | typecheck-release.log |
| `npm test` | PASS: 49 files, 894 tests | test-release.log; fresh `so7ob_audit70_finish_test`, without supplied AUTH_SECRET/OUTBOX_KEY (test owns synthetic cursor key) |
| Focused MariaDB audit integration | PASS: 16 tests | audit-complete.log and full test-release.log; transaction/cursor/redaction/review/report/rules/retention/snapshot cases |
| `npm run build` | PASS | build-final.log at 24d1d12; build-review.log at 54b8921; independent workspaces/build output |
| `npm run test:e2e` full suite | RUNNING at documentation draft | e2e-release.log, build 6f0baac, isolated final-browser database, ports 3221/3222; the earlier 24d1d12 full run was interrupted at 174 and is not a pass |
| Audit browser delta after download fix | PASS: 8 tests | e2e-review.log, build 54b8921, separate database, ports 3231/3232; DATA_DIR deliberately under a dot-directory |
| `npm run test:infra` | PASS | infra-final.log; Node/Nginx/systemd syntax only, no service deployment |
| `npm run test:independence` | PASS | independence-final.log; 2,420 imports / 338 archived files |
| `npm run test:worker` | PASS | worker-final.log; real kill/restart, uncertain SMTP not resent, monitor authorization |
| `npm run test:file-worker` | PASS | file-worker-final.log; expired lease and actual file removal, restart idempotency |
| `npm run test:webhook` | PASS | webhook-final.log; real HTTP and SIGKILL recovery, no ambiguous resend |
| `npm run test:auth` | PASS | auth-review.log on 54b8921; compiled Nest routes, CSRF, secure cookies, ownership, tokens and suspension/logout |
| `npm run test:cms-boundaries` | PASS on dedicated MariaDB 3317 | cms-candidate-final.log; final candidate service, 256 MiB packet; global settings of the existing MariaDB were not changed |
| `npm run test:restore` | PASS on 26f46b7 | restore-final.log and restore.json: independent release, all tables/files/keys, API/SSR/worker and post-open recovery |
| Runtime append-only grants | PASS | runtime-review.log and actual live restricted runtime; UPDATE/DELETE/ALTER denied, transaction INSERT/rollback works |
| `git diff --check` | PASS for implementation commits | Repeated for documentation before delivery |
| GitHub Actions | Not yet observed for PR | Local results are not a CI claim |

## End-to-end acceptance

`evidence/live-acceptance.json` records build 54b8921 and the real loopback API and independent worker, using restricted runtime credentials. Priority normal→high and status new→in_review produce exactly two matching resource events with server correlation IDs. Details contain the correct before/after. Resource timeline finds both. A separate case and note preserve the evidence. A worker-generated JSON report includes exactly those two events and its SHA-256 matches the manifest. Enabling the administrative-role rule and changing an actual synthetic user's role produces an alert; the user's role is restored afterward. API and worker probes report healthy. An additional MariaDB test grants audit.export through a custom role while suspending the target, modifies that role afterward, and verifies one alert from the historical permission snapshot. A different authorized reporter is denied another owner’s report; withdrawing sensitivity and then export permissions also denies download. The client account gets 403 for evidence, cases, report download and health, and for the search request.

The browser suites additionally exercise the same journey through AR/EN UI, independent flags/reviews, failed refresh and retry, direct event links, Escape/focus return, no whole-page horizontal overflow, axe WCAG A/AA, and printable HTML/Save PDF. Separate rule-management browser tests enable a rule through the real form, follow an alert to the event and print a real server-generated report.

## Visual evidence

- `before-{ar,en}-{375,1280}.png`: actual old UI built from a separate `git archive 65dba5f…` and isolated baseline database. Its source archive, rather than the enclosing checkout's automatic build label, identifies the comparison source.
- `after-{ar,en}-{mobile,desktop}.png`, `detail-*`, `print-{ar,en}.png/pdf`: captured by the actual audit browser tests. Final delta captures are from build `54b8921…` (375 and 1280 CSS pixels). Print artifacts are actual HTML report output, not a design mockup.
- `live-ar-1280.png`: the separately running restricted-account preview.
- Preliminary `initial-preview-*` screenshots were moved to ignored local evidence; they are not baseline comparisons.

## Performance and large reports

Budget before measurement: service/database P95 list/detail ≤500 ms, complete stats ≤1 second, additional transaction latency ≤50 ms. This is a host-local warm-cache benchmark (30 samples after three warmups), not an HTTP load/soak test or a million-event capacity claim.

`performance-representative.json` uses 100,000 synthetic events with the writer's limited historical identity shape. P95: first page plus complete stats **238.8 ms**, cursor page plus stats **196.4 ms**, resource filter **6.38 ms**, detail **1.44 ms**. Old deep OFFSET was **891.4 ms**; the old first-page-only query was 4.49 ms and did not compute equivalent statistics. Transaction P95 was 0.80 ms without audit versus 1.82 ms with audit/outbox. Reported storage is about 52 MB data/59 MB indexes, process RSS 324 MB. EXPLAIN selects `audit_resource` for the resource filter.

The initial reference search used substring matching (P95 699.5 ms), exceeding the 500 ms list target. The final recognized-reference prefix path uses `audit_reference`; `reference-search.json` reports P95 **9.68 ms**. Arbitrary name/action substring search still requires bounded scans; it has no claim of the same indexed latency. Broad queries should use a time/resource filter on larger data. The earlier `performance.json` intentionally retains an oversized actor-snapshot fixture result; it is a stress diagnostic and is **not** the representative success result.

`large-reports.json`: actual compiled worker generated JSON and CSV of **100,000 events / 1,000 distinct resources** each, 79,142,338 and 34,353,191 bytes, with verified counts/checksums; four worker invocations took 40.08 seconds total. Two large-export alerts reference the original completion evidence. It did not send external notifications. Performance artifacts were measured on the pre-commit implementation; the final changes include indexed reference search and safe private-directory serving, not a claim that those earlier files identify a clean Git SHA.

## Migration, recovery, failures and limits

`upgrade.json` comes from the pinned old schema with synthetic legacy evidence: migration preserves ID/date/details, returns schema 0/unknown/unrecorded history, and redacts the nested secret. No existing user database was reset. Runtime grants were tested separately from the administrative fixture account.

Retained failed attempts informed fixes: reserved SQL column naming/collation in the initial migration; shared fixture mail jobs interfering with queue tests (the audit fixture now deletes only its own mail); an initial restore copy with workspace symlinks (corrected using an independent dependency copy); browser printing context setup; and Express refusing a private dot-directory report path (fixed and rechecked in real HTTP). No check was weakened. The CMS preflight initially rejected the host's small packet setting; its successful run used a separate local MariaDB configured for the existing stress contract.

Temporary space was expanded using a task-owned tmpfs, without deleting other work or old evidence. The final restore rehearsal requires at least 3 GiB headroom and copies a real independent built release, database tables, files and keys; it does not establish off-host disaster recovery.

Operational limitations remain explicit in [architecture.md](architecture.md) and [runbook.md](runbook.md): no external signing/storage integration or outbound alerts, no production provisioning, platform-wide redacted access rather than invented tenants, bounded workspace lists/simulations, live-browsing consistency, and potential loss of post-response attempt evidence if the process dies before the separate write. Successful evidence commits transactionally. No ISO/SOC or tamper-proof claim is made.
