# SQLite → MariaDB and files: phase C, data portion (#4)

Predecessor: PR #9, `9ae0437`. The source is Website/main `5321b7fd11db421c83290b262f276811e5f04e5f`. Only synthetic data was used. Production data transfer is neither performed nor verified. Business API/auth migration remains separate unfinished work under #4.

## Preconditions and commands

Use Node 24.21.0/npm 10.8.2 and MariaDB 10.11.18. Configure DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER and DATABASE_PASSWORD outside Git. The tool has no production defaults. Run `npm ci` and `npm run db:migrate` on an authorized isolated destination. Never point it at Website's database/storage. No seed/reset is used.

Obtain a closed SQLite backup using SQLite's backup API while source writes are paused; copy uploads from that same paused interval. Never copy an open database file and omit its WAL. All source tables/columns must match the pinned schema. `.env`, databases, attachments and reports with real identifiers stay outside Git. The source is opened read-only. The CLI refuses a source WAL/journal, unknown domain tables, missing columns, invalid dates/numbers/UTF-8, truncated indexed values, broken FKs/logical message links, missing files, size mismatches and symlinks.

```sh
npm run data:transfer -- --mode dry-run \
  --sqlite /isolated/source/snapshot.db \
  --source-uploads /isolated/source/uploads \
  --target-uploads /isolated/target/uploads \
  --confirm-database so7ob_migration \
  --report /isolated/reports/dry-run.json
```

Use `--mode apply` only after stopping the destination API/worker and explicitly setting `MIGRATION_WRITES_PAUSED=yes`. Set `--mode resume` after an interrupted apply, with the same byte-for-byte SQLite snapshot and file manifest. Use a new report filename for every command. `verify` requires every record/value/ID/file to match. `dry-run` writes no database records or uploads (the requested report is its only persistent output).

A database advisory lock excludes concurrent importers. Each table and its progress checkpoint commit in one SERIALIZABLE transaction with FKs enabled. Resuming checks all existing records before continuing; changed records, unknown destination IDs/files or another snapshot are rejected, never overwritten. Repeat apply is idempotent. An application that ignores the offline precondition is not protected by the importer lock: keep all writers stopped. A partial failure never authorizes opening traffic.

The importer preserves all scalar fields, IDs, ownership, bcrypt hashes, token hashes/expiry/consumption, revoked-session history, internal notes, JSON text including whitespace, published/draft blocks, versions, redirects and timestamps. Dates normalize to UTC DATETIME(3); strings use binary no-pad collation. New authentication must reject legacy cookies as agreed; importing session history does not authenticate it. `_prisma_migrations` is historical tooling metadata, excluded from target domain tables and retained in the original SQLite backup.

All uploads are copied, including unreferenced regular files, which are listed for review rather than discarded. Atomic no-clobber file publication, fsync and SHA-256 protect copying/retries. Temp files from an abrupt filesystem crash may remain beside uploads, named `.so7ob-transfer-*`; review them independently, never delete unknown files. A metadata-only transfer is not successful. Private/public serving authorization still belongs to the unfinished API migration.

Reports contain per-table counts, ordered-ID equality, complete normalized-row SHA-256 comparisons and per-file SHA-256/references. They contain no row values/passwords/tokens. They still contain identifiers/file names and are private (0600) for real data. Current implementation buffers source rows and one file at a time; large-data capacity has not been benchmarked. Differences in SQL LIKE/search semantics must be tested in the business query layer; binary uniqueness is already tested here.

## Backup, restore and reconciliation

Requires the MariaDB client utilities. Stop API/worker and keep writes paused throughout DB and file capture. The tool calls `mariadb-dump --single-transaction` with routines/events/triggers and a file manifest. Passwords are never command-line arguments or log output. Protect process credentials and store backups on access-controlled/encrypted storage. The SQL dump is a trusted operator artifact; checksums detect corruption, not malicious SQL replacement.

```sh
MIGRATION_WRITES_PAUSED=yes npm run data:backup -- --mode backup \
  --directory /isolated/backups/new-backup --uploads /isolated/target/uploads \
  --confirm-database so7ob_migration
# DBA creates a separate empty database and grants only the needed access.
MIGRATION_WRITES_PAUSED=yes npm run data:backup -- --mode restore \
  --directory /isolated/backups/new-backup --uploads /isolated/restored/uploads \
  --confirm-database so7ob_restore_test
```

Set the database environment to the appropriate source/restore target for each command. Restore refuses any existing target table or uploads directory. SQL failure may leave a partial isolated target: retain it for inspection and retry into another new empty target, never reset it automatically. After restoring, run `data:transfer --mode verify` against the frozen SQLite source and restored files. Verify permits the restored upload path to differ; apply/resume remain tied to the original target path. Repeated verified restores need a fresh target.

## Evidence and boundaries

- A real reference snapshot (synthetic users/requests plus seeded Website content) transferred to isolated MariaDB, 23 tables plus its attachment. All rows and file bytes matched.
- A full MariaDB + uploads backup restored into a separate empty MariaDB database and independently matched the original SQLite/file snapshot. See `evidence/data-transfer/restored-verify.json`.
- Integration fixtures contain records in all 23 entities, Unicode/emoji, case/trailing-space unique keys, NULL, millisecond dates, JSON whitespace, private notes, versioned draft/public content, revoked sessions, consumed/expired tokens and invites, bcrypt, media, message-linked attachments and an orphan file.
- Tests inject an actual MariaDB trigger failure mid-import, then resume and reapply; reject wrong destination, missing offline acknowledgment, missing files, symlink paths, orphan links, oversized indexed fields, WAL, competing importer, changed data and corrupt file bytes.
- Current published pages are read successfully by the target's MariaDB-backed SSR. Private/account/editor operations and production reconciliation are not yet accepted.

Full rollback is allowed only before reopening writes at a separately authorized cutover. Keep Website untouched, keep the new API/worker offline, restore the matching code/database/files/session/outbox snapshot, reconcile, then decide whether to reopen the original service. Queue rollback testing awaits phase E; preserving legacy EmailLog rows is not a queue implementation. Once new writes are accepted, retain MariaDB, files and queue and recover forward. Never restore old SQLite over post-cutover requests.

Archived command logs have only trailing whitespace/blank EOF lines normalized for `git diff --check`.
