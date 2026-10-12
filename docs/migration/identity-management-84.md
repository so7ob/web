# Identity management (#84)

Baseline: develop `d52d9bee48883fd14d85ee8420931fbbda47103a`. One role per user is retained. System keys are immutable; super_admin is protected and cannot be cloned. Existing source schema snapshots remain immutable.

| Function | UI | API (legacy and v1) | Permission | Service / tables | Checks |
|---|---|---|---|---|---|
| Direct account | Users / Add | POST admin/users/direct | users.provision | IdentityAdministration / User, AuthToken, MailJob, AuditLog | duplicates, no SMTP, forced change |
| Profile, assignment, status | Users | PATCH admin/users/:id | users.update / users.roles / users.suspend | UserAdministration / User, AuthSession, Role | protected target, concurrent last admin |
| Credential and sessions | User detail | POST admin/identity/users/:id/:operation | credentials.reset / credentials.temporary / sessions.manage | IdentityAdministration | fresh password, revoke, audit |
| Roles | Roles | admin/identity/roles | roles.view/create/update/permissions/archive/delegate | IdentityAdministration / Role | version conflict, references, grants |
| Catalog | Permissions | admin/identity/catalog | roles.view | typed permission registry | implemented keys only |
| Invitations | Invitations | admin/identity/invitations; existing POST admin/users | invitations.manage / users.create | UserInvite, MailJob | expiry, cancel, fresh sender authority |

Policy: possession is not delegation. Non-root actors need explicit grantablePermissions AND the corresponding held permission to assign it, and may not edit their own role, target themselves for assignment, or administer a stronger account. Only root can configure delegation ceilings. Protected account operations require users.protected and the actor's current password. No admin email mutation is supported. The account email remains unverified after direct creation. Active means operational approval; credential readiness and email verification are independent.

Temporary passwords expire after 24 hours, are bcrypt hashed, returned only by the creating request with no-store, and require change before application access. Retrying creation yields an email conflict and never replays a secret. Password setup tokens expire after 30 minutes, are hashed and consumed atomically. Account commit is independent of setup-mail enqueue; queued is not delivered. Reset links do not verify email. Recovery forward is required after writes; do not drop the new columns or restore a stale database. DDL is restartable; normalized-email collisions stop migration for explicit reconciliation.

