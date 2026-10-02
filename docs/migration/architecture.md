> Historical foundation-stage report. Later implemented portions and remaining acceptance work are recorded in [authentication](authentication.md), [worker/operations](worker-and-operations.md), and [public/auth UI](public-and-auth-ui.md). Counts and unfinished items below describe that earlier commit.

# Runtime foundation — phase B (#3)

Predecessor: PR #8 / `a2dc18cff582159ef14b66250d600aa8307918cf`. This is a stacked branch; no PR has been merged.

## Decisions

- npm workspaces with Node 24.21.0/npm 10.8.2. API and worker compile with TypeScript project references; Vite emits browser and SSR bundles. No database model or ORM is imported by the browser. Contracts expose publication DTOs, while persistence shapes remain server-private.
- NestJS 12/Express 5 hosts REST, Swagger and Vite SSR; no fourth production server. Dynamic publication reads and `Cache-Control: no-store` avoid stale CMS HTML. Public projection explicitly excludes drafts/internal metadata.
- TypeORM 1.1.1 uses mysql2 and real MariaDB 10.11.18. The immutable v1 schema snapshot preserves all 23 models and their fields/relations. Synchronize is disabled; migrations are explicit. MariaDB DDL is not described as transactionally reversible.
- Binary `utf8mb4_nopad_bin` preserves distinct case and trailing spaces in unique values. UTC DATETIME(3), nullable fields and JSON text remain explicit. Data-import preflight will reject values exceeding indexed VARCHAR(255) instead of truncating them.
- Keep TypeScript 5.9.3 and source Vitest 5.0.3 rather than copying Rakim's TS major upgrade or downgrading tests. Keep Website component libraries and original visual assets.
- npm exposed an existing optional peer conflict between NextAuth 4.24.13 and nodemailer 10.0.13. Target dependency resolution excludes NextAuth/Next/Prisma/Bun instead of using force or legacy-peer-deps. The pinned reference remains independently runnable and its 133 tests remain a separate CI job.
- CSS and 27 original public block renderers are copied with framework navigation adapters; no simplified editor is substituted. Vite requires an instantiated PostCSS plugin, unlike the source's Next-specific string plugin list.

## Validation so far

Real MariaDB migration succeeded. New schema tests exercise migration repeatability, every scalar column, case/space uniqueness, Unicode, FK rejection, NULL, millisecond UTC dates and refusal of destructive down. The imported FAQ/translation tests run with the same automatic DOM cleanup semantics. Target suite: 18 passing tests. Lint and independent TypeScript checks passed. Client and SSR builds passed. Nest health and Swagger were served; invalid public-view input returned 400 through DTO validation.

See `evidence/foundation/`; exact dependency versions are in package-lock.json. The large public bundle warning remains for measured optimization, not threshold suppression.

## Explicitly unfinished

The target does not yet provide authentication, operational APIs, protected pages, the full editor or queue handlers. The worker refuses normal startup until handlers pass phase E; `--check` only verifies database compatibility. The imported source at repository root is transitional reference code and is not the new production entrypoint. `test:e2e` and `test:infra` await the respective implementation phases. These are not claimed as passing or complete.

Source permission and behavior tests are retained; their target ports and full behavioral acceptance remain mandatory. Never deploy this foundation as the completed Website replacement.
