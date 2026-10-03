# سُحُب — web

Independent migration of [so7ob/Website](https://github.com/so7ob/Website), preserving its identity, functionality, permissions, content and links.

Source baseline: `5321b7fd11db421c83290b262f276811e5f04e5f`.
Architecture reference only: [so7ob/Rakim](https://github.com/so7ob/Rakim) at `cae0950bac45d97971bd3766c8c34f9869a856af`.

Implementation status: partial migration under review, **not a replacement release**. The target runtime, data-transfer tools, durable mail worker, server authentication and public/authentication presentation are implemented. Public submissions and account conversation/profile/draft/notification APIs are also implemented. Private file/media and prior-request claim APIs, plus the nine client portal screens, are implemented in subsequent stacked portions. Administrative routes/APIs and the original full page editor are now ported, with dedicated MariaDB and browser checks. Complete administrative visual/performance comparison and the remaining operational acceptance gates are still pending; this does not establish full migration parity. Source repositories and their deployments remain unchanged.

All implementation, documentation, issues and pull requests belong exclusively to `so7ob/web`. See [CONTRIBUTING.md](CONTRIBUTING.md).

Existing source copyright, brand ownership and third-party notices remain applicable. The so7ob name and logo belong to سُحُب التقنية; IBM Plex fonts retain their OFL notices.

## Isolated development

Use Node 24.21.0, npm 10.8.2 and MariaDB 10.11.18. Copy `.env.example` to an untracked `.env`, configure a dedicated local database and independent random AUTH_SECRET/OUTBOX_KEY values, then run:

```sh
npm ci
npm run db:migrate
# For a new EMPTY local development site only (substitute DATABASE_NAME):
npm run site:init -- --database=so7ob --confirm-empty
npm run admin:create -- --database=so7ob --email=you@example.com --name="مدير النظام"
npm run build
npm run dev
```

An empty schema has no published content or users: `db:migrate` creates the schema only. For a fresh local development site, `site:init` installs the original seven bilingual public pages, menus and settings; it refuses to touch an existing site. `admin:create` creates the first local administrator with a random password printed once. Neither command imports production data. Both require `NODE_ENV=development`, loopback MariaDB and the explicit database name matching `.env`. Do not rerun `site:init` to repair an existing site.

تفاصيل التشغيل وإنشاء حساب المدير: [دليل التطوير المحلي بالعربية](docs/migration/local-development.ar.md). After creation, sign in at `/ar/auth/login` and open `/ar/admin`. An existing administrator invites additional users through the authenticated user administration screen; the bootstrap command refuses a second administrator or an existing email and never replaces passwords.

For a data migration instead of a fresh development site, import only an authorized isolated SQLite/files snapshot using the [data-transfer guide](docs/migration/data-transfer.md); do not connect to Website production and do not run the initialization commands against imported content/accounts. See [architecture](docs/migration/architecture.md), [authentication](docs/migration/authentication.md), [public/auth UI acceptance](docs/migration/public-and-auth-ui.md), and [worker/operations](docs/migration/worker-and-operations.md). Tests require separate isolated databases; browser tests require a `so7ob_*_test` database and installed Playwright Chromium.
