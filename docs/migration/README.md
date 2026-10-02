# Independent Website migration

Tracking: [parent #1](https://github.com/so7ob/web/issues/1). Phase issues are recorded in `issues.json`.

Source: Website/main `5321b7fd11db421c83290b262f276811e5f04e5f`. Technical reference: Rakim/main `cae0950bac45d97971bd3766c8c34f9869a856af`; develop `8b50b222185c60d9d06af8417f77765dada1bb8b` was inspected separately, not imported.

`import-manifest.json` records source paths, SHA-256, destination mappings and exclusions. Imported source instructions, README, original ignore rules and CI/deployment configuration are retained under `source/`; destination instructions take precedence. Old audit reports concern earlier SHAs and are historical, not evidence for this migration.

## Gates and status

- A: source imported; isolated build, 133 tests, 40 browser captures and repeated read-performance baseline passed. Full behavior/SQL profiling remains required for final parity.
- B–F: target runtime, migration, UI, worker, infrastructure and final acceptance remain pending.
- Production data/files have not been inspected, copied or migrated. Local synthetic data only.
- No source repository, branch, configuration, issue, PR or deployment was changed.

## Frozen acceptance budgets

Before target implementation: stable screenshot differing pixels <=0.5%, with human review of layout/focus/typography; no new axe violations; p50/p95 regression <=max(10%,20ms), repeated five times on equal fixtures/environment/workloads; initial compressed JavaScript increase <=5%; no new N+1 query growth. Historical source defects are recorded separately, not silently accepted as target regressions.

## Cutover decisions

One-time re-login is accepted. Preserve accounts, bcrypt hashes, token hashes, original expiry/use and all records/files. Full rollback is permitted only before write access reopens. Afterwards recover forward while retaining MariaDB, files and queue state. No production cutover, merge or release is authorized by this work.

## Baseline isolation

The pinned source is archived without `.git` under ignored `.migration/reference/Website`; Rakim is separately archived under `.migration/reference/Rakim`. Only the Website snapshot is executable. `DATABASE_URL` points to `.migration/baseline/data/reference.db`; uploads use that independent DATA_DIR. Never copy source `.env`, original database or private uploads. Tooling and synthetic evidence remain within the destination workspace.

`tools/migration/fixture.mjs` populates only that fixed synthetic database after applying source migrations and seed-content. `tools/migration/capture-baseline.mjs` captures both languages, mobile/desktop, role views, HTML contracts and axe results against loopback port 3107 with external browser requests blocked. Screenshots are observations, not yet complete interaction acceptance tests.
