# Startup visibility — Issue #82

Date: 2026-10-13 (Asia/Aden). Repository: `so7ob/web`.

Base: `origin/develop` at `79fd21945021615ca7c72f45351262ce006a89eb` (v1.2.1). Branch: `fix/82-startup-readiness`. No stacked dependency and no reference checkout is needed.

## Cause and behavior

`npm run dev` builds the server then starts `apps/api/dist/main.js`. `apps/api/src/main.ts` explicitly disables Nest logging, and previously emitted no successful startup message. The command shown during compilation was not evidence of a listening server.

The API now prints bilingual STARTING and database/schema progress messages, followed by a prominent READY banner only after `assertSchema` and `app.listen` succeed. The URL comes from the bound server (`app.getUrl`), including the actual port when using port 0. The banner includes the readiness endpoint and Ctrl+C. This records HTTP readiness at startup, not ongoing monitoring, worker readiness, SMTP delivery, production activation or complete product parity.

Node's `styleText` handles terminal colors; normal interactive output is green, redirected output stays readable, and NO_COLOR disables automatic coloring (FORCE_COLOR explicitly overrides it under Node). A startup error retains the existing sanitized diagnostics and adds a red bilingual failure message using the same generated error ID. It never prints the raw exception, database credentials or payloads. Nest logging remains disabled to preserve the diagnostic policy.

## Runtime evidence

Tests use MariaDB 10.11.18 on loopback and npm 10.8.2, an account restricted to newly created `so7ob_startup82_20261013_{unit,browser,recheck,empty}_test` databases, synthetic secrets and private ignored runtime data. No existing application database is modified. Logs/scripts are local ignored output under `.migration/startup-logging/`; they are not a runtime dependency.

- Production-mode startup: plain and forced-green output both reached READY; the exact advertised `/api/health/ready` returned HTTP 200 and `{ok:true,database:true}`. Plain/NO_COLOR output had no ANSI escape sequences; colored output contained green ANSI sequences.
- Database connection failure, missing schema/migrations and occupied HTTP port: STARTUP FAILED appeared with the diagnostic reference, and READY never appeared.
- Real `npm run dev` in a pseudo-terminal: STARTING, verified database/schema and the green READY banner appeared at `http://127.0.0.1:3196`; curl against its advertised health route returned `{ok:true,database:true}`. Ctrl+C stopped only the owned fixture process.

Inherited limitations: another development server already owned Vite's default HMR port 24678, producing a Vite WebSocket warning during the dev smoke; HTTP readiness still succeeded. The banner describes the HTTP listener, not HMR. The pre-existing startup catch only sets `process.exitCode`; startup failures after opening database connections can leave handles alive. Negative smoke fixtures were explicitly terminated after observing the failure message. This logging change does not alter that cleanup behavior.

## Checks

Implementation SHA: `6308fdb74bdfc78afadd2850914a2202aacd2197`. [GitHub run 38308862810](https://github.com/so7ob/web/actions/runs/38308862810) completed successfully on that exact SHA. The implementation changes only the API entrypoint and its local-development guide; this subsequent evidence document does not change runtime or tests.

| Required command | Local result | CI at implementation SHA |
| --- | --- | --- |
| `npm run lint` | Passed, independent ESLint | Passed |
| `npm run typecheck` | Passed | Passed |
| `npm test` | 894 passed, 1 timeout; see below | 895 passed across 49 files |
| `npm run build` | Passed | Passed |
| `npm run test:independence` | Passed | Passed |
| `npm run test:e2e` | 129 passed; redundant run deliberately interrupted after complete CI success | 244 passed, 13.7 minutes |
| `npm run test:infra` | Passed | Passed |
| `git diff --check` | Passed | Passed |

CI also passed worker, file-worker, webhook, auth, CMS capacity/boundary, ordered upgrade and restore rehearsals. Browser acceptance covered Arabic/English, RTL/LTR, 375/1280 widths, keyboard, axe and negative/concurrent authorization/mutation cases through the existing suites. No checks or timeouts were weakened.

Local limitation: `admin/operations.integration.test.ts` exceeded its existing 5-second deadline when exporting 5,105 synthetic requests. A retry in the same database also observed leftover synthetic rows (16 passed, 2 failed); a new isolated database restored the count assertions but reproduced the export timeout (17 passed, 1 failed). Those local failures and their fixtures were preserved, rather than deleting queue/record evidence or changing the threshold. The unchanged export test passed in the complete CI run. After CI finished all 244 browser cases, only the owned local Playwright process was interrupted with SIGINT: 129 passed, 1 interrupted, 114 unrun, exit 130. The local partial browser run is not represented as a full pass.

Private local logs: `lint.log`, `typecheck.log`, `build.log`, `independence.log`, `infra.log`, `unit.log`, `operations-recheck.log`, `operations-fresh.log`, `browser.log`, `smoke-results.json`, and `ci-implementation.{json,log}` under `.migration/startup-logging/`. Public review evidence is the linked CI run; the private logs are not required to build or maintain the project.

## Delivery and rollback

[Issue #82](https://github.com/so7ob/web/issues/82); [draft PR #83](https://github.com/so7ob/web/pull/83) targets develop and stays open for review. The follow-up evidence commit triggers another CI run; completion of that later run is not implied by the successful implementation run cited above. No merge, release, service configuration or deployment. Revert the startup-message additions and local-development guide paragraph to roll back; there are no schema, data or URL changes.
