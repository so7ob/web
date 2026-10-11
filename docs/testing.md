# Verification from a clean checkout

Use only this repository, `.node-version` (Node 24.21.0), npm 10.8.2 and `package-lock.json`. No `reference/`, historical checkout, Website/Rakim clone or `.migration/reference` is needed. `.migration/` is disposable local test output; each suite creates its own fixtures. Do not copy another developer's `.env`, database or uploads.

## Isolated services

The canonical CI setup is `.github/workflows/ci.yml`: MariaDB **10.11.18**, Chromium/Playwright, `mariadb`/`mariadb-dump`, `tar`, `openssl`, `nginx` and `systemd-analyze`. MariaDB must use `max_allowed_packet=268435456` for CMS boundary stress. Configure only a separately owned test instance, never a development/production server shared with other applications. The CMS preflight explicitly rejects 16MiB in CI before configuring the isolated service to 256MiB.

Create fresh empty databases (UTF-8 defaults are also set by migrations): `so7ob_verify_unit_test`, `so7ob_verify_ops_test`, `so7ob_verify_browser_test`, and `so7ob_verify_init_test`. Give a test account access to those databases; `test:restore` additionally requires creating new `so7ob_restore_*_test` databases. CI uses the root account of its disposable service for restoration, not production credentials. Keep the browser database separate from worker/auth/webhook/CMS suites so leftover synthetic queues cannot interfere.

Set connection variables explicitly in the invoking shell, using credentials for that isolated instance only:

```sh
export DATABASE_HOST=127.0.0.1 DATABASE_PORT=3306
export DATABASE_USER=YOUR_TEST_USER DATABASE_PASSWORD=YOUR_TEST_PASSWORD
export DATABASE_NAME=so7ob_verify_unit_test TEST_DATABASE_NAME=so7ob_verify_unit_test
export NODE_ENV=test TZ=Asia/Aden
npm ci
npm run db:migrate
npm run lint
npm run typecheck
npm test
npm run build
npm run test:independence
```

Do not source the developer `.env` for these suites. npm migration commands have `--env-file-if-exists=.env`; these explicitly exported variables take precedence. A clean checkout has no `.env`. Generate independent `AUTH_SECRET` and `OUTBOX_KEY` when initializing development; browser/worker suites generate their own synthetic keys and must share them only within their owned processes.

## Maintenance and browser acceptance

```sh
export DATABASE_NAME=so7ob_verify_ops_test
npm run db:migrate
npm run test:worker
npm run test:file-worker
npm run test:webhook
npm run test:auth
npm run db:check-cms
npm run test:cms-boundaries
RESTORE_REHEARSAL=synthetic-only NODE_ENV=test npm run test:restore

export DATABASE_NAME=so7ob_verify_browser_test
npm run db:migrate
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:infra
git diff --check
```

`test:restore` packages the built workspaces, locked dependencies, `apps/web/public` and `ops`, restores to new synthetic databases/files, and starts the recovered API and worker from that release. It verifies every public file, stylesheet and bundled font by HTTP and SHA-256; dependency symlinks must remain within the recovered release. API loads SSR from `apps/web/dist/server`, JS/CSS from `apps/web/dist/assets`, and static URLs from `apps/web/public`. This is host-local synthetic recovery, not proof of off-host disaster recovery or production data migration. The regular maintenance CLIs run from the complete checkout; the offline runtime bundle contains compiled runtime files, not the source-oriented npm development CLIs.

Browser suites create their fixture outputs under `.migration/e2e`, block unintended external services, and run ar/en at 375/1280 with authorization, keyboard, axe and sensitive mutation journeys. No source application is running alongside the product. Do not turn failures into skips or retries to pass a cleanup.

## Independent first setup

With `NODE_ENV=development`, a separate empty `so7ob_verify_init_test` database, a writable absolute `DATA_DIR`, loopback `SITE_URL`/`WEB_ORIGIN`, and separately generated secrets, follow [local development](migration/local-development.ar.md): `db:migrate`, `site:init -- --database=so7ob_verify_init_test --confirm-empty`, `admin:create -- --database=so7ob_verify_init_test --email=admin@example.invalid --name="Synthetic admin"`, build, start API and `start:worker` separately. The account command prints a random password once; do not put it in evidence or Git. Initialization rejects an occupied site. All current TypeORM migrations remain under `packages/server/src/database/migrations`.
