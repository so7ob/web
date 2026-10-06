# Independent Website migration

Tracking: [parent #1](https://github.com/so7ob/web/issues/1). Phase issues are recorded in `issues.json`.

Current source refresh: Website/main `dddf8cd00a19cf7d562f503549f4c000109057d1`, directly verified on 2026-10-04. [Refresh inventory, isolated reference and inherited migration failure](source-refresh.md). The new source has substantial changes not yet ported; historical counts and evidence below do not establish parity with it.

Source: Website/main `5321b7fd11db421c83290b262f276811e5f04e5f`. Technical reference: Rakim/main `cae0950bac45d97971bd3766c8c34f9869a856af`; develop `8b50b222185c60d9d06af8417f77765dada1bb8b` was inspected separately, not imported.

`import-manifest.json` records source paths, SHA-256, destination mappings and exclusions. Imported source instructions, README, original ignore rules and CI/deployment configuration are retained under `source/`; destination instructions take precedence. Old audit reports concern earlier SHAs and are historical, not evidence for this migration.

## Gates and status

- A: source imported; isolated build, 133 tests, 40 browser captures and repeated read-performance baseline passed. Full behavior/SQL profiling remains required for final parity.
- B: target workspaces/Node/Nest/Vite SSR/MariaDB foundation implemented; [PR #9](https://github.com/so7ob/web/pull/9).
- C: explicit 23-model schema and SQLite/files transfer/verification/restart/backup tooling ([PR #10](https://github.com/so7ob/web/pull/10)); server authentication and encrypted account mail ([PR #12](https://github.com/so7ob/web/pull/12)). Submission/account request/inquiry/profile/draft/notification services are implemented in the next stacked portion; see [business services](business-services.md). Claims/files are implemented in [PR #15](https://github.com/so7ob/web/pull/15), whose reference and target CI passed. Administrative operations are ported with scoped checks; see [administration and editor](administration-and-editor.md).
- D: public and authentication presentation implemented with scoped browser/visual/performance evidence; see [details and limitations](public-and-auth-ui.md). The original public request form now submits to real services. The nine client portal screens are ported in the next stacked portion; see [client portal](client-portal.md). Administrative screens and the original full editor are ported with scoped checks; complete visual/performance acceptance remains open.
- E: durable mail worker and Nginx/systemd checks implemented ([PR #11](https://github.com/so7ob/web/pull/11)); full operational restore/cutover rehearsal and remaining job integrations pending.
- F: full parity, all-role journeys, complete SQL/concurrency/load acceptance and final rollback rehearsal are pending. No migration completion claim. The original source files at root remain transitional reference material.
- PRs #8–#17 were merged into develop on 2026-10-03 following the explicit merge request; each latest CI was checked. At that checkpoint, later work remained on issue branches and no main merge or deployment had occurred. Subsequent authorized merges/releases are recorded below. CI success is reported per PR, not inferred for later commits.
- Production data/files have not been inspected, copied or migrated. Local synthetic data only.
- No source repository, branch, configuration, issue, PR or deployment was changed.

## Local startup

[Arabic local startup and first administrator guide](local-development.ar.md) explains schema migration, optional non-destructive content initialization for an empty development site, and `admin:create`. Neither command migrates production data.

## Frozen acceptance budgets

Before target implementation: stable screenshot differing pixels <=0.5%, with human review of layout/focus/typography; no new axe violations; p50/p95 regression <=max(10%,20ms), repeated five times on equal fixtures/environment/workloads; initial compressed JavaScript increase <=5%; no new N+1 query growth. Historical source defects are recorded separately, not silently accepted as target regressions.

## Cutover decisions

One-time re-login is accepted. Preserve accounts, bcrypt hashes, token hashes, original expiry/use and all records/files. Full rollback is permitted only before write access reopens. Afterwards recover forward while retaining MariaDB, files and queue state. No production cutover, main merge or release is authorized by this work. New PRs require separate merge authorization.

## Baseline isolation

The pinned source is archived without `.git` under ignored `.migration/reference/Website`; Rakim is separately archived under `.migration/reference/Rakim`. Only the Website snapshot is executable. `DATABASE_URL` points to `.migration/baseline/data/reference.db`; uploads use that independent DATA_DIR. Never copy source `.env`, original database or private uploads. Tooling and synthetic evidence remain within the destination workspace.

`tools/migration/fixture.mjs` populates only that fixed synthetic database after applying source migrations and seed-content. `tools/migration/capture-baseline.mjs` captures both languages, mobile/desktop, role views, HTML contracts and axe results against loopback port 3107 with external browser requests blocked. Screenshots are observations, not yet complete interaction acceptance tests.

The next stacked phase C portion ports private attachments, public/admin media, durable physical file cleanup and prior-request ownership claims. See [files and claims](files-and-claims.md) for server authorization, transactional proof consumption, tests and explicit remaining scope. This does not establish complete migration or operational restore acceptance.

User-administration APIs now have a separate [implementation and verification record](user-administration.md). Administrative operations/screens and CMS/editor now have a separate [implementation record](administration-and-editor.md), with final parity gates still pending.

The source v2 schema and both-generation data transfer implementation are recorded in [source-schema-v2.md](source-schema-v2.md). Business/UI parity remains independently tracked.

- [شجرة المحتوى والعرض المنشور وحدود النقل](content-tree.md).

- دمج المستخدم #23 و#24 إلى develop عند `68b92209e8fe134451ea0d93d841183d01543239` في 2026-10-04 (Asia/Aden). main ما زال عند إصدار v1.0.0 السابق؛ لا إصدار جديد في هذا الجزء.
- [خدمات قوالب الصفحات وعقودها واختباراتها](page-templates.md).

- [إعدادات المسودة والنشر والجدولة](cms-publication.md).

- [محرر شجرة المحتوى ورحلاته واستثناءات السلامة](tree-editor.md).

تحديث التتبع: [tracking.md](tracking.md) يوثق نقل الروابط والسياسات والبريد والمرفقات فوق PR #27، مع اختبارات الأمن وحدود القبول. CI لطلب #27 نجح على `8c1868bc1fdb1d83fc57d86cb8a95bf3885861c5` في [التشغيل 37169851643](https://github.com/so7ob/web/actions/runs/37169851643)؛ هذه النتيجة لا تُنسب إلى commits لاحقة.

- [تجربة الاستعادة التشغيلية وفحص مفتاح الطابور](operational-restore.md): الكود والبيانات والملفات والجلسات والعامل على بيانات اصطناعية؛ حدود الاستعادة خارج المضيف والإنتاج موثقة.

- [حدود CMS قبل التطبيع وبعده وحد الطلب وMariaDB packet](cms-boundaries.md).
