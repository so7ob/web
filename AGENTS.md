# Development instructions — so7ob/web

- Write only to `so7ob/web`. Website and Rakim are read-only references; never push, change settings, create issues/PRs or deploy there.
- Preserve Website's behavior, identity, Arabic/English translations, accessibility, authorization, records, files and URLs. Successful builds alone do not establish parity.
- Inspect status before/after work. Preserve unknown work; no force push, mirror push, reset --hard, clean, automatic branch deletion or rewriting published history.
- Verify origin fetch/push URLs and remote repository identity before every remote write. Target `https://github.com/so7ob/web.git` explicitly.
- After the documented empty-repository bootstrap, no direct commits/pushes to main/develop. Issue first, Conventional Commits, issue-number branch and PR to develop. Document stacked dependencies; no automatic merge or production release.
- Runtime target: Node 24, npm workspaces, React/Vite/React Router SSR, NestJS/Express, TypeORM/mysql2/MariaDB, independent Node worker. No production Next.js, Prisma or Bun in the completed migration.
- Separate DTO validation, services, authorization and persistence. Never expose server secrets, database entities or draft/internal data in browser bundles/responses.
- Keep database migrations explicit. No destructive seeds/resets against existing data. Test migration on real isolated MariaDB and preserve old bcrypt hashes.
- No secrets, actual .env files, private attachments or real database dumps in Git. Fixtures and evidence must be synthetic. `.migration/` is local ignored working data, never a production source.
- Required final checks: npm run lint; npm run typecheck; npm test; npm run build; npm run test:e2e; npm run test:infra; git diff --check. Lint must run ESLint independently from TypeScript. Never weaken checks to claim success.
- Visual changes require Arabic/English, RTL/LTR, 375/1280 widths, keyboard and axe checks. Security changes require negative and concurrent cases.
- Record evidence, limitations, inherited defects, source SHAs and dependencies in docs/migration/. Never claim pending checks, CI, uploads or production migration succeeded.
- Follow CONTRIBUTING.md. User instructions override imported reference methodology.
