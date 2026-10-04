# Attachments, media and prior-request claims — phase C portion (#4)

Stacked on PR #14 at `0d36f89`; earlier PRs remain unmerged. This portion ports nine original HTTP operations to NestJS, under both legacy paths and `/api/v1`. It does not complete the private account/admin UI or CMS editor.

| Route | Authorization and behavior |
| --- | --- |
| `POST /api/attachments` | Authenticated owner or permitted staff; closed/cancelled client requests reject uploads; 5 MiB limit |
| `GET /api/attachments/:id` | Server record ownership/assignment/permission checks before streaming private bytes |
| `GET /api/media/:id` | Public supported image bytes, original inline/cache/nosniff headers |
| `GET, POST /api/admin/media` | Original `media.manage` and `media.upload` permissions; 24-item pagination; 8 MiB image limit |
| `PATCH, DELETE /api/admin/media/:id` | `media.manage`, original field truncation and responses; durable physical deletion |
| `POST /api/account/requests/claim` | Authenticated account, shared quota 3/10 minutes and 10/day; generic response protects request existence |
| `GET /api/account/claim-verify` | Current account plus live one-use proof sent to the original request contact; original 307 outcomes |

## File integrity and restricted access

The source validator is retained, including MIME/signature checks and actual image decoding with sharp. Its ten existing expectations run unchanged. Multipart parsing has bounded file/field/part sizes before application storage. The private storage directory is an explicit absolute `DATA_DIR`; production rejects a directory inside the release. Random stored filenames are opened exclusively with no-follow semantics and fsynced. Reads/deletes reject traversal and symbolic links. Public media never serves arbitrary attachment types. File bytes are streamed, with headers and lengths derived from the authorized record and actual file.

Client metadata filtering from PR #14 is extended to actual downloads: an attachment linked to an internal request/inquiry note is unavailable to a client even when the client owns the parent request. The source private-download handler checks only parent access and does not make this distinction. This is a limited security correction with explicit negative tests; authorized staff retain access.

Attachment metadata, activity, audit and in-app notifications are transactional. Permissions and closed-request state are checked again under the parent row lock after validating/writing the file. Metadata commit failures never immediately unlink bytes: the database may have committed without returning its acknowledgement. A cleanup job instead checks both attachment and media references with locking reads, waiting for any in-flight metadata write. If the database is unavailable even for enqueue, bytes are retained, a redacted `upload_cleanup_deferred` diagnostic is emitted, and operators must reconcile the unreferenced-file inventory during maintenance; no unsafe automatic orphan sweep runs.

## Durable physical deletion

Migration 7 creates FileCleanupJob; migration 8 adds non-destructive prefix indexes to existing LONGTEXT stored filenames. Existing file names and records are unchanged. Media deletion commits removal of metadata, audit and its cleanup job together. The public URL becomes unavailable immediately; bytes are removed asynchronously by the existing independent worker. This timing differs from synchronous source unlink but makes failures recoverable without returning deleted metadata.

Cleanup uses SKIP LOCKED reservations, a 60-second lease, fencing, bounded exponential retries and a maximum of eight attempts. Processing holds the job row and locking reference reads through unlink and final state update; another worker cannot reclaim that job during the transaction. Unlink is idempotent: an already absent file completes successfully, and an abandoned lease is recovered. Referenced files become `blocked`, not deleted; a later authorized metadata deletion re-enqueues that job. Persistent filesystem errors become `failed`. Inspect these states and resolve their cause before any explicit administrative retry; no blind redrive command is provided. Stored names are random and are never reused by upload endpoints. Offline imports must keep writers and workers paused as documented.

## Ownership claims

Claim reservation, token, encrypted mail job, audit and notification commit together. Mail goes to the original request contact, not to an arbitrary submitted address. A live reservation belonging to another account cannot be replaced. Expired reservations can be renewed without extending an existing token. Claim verification locks the request and atomically consumes the account/resource-bound token, assigns the previously unowned/unarchived record, completes its pending reservation and appends the source system message. A failed assignment rolls back consumption. Concurrent verification has one winner. Suspended accounts, wrong accounts/resources, expired/used tokens and archived requests cannot complete a claim.

Quota admission precedes JSON parsing; malformed bodies count once across legacy/v1 aliases. Production responses and logs contain no development verification URL. The browser destination and 307 outcomes preserve the source locale and query behavior. Links continue to require the current server session, consistent with the accepted one-time login at cutover.

## Verification and scope

Evidence is in `evidence/files-and-claims/`. Tests use actual MariaDB and private synthetic files, not repository mocks. Coverage includes byte equality, MIME spoofing and size errors over real HTTPS multipart requests, owner/other-account/staff access, internal-note files, symbolic-link safety, metadata rollback, referenced-file retention, waiting for uncommitted metadata, abandoned cleanup leases, original contact proof, wrong-user/resource/replay rejection, concurrent claim consumption, expired reservations, suspended accounts and rate limits. The compiled file-worker test recovers an abandoned reservation, removes actual bytes and restarts without repeating a completed job. CI runs this alongside existing SMTP/webhook crash checks.

All values/files used here are synthetic. No Website/Rakim file, branch, issue, settings or deployment was changed. Production data/files were unavailable and remain unmigrated/unverified. Full private UI, admin/business operations, editor parity, complete workload measurements and the full operational backup/restore/cutover rehearsal remain open. The data-only restore evidence from earlier phases does not establish restoration of these new operational queues. Rollback remains bounded by the accepted paused-write window; after reopening writes, preserve MariaDB/files/queues and recover forward.

Refreshed-source guest follow-up downloads are implemented in [tracking.md](tracking.md): a valid generation-bound link session can download only attachments on public messages of its own card. Signed-in account authorization takes precedence; internal notes, unrelated cards and revoked sessions are rejected. Real HTTPS tests compare downloaded bytes and recheck denial after revocation.
