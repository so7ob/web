# سُحُب — web

Independent migration of [so7ob/Website](https://github.com/so7ob/Website), preserving its identity, functionality, permissions, content and links.

Source baseline: `5321b7fd11db421c83290b262f276811e5f04e5f`.
Architecture reference only: [so7ob/Rakim](https://github.com/so7ob/Rakim) at `cae0950bac45d97971bd3766c8c34f9869a856af`.

Implementation status: partial migration under review, **not a replacement release**. The target runtime, data-transfer tools, durable mail worker, server authentication and public/authentication presentation are implemented. Public submissions and account conversation/profile/draft/notification APIs are also implemented. Claims/files, admin APIs, private screens and the full editor remain unfinished. Source repositories and their deployments remain unchanged.

All implementation, documentation, issues and pull requests belong exclusively to `so7ob/web`. See [CONTRIBUTING.md](CONTRIBUTING.md).

Existing source copyright, brand ownership and third-party notices remain applicable. The so7ob name and logo belong to سُحُب التقنية; IBM Plex fonts retain their OFL notices.

## Isolated development

Use Node 24.21.0, npm 10.8.2 and MariaDB 10.11.18. Copy `.env.example` to an untracked `.env`, configure a dedicated local database and independent random AUTH_SECRET/OUTBOX_KEY values, then run:

```sh
npm ci
npm run db:migrate
npm run build
npm run dev
```

An empty schema has no published content. Import only an authorized isolated SQLite/files snapshot using the [data-transfer guide](docs/migration/data-transfer.md); do not connect to Website production. See [architecture](docs/migration/architecture.md), [authentication](docs/migration/authentication.md), [public/auth UI acceptance](docs/migration/public-and-auth-ui.md), and [worker/operations](docs/migration/worker-and-operations.md). Tests require separate isolated databases; browser tests require a `so7ob_*_test` database and installed Playwright Chromium.
