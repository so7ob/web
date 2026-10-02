# Durable mail and operations foundation — independent portion of #6

Stacked after data-transfer PR #10 (`2f4f605`). This portion is implemented before the remaining business/auth port because those operations must enqueue mail in their original database transaction. It does not mark phase C/D/E or the full migration complete.

## Queue contract

`MailQueue.enqueue(queryRunner, mail, dedupeKey)` requires an active business transaction. Both MailJob and metadata-only EmailLog roll back with the operation. A unique hashed idempotency key serializes concurrent enqueue; reusing it with a different payload is rejected. Payloads use AES-256-GCM with random nonces and job-bound authenticated data; OUTBOX_KEY is 32 random bytes encoded as 64 hex characters, provided outside the database and Git. Keep it with protected recovery credentials. Restoring only the database without this key cannot recover queued mail. There is no fallback key or silent plaintext mode. Key rotation requires a separately reviewed re-encryption procedure; do not replace the key while encrypted jobs remain.

MariaDB `FOR UPDATE SKIP LOCKED` claims one due job. Lease tokens fence stale workers; heartbeats extend only live leases. A crash before dispatch allows retry. After dispatch starts, an expired lease becomes `uncertain`, with no automatic resend. SMTP explicit temporary rejection or proven pre-connection failure allows bounded exponential retry (30s, 60s, 120s; four attempts total). Permanent rejection or exhausted attempts becomes `failed`. `sent` means the SMTP server accepted the message; it does not claim delivery to a recipient inbox or exactly-once delivery.

Nodemailer can label a connection loss after DATA as `CONN`; that label is not proof of non-delivery. Such failures are uncertain. A database acknowledgment failure after SMTP acceptance also remains sending/uncertain, never converted into a blind retry. Operators must investigate uncertain jobs with provider records before any separately authorized replacement send. Encrypted payloads stay available; logs show only job IDs and redacted error codes. EmailLog bodies remain empty. Access to job payloads must not be added to ordinary administration DTOs.

SMTP uses certificate validation and STARTTLS (or implicit TLS on 465). Insecure SMTP is available only for explicitly enabled loopback testing in non-production. No external SMTP server was contacted during this work.

Run `npm run build:server` then `npm run start:worker`. `--check` validates DB/schema/key/SMTP configuration without sending; `--once` processes at most one job. SIGTERM stops polling and lets the in-flight attempt finish. The systemd timeout exceeds SMTP timeouts; forced termination is recovered using the lease rules.

## UTC correction

An actual Asia/Aden MariaDB test exposed that driver `timezone: Z` does not change SQL CURRENT_TIMESTAMP defaults. An explicit new migration sets UTC_TIMESTAMP(3) defaults for all new rows, transfer checkpoints and jobs. It changes no imported timestamp. A regression test sets the session to +03:00 and checks new timestamps against UTC. Earlier phase-B schema alone must not be deployed without this correction.

## Debian 12 deployment preparation (not deployed)

Install MariaDB 10.11.18, Nginx, OpenSSL and the MariaDB client utilities using the approved Debian repositories/package process. Install the exact verified Node 24.21.0 runtime at `/opt/node-v24.21.0`; use npm 10.8.2 for `npm ci` during release preparation. Keep release directories under `/opt/so7ob-web/releases/<commit>` and a separately switched `current` symlink. Never reuse Website's checkout, domain, database, uploads, unit names or credentials.

Create the dedicated `so7ob-web` system account. Store private state under `/var/lib/so7ob-web` (0700), secrets under `/etc/so7ob-web` with root-controlled environment files. API environment uses BIND_HOST=127.0.0.1, PORT=3108, SITE_URL/WEB_ORIGIN matching only the separately approved destination HTTPS origin, TRUST_PROXY_HOPS=1 and DATA_DIR outside the release. Both processes need the appropriate database credentials and outbox encryption key. Worker additionally needs SMTP_HOST/PORT/USER/PASSWORD/FROM. Do not put secret values into unit files.

Use a migration credential separately from runtime credentials. Runtime never runs schema synchronize or automatic startup migrations. The worker needs SELECT on schema history and SELECT/UPDATE on MailJob/EmailLog; the API needs only the domain/queue permissions required by implemented services. Neither requires global grants, FILE or schema DDL. Protect the database socket/port from public networks.

Templates in `ops/systemd/` include runtime checking, non-root ownership, read-only release files, restricted write paths, private temp, privilege restrictions, restart-on-failure and graceful-stop timeouts. Render `ops/nginx/so7ob-web.conf.template` for the independent domain/certificate/release/log paths. Nginx passes client identity from the actual connection, not user-supplied forwarded headers. Private uploads have no static alias. Dynamic SSR handles deep links and HTTP errors; no generic SPA fallback. SSR build files are not exposed by Express static serving. Access logs omit query strings and referrers because account URLs may contain tokens.

Review rendered configuration, run `nginx -t` and `systemd-analyze verify`, then use a separately authorized staging deployment. `npm run test:infra` executes these syntax checks with isolated temporary certificates/configuration and verifies exact Node runtime; it never starts/reloads a service. These checks ran on the managed host, not a full Debian 12 staging system. Actual provisioning, TLS issuance, firewall changes, public deployment and production cutover are not performed.

## Monitoring, backup and rollback

Check `/api/health/ready` for DB/schema readiness. Monitor service exits, disk space, queue oldest queued/retry age, expired leases, failed and uncertain counts, and SMTP provider rejections. Query only job metadata (`status`, counts, `availableAt`, `leaseUntil`, redacted `lastError`), never decrypt payloads into logs. Worker stdout records an attempt ending, not delivery success; use persisted state. Active worker freshness/exported monitoring endpoint and operational alert integration still require staging validation.

Stop API and worker before a consistent DB/files backup. The backup/restore commands in `data-transfer.md` include MailJob and EmailLog in the full database dump. Preserve OUTBOX_KEY securely alongside the release/DB/files recovery set. During rollback before reopening writes, keep both workers stopped; do not run old and new delivery against the same jobs. After opening writes, retain new DB/files/queue and recover forward. A restored `sending` lease must become uncertain, never be reset to queued merely because the code was rolled back. Full queue-inclusive backup/restore rehearsal remains an acceptance item; the previous data-only backup predates this schema.

## Evidence and remaining integration

35 target tests pass against real MariaDB and a real local SMTP socket, including concurrent enqueue/claims, lease fencing, retry exhaustion, ambiguous DATA disconnect and an actual DB failure after SMTP acceptance. `npm run test:worker` launches the compiled independent worker process, verifies SMTP acceptance, kills another worker with SIGKILL after DATA, restarts it, and verifies uncertain state without a resend. The test advances only its synthetic lease to avoid a one-minute wait. No mock database or SMTP transport is used for these outcomes. `npm run test:infra` passed actual Nginx/systemd syntax validation.

Business services are not yet connected to enqueue; UI outbox state labels and recovery operations still require migration. This is an implemented worker foundation, not a claim that all Website background behavior or deployment acceptance is complete.
