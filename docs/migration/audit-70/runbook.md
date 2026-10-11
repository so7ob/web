# Operation, review and recovery

## Local use

Open the isolated preview named in `verification.md`, sign in with its synthetic administrator, then open `/ar/admin/audit` or `/en/admin/audit`. The existing port 3108 was not used as acceptance evidence. The comparison build was generated from the pinned base commit in a separate checkout/database; after screenshots use the candidate build, never a mockup.

1. Search a resource reference such as REQ-DEMO-104, or select resource/action/outcome/source/date filters. Date inputs are explicit UTC; the display timezone is a personal preference. Statistics cover the full matching set, not visible rows. Old outcomes remain Unknown.
2. Open Details; compare Before/After, expand safe fields or technical metadata, follow the resource/correlation/batch timeline, copy the ID or an event-only link. Escape closes the drawer and returns focus to the originating button. Resource/developer links obey their separate permissions.
3. Flag evidence or create a follow-up from selected events. The case owner, notes, status and closure reason are independent of evidence. Preserve-evidence holds require the policy permission. Closing a case cannot silently release its hold.
4. Prepare a report of this page, selected events or all matching results. Queued/preparing is not ready. When complete, download CSV/JSON or open the printable HTML and use the browser's Print/Save as PDF. The manifest and `node tools/audit/verify-report.mjs FILE MANIFEST` verify bytes and counts. Reports expire after 24 hours; original events remain.
5. A rule manager can enable a disabled rule, set its scope, threshold/window where applicable, severity, rationale and cooldown, and try the preceding 24 hours (up to 1,000 candidate events; larger simulations fail visibly). Alert evidence links are bounded to the first 1,000 matching events; the threshold count covers the full window. No external notification channel or automatic account blocking is configured.
6. Health reports insertion/rollback checks separately from the last business event. Counters from the current process reset at restart; last persisted failure time is retained. Missing/stale probes mean unknown/degraded, not healthy. Inspect the separately authorized diagnostics for underlying errors.

## API compatibility and limits

All new routes start `/api/v1/admin/audit` (also `/api/admin/audit`). POST/PATCH bodies use `{ "payload": ... }` and the existing session/CSRF policy. Route controllers validate before services; services enforce feature permissions. Search text stays out of URLs. Resource and event IDs do not confer access.

| Route | Method | Contract/purpose |
|---|---|---|
| `/events/search` | POST | AuditFilter → rows, complete stats, nextCursor, measuredAt |
| `/events/:id` | GET | Sanitized historical event; authorized deleted-resource status |
| `/events/:id/related?kind=resource\|batch\|correlation` | GET | Cursor-page of related events |
| `/access` | POST | Explicit opening/detail access, bounded deduplication |
| `/preferences`, `/views` | GET/POST | Private density/columns/timezone and named filters; DELETE `/views/:id` |
| `/bookmarks`, `/events/:id/bookmark` | GET/POST | Independent private flags |
| `/cases`, `/cases/:id`, `/assignees` | GET/POST/PATCH | Limited investigation workflow and history |
| `/reports`, `/reports/:id/cancel`, `/reports/:id/download` | GET/POST | Private jobs, fenced cancellation, current authorization at download; `?manifest=1` |
| `/rules`, `/rules/:id`, `/rules/:id/simulate` | GET/PATCH/POST | Versioned deterministic rules and non-writing simulation |
| `/alerts`, `/alerts/:id/events` | GET | Explanations and original evidence links |
| `/health`, `/policy`, `/policy/dry-run` | GET/PATCH/POST | Separate operational permissions; no delete API |

Legacy `/admin/audit` list API keeps its response adapter, sanitizes details and caps old pagination at 100 pages. New UI uses deterministic keysets. Cases/reports/alerts show the most recent 100 entries; bookmarks and alert links are bounded to 1,000. These workspace bounds do not truncate exported result sets: exceeding the explicit 100,000-event/256 MiB/five-minute report limit fails the job.

## Service accounts and deployment handoff

Perform deployment only after separate review/authorization. Pause business writers for the transition; an old writer that updates AuditLog cannot coexist with the new append-only grants. Back up while paused. Apply the additive migration through the migration identity, verify old IDs/dates, then provision a **new** runtime account with per-table grants. Review the output of:

```
node --env-file=PRIVATE_MIGRATION_ENV tools/audit/runtime-grants.mjs NEW_RUNTIME_USER DB_HOST
```

The generator does not create users or execute grants. Provision the account/password through the secret-management process, apply reviewed SQL, verify there are no global/schema/role/proxy grants, and run the isolated analogue `tools/audit/runtime-smoke.mjs`. AuditLog must allow SELECT/INSERT only; runtime must not have ALTER, DROP, UPDATE or DELETE there. The schema registry is SELECT-only. New migrations need review of the grant list for their new tables. API and worker may share this restricted runtime role, but not the migration or maintenance identity.

Use Node 24.21.0, pinned npm workspaces, explicit database environment, and a private absolute DATA_DIR shared by API/worker. The API does not run migrations. Reports live under DATA_DIR/audit-reports, outside public uploads. Worker performs bounded queue/report work, lease recovery, cleanup and technical probes. There is no Redis/Kafka/new database service. Preserve rejected/failed work for investigation and monitor available storage. Temporary reports may be regenerated; canonical evidence must be backed up independently.

## Retention maintenance

Retention defaults to unconfigured. Policy changes and legal-hold changes have independent permissions and audit events. The API never applies deletion. First run, using a dedicated maintenance database identity and an active policy manager's review reference:

```
node --env-file=PRIVATE_MAINTENANCE_ENV tools/audit/maintenance.mjs --actor=REVIEWER_ID --dry-run
```

Review candidates/holds/cutoff and the policy revision. An authorized apply requires `AUDIT_MAINTENANCE=true` and `--apply --policy-revision=N`. Each invocation applies at most 250 rows and rechecks policy/holds under the retention lock. It records a system action with the authenticated database principal name (without host/IP), not a claim that the CLI's reviewer ID authenticated as the executor. Runtime credentials cannot perform this deletion. Do not automate policy selection or hold removal.

## Recovery and rollback

The tested host-local synthetic rehearsal restores all MariaDB tables, schema registry, evidence/reviews/jobs and referenced files, verifies values/IDs/timestamps, recovers separate keys, starts recovered SSR/API/worker, and preserves ambiguous mail handling. It does not prove off-host disaster recovery, production topology or external immutable evidence storage.

Before any production transition, rehearse the same procedure with authorized infrastructure and protect backup/key custody separately. The existing backup tooling includes database tables and uploads; report artifacts are temporary and must either be separately copied from the private DATA_DIR or expired/regenerated after recovery. A completed report whose private file was not restored must not be represented as a successful download.

Code rollback must retain a schema-compatible writer and append-only grants. Optional processors or navigation can be withheld while investigating; do not reinstall the old writer against restricted grants. After writes resume, recover forward. Never restore an older database over new evidence or silently rewrite historic rows. External signing/checkpoints remain conditional on independently authorized key/storage infrastructure.