Security references: [authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

No deployment or production migration is authorized. [PR #85](https://github.com/so7ob/web/pull/85) records the final check results and links to the exact CI run and head SHA.

## Action and delegation matrix

| Action | Required permission(s) | Additional server boundary |
|---|---|---|
| Invite (unchanged POST) | users.create; users.roles for non-client | Active role; held AND explicitly grantable capabilities; fresh password for super_admin |
| Create direct | users.provision; users.roles for non-client | Same assignment ceiling; pending invite must be cancelled explicitly |
| Change profile | users.update | Stronger/protected targets denied; email is never writable |
| Assign role | users.update + users.roles | No self assignment; active target role and delegation ceiling; protected targets require root and fresh password |
| Suspend/reactivate | users.update + users.suspend | Structured reason; transactional revoke; usable last root protected |
| View/revoke sessions | users.sessions.manage | Safe metadata only; mutations apply target protection and reason |
| Request setup link | users.credentials.reset | Target protection, reason; queued/needs_retry distinct from account existence |
| Reissue temporary password | users.credentials.temporary | Current password on every request, target protection, reason, token/session invalidation |
| Read roles/catalog | roles.view | Server guard and SSR check |
| Create/copy | roles.create (+ roles.permissions for supplied permissions) | Non-root also needs roles.delegate and explicit ceiling; root cannot be copied |
| Edit role identity | roles.update | Immutable key/system flag; current actor role protected |
| Edit permissions | roles.update + roles.permissions | Non-root also needs roles.delegate; neither old nor new role may exceed actor/ceiling |
| Set delegation ceiling | roles.update + roles.delegate | Root only; subset of the role's permissions |
| Archive | roles.update + roles.archive | No system role; reject user, pending invite, published or draft page references |
| Manage invitations | invitations.manage (+ users.create to resend) | Rotate proof; recheck assignment; cancelled/accepted invites cannot resend |

Capabilities are checked again inside the common user-administration lock. Role changes use version conflicts and never overwrite a newer edit. All success audit records share the security mutation transaction. Denied API operations use the existing redacted security audit middleware and correlation IDs.

## Compatibility and operations

- `/api/admin/users` POST and `/api/v1/admin/users` POST remain invitation endpoints. Direct creation is `/users/direct`. New identity endpoints have both aliases and share pre-parse rate admission (20/10 minutes, 100/day per actor); legacy invitations retain their separate existing 5/10 minutes, 20/day quota.
- Old roles, IDs, foreign keys, verification timestamps and password hashes are not rewritten. Existing credentials default to ready. New abilities are available to the protected root and must be granted explicitly to delegated roles. Existing `users.roles` holders need an explicit delegation ceiling for staff assignment; possession alone no longer authorizes granting capabilities. Historical invitations with no active authorized sender fail closed and must be reissued.
- System role defaults remain bootstrap definitions, never runtime allowlists. Bootstrap preserves existing role customization. `isStaffRole` is a compatibility helper for known built-ins; runtime access uses permissions. Custom keys do not create staff status. Notifications/assignment selections use actual capabilities. User-detail request data and counters require request access; session detail has an independent permission.
- Password policy retains the existing minimum and character rules and adds a 72-byte UTF-8 maximum for new passwords. Existing bcrypt hashes and login verification remain compatible. Temporary passwords expire after 24 hours; setup links use the existing 30-minute reset-token policy. Reissuing invalidates old tokens and sessions. Suspension never revives old sessions on reactivation.
- Mail delivery remains the worker's responsibility. `queued` only confirms encrypted enqueue. Missing SMTP configuration or enqueue failure returns `needs_retry` for a committed direct account. Email verification stays independent from operational account approval and password setup.
- Rollout: pause writes, take the documented database/files backup, deploy compatible code and run explicit migrations, check schema/readiness, then reopen writes. If migration stops (including normalized-email collision), keep writes paused and reconcile before retrying. After reopening, recover forward; never drop credential/delegation fields or restore stale writes. No production steps were executed by this task.

## Verification notes

Early runs exposed an existing CSV test timeout at 5105 records and the resulting fixture contamination. Export now evaluates its search once in a transaction-local temporary selection and writes bounded batches, retaining all original limits/assertions. No timeout, retry count or assertion was weakened. New browser runs exposed a native-select label lookup defect and missing diagnostic allowlist entries for identity errors; both were corrected in product code.

The first remote CI run (#38318262321) reported 898 passed / 10 failed: identity fixtures left authentication audit events belonging to generated account IDs, so the strict transfer tests correctly rejected the non-empty destination. Fixture cleanup now selects only this run's generated users and hashed synthetic login identifiers; transfer assertions and product audit retention remain unchanged. The final browser run was restarted after the requested sidebar simplification: identity sub-sections remain tabs within Users, with a single Users sidebar entry.

Arabic operating instructions: [دليل الإدارة](identity-management-84.ar.md).

## Evidence and reproduction

- Local `ce3a46625fdb8450ddd975434c27618f151d9e5d`: 908 tests in 50 files passed, exit 0, on `so7ob_identity_84_clean_test`; lint, typecheck, build, independence and infrastructure checks passed. Its complete browser run is recorded separately from subsequent backend-only changes.
- `90068275e2a44a201214767fad761f6289f20286` keeps the inaccessible setup-account placeholder within bcrypt's 72-byte limit. Lint, typecheck, independence and infrastructure checks passed locally; CI run `38319117582` passed the complete integration suite before proceeding to operational checks. This is an observed intermediate result, not a claim that that run or the final PR has completed all gates.
- `tools/migration/upgrade-identity-smoke.ts` passed on an empty isolated `so7ob_identity_84_upgrade3_test`, replaying the old schema and synthetic historical data before the new migration. It verifies IDs, role permissions, bcrypt hash, verification timestamp, timestamps, invitation and normalized-email uniqueness. It never resets an existing database.
- `tests/e2e/identity-management.spec.ts` captures Users, Roles preview and Permission catalog for ar/en at 375/1280. The one-time credential modal is deliberately closed before screenshots. CI retains these PNGs in **identity-84-synthetic-interfaces** for 30 days; download the artifact from the exact run linked in PR checks. Local equivalents are `.migration/iam/{users,roles,permissions}-{ar,en}-{desktop,mobile}.png`. All records are synthetic; credentials and traces are excluded from this evidence artifact.
- Browser acceptance performs creation, forced change, allowed/denied API calls, foreign-resource denial, live-session permission withdrawal, audit verification, retained duplicate form, axe and keyboard checks. The complete suite also preserves existing invitation routes and resource workflows.
- Synthetic SMTP/queue tests establish enqueue and worker behavior, not delivery through a real external mailbox. No production database, service cutover, release or deployment was performed. Local full-browser evidence included one 90-second portal timeout while other suites were running; its retained trace and rerun outcome are reported in the PR, without changing the timeout.

Reproduce using Node 24.21.0/npm 10.8.2 and explicitly configured isolated `so7ob_*_test` MariaDB databases. Run `npm run db:migrate` before browser acceptance, keep browser fixtures separate from integration/worker fixtures, then execute every gate in CONTRIBUTING.md. Upgrade rehearsal requires a separate empty database. Require exit code 0; do not infer success from partial output.

CI run `38319587157` reached the historical v1-upgrade rehearsal and identified its exact expected migration list as stale. The expectation now includes `IdentityManagement1792022400000` in order, with every original-value assertion retained. The corrected rehearsal passed locally on `so7ob_identity_84_v1_test`: all original IDs/values in 23 historical tables preserved, 51 current tables, and zero migrations on repeat. The complete local unit/integration suite also passed 908/908 on `9006827` (exit 0). Worker liveness passed its repeat with the original timeout; file-cleanup and webhook recovery smokes passed.
