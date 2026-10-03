# User administration — phase C portion (#4)

Stacked on client portal PR #16 (`659edbd`, plus its toast-transition test correction). Source: Website `5321b7fd11db421c83290b262f276811e5f04e5f`, specifically `src/app/api/admin/users/route.ts` and `src/app/api/admin/users/[id]/route.ts`. No original repository files or deployment settings are changed.

`UserAdministrationService` implements the four original HTTP operations under both `/api/admin/users` and `/api/v1/admin/users`. Nest controllers expose Swagger metadata and DTOs; permission guards check the current server session and operation, while services enforce field-specific permissions. Database access stays in the server workspace. The original admin UI is still pending; these endpoints are working operations, not a claim of full administration parity.

## Preserved contracts

- List: 20 rows/page; original query trimming, lowercasing and 100-character cap; role/status filters; allowed sort keys and invalid-sort fallback; owned/assigned counts. SQLite ASCII-only LIKE behavior remains explicit and query values are bound. No password/session fingerprint appears in the list.
- Detail: safe identity/profile, request counts, last 20 requests and assignee name, last 10 actor audit events, suspension timestamp and session summary. Session display follows the accepted re-login boundary: operational opaque sessions past revocation cutoff only; historical imported session rows remain untouched.
- Update: source field trimming/null conversion and ignored non-string fields; separate `users.roles` and `users.suspend` powers; invalid/no-op and missing-record responses; source audit action precedence. Suspension atomically invalidates sessions, sets the account cutoff, changes status and records the audit event. Reactivation never revives sessions.
- Invite: original email normalization, system role allowlist, sensitive-role permission, duplicate account/pending-invite conflicts, seven-day hashed single-use token, original Arabic/English email text and audited recipient/role. The submitted name was unused by Website and remains entered at acceptance. Production responses expose no invitation URL.
- Rate admission runs before JSON parsing and DTO validation and consumes exactly one attempt per invitation, including malformed input: five per ten minutes and twenty per day. Database buckets replace source process memory. Legacy invalid-body responses retain `{ok:false,code:"invalid"}`.

Invitation insertion, encrypted mail enqueue and audit share one transaction. The response reports `emailStatus:"queued"`; it does not claim SMTP delivery. Encryption failure rolls back the invitation and audit. The independently tested worker owns delivery and uncertain-send outcomes.

## Narrow security corrections

Website counted remaining admins outside a transaction; concurrent demotions/suspensions could both pass. Its `pending_verification` status path also bypassed the last-admin guard. All role/status/profile administration mutations now serialize through one short database operation lock, reload actor permissions, lock the target and protect the remaining active administrator for **every** transition away from active/super_admin. This preserves the intended protection rather than reproducing the race. Concurrent MariaDB cases prove exactly one of two conflicting changes succeeds. No database reset or modification of unrelated test accounts is used.

Concurrent invitations use the same administration lock and recheck account/pending invitation existence before insertion; only one proof/outbox item is committed. A stale actor whose role was removed cannot continue a privileged write after waiting for that lock.

## Evidence and remaining work

Twenty-one read contracts were captured from the pinned synthetic reference for system admin, operations manager and client, including filters, invalid-sort fallback, pagination, detail and denial. The capture is read-only apart from synthetic login/session timestamps. Tests cover actual MariaDB concurrency, rejected powers, field projection, token consumption/replay, rate admission, atomic failure and HTTP legacy/v1 routes over real secure sessions.

Local results: all 150 unit/integration tests (including 13 new real database cases), 36 browser tests, lint, independent TypeScript, build, infra and diff checks pass; see `evidence/user-administration/`. A test-cleanup defect initially left its synthetic accepted-user audit row and caused the migration conflict guard to reject it correctly. Cleanup now includes the fixture actor email; the full suite passes without weakening the migration conflict checks. Client portal PR #16 CI status is tracked separately; a successful local run is not remote CI completion. Admin interfaces, other administration services, the CMS/editor, final performance/visual acceptance and full operational rollback rehearsal remain pending. Production data migration is unperformed and unverified. No merge, release, deployment or production cutover is performed.
