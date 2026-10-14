# Transaction lifecycle hardening — Issue #94

Review date: 2026-10-14 (Asia/Aden). [Issue #94](https://github.com/so7ob/web/issues/94), [PR #95](https://github.com/so7ob/web/pull/95).

## Review scope and provenance

The checkout was initially clean on the already merged design-system branch. Current remote `develop` was verified as `b3ec4955109bd99fec23136b3569393758ed6435`, including PR #93. This independent follow-up starts at that revision; there is no stacked dependency. Website/Rakim and historical archives were not needed or modified. The accepted source attribution remains in `source-provenance.md`.

The review inspected repository status/remotes and contribution rules, current CI/test configuration, API error handling, worker lifecycle, upload validation/storage, workflow calendars/deadlines, and shared transaction persistence. Baseline lint/typecheck passed. This is a scoped engineering review, not a claim that every implementation path has been audited.

Product/test implementation commit: `08fc427ae01dcae7103c36a56c5361fefec4d609`.

## Confirmed defect and behavior

`packages/server/src/auth/persistence.ts` created a query runner, connected, and started its transaction before entering its cleanup block. A failed connection or start therefore bypassed release. Failures during rollback or release could also replace the original failure. The helper is shared by authentication, business services, audit, queues, and workflows.

Connection acquisition, transaction start, work, and commit now share one guarded lifecycle. On failure, the helper rolls back only when the runner reports an active transaction, then attempts release. Cleanup failures preserve the original thrown value, including `undefined`. A release failure after otherwise successful work still rejects. `READ COMMITTED`, return values, and domain contracts are preserved. There are no automatic operation retries.

## Regression evidence

The corrected 15 lifecycle tests fail 11 cases on the original helper (4 pass). With the fix, all 15 pass. Four additional tests use real isolated MariaDB 10.11.18: operation failure leaves no written row; an injected failure before commit dispatch rolls back and releases; 12 failed starts (above the ten-connection pool capacity) release runners and leave the pool usable; 12 concurrent locked updates retain every value.

Only connection/start/commit failure injection uses spies; SQL, connections, rollback, release, pool reuse, and concurrent updates use the real database. Fatal network loss or a server refusing rollback is not simulated by these integration tests. Unit tests establish error precedence if cleanup itself fails. Attempting release does not prove recovery from every driver/server fault, and a failed commit acknowledgment remains an uncertain mutation.

Fresh synthetic databases were explicitly created and migrated: `so7ob_review94_unit_test` and `so7ob_review94_browser_test`. A dedicated test account has privileges only on those databases. Browser fixtures are isolated from server fixtures. No existing database was reset, seeded destructively, or migrated. Logs and synthetic configuration remain ignored under `.migration/review-94/`; credentials are not tracked.

## Required checks

| Check | Local result |
| --- | --- |
| `npm run lint` | Exit 0; independent ESLint and design-token checks |
| `npm run typecheck` | Exit 0 |
| `npm test` | Exit 0; 958 tests in 57 files |
| `npm run build` | Exit 0 |
| `npm run test:independence` | Exit 0; 510 sources, 2,989 imports, 31 configurations |
| `npm run test:infra` | Exit 0; Node, Nginx and systemd validation |
| `npm run test:e2e` | Running; result pending |
| `git diff --check` | Exit 0 |

The local build occurred before the implementation commit and stamps the base revision plus `dirty`; its product source matches the implementation commit. The only subsequent test edit removes an unused type import. CI builds from its own exact head; local build metadata is not claimed as an exact-commit CI result.

The [initial implementation CI](https://github.com/so7ob/web/actions/runs/38615301066) targets `08fc427ae01dcae7103c36a56c5361fefec4d609`. At document authoring it is pending, and success is not asserted. Any later documentation commit has a distinct check run; use the exact PR head when assessing final CI.

## Delivery and rollback

Review-only PR to `develop`. No merge, release, deployment, production-data action, or repository protection changes. No UI, permission, translation, URL, schema, or stored-record change. Revert through the ordinary reviewed workflow if needed; no data restoration is required. All existing checks remain enabled.
