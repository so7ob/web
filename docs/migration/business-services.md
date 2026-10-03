# Submissions and account services — additional phase C portion (#4)

Stacked on public/auth UI PR #13 at `73829d7`; previous PRs remain unmerged. This portion implements 17 original HTTP handlers under both their legacy paths and `/api/v1`, with real MariaDB persistence:

| Routes | Operations |
| --- | --- |
| `/api/requests`, `/api/inquiries` | Public submissions |
| `/api/account/profile` | Read/update whitelisted profile fields |
| `/api/account/drafts` | Read/save/delete the current account draft |
| `/api/account/notifications` | Scoped pagination/unread count and read-one/read-all |
| `/api/account/requests` and `/:id` | Scoped search/filter/list, detail, edit/cancel |
| `/api/account/requests/:id/messages` | Client/staff replies and staff-only notes |
| `/api/account/inquiries` and `/:id` | Scoped search/filter/list, portal submission, detail |
| `/api/account/inquiries/:id/messages` | Replies with original duplicate/status semantics |

Controllers/DTOs, services and private persistence helpers are separate. DTOs retain the original normalization and error codes; request-field constraints delegate to the unchanged shared source validator. Ownership always comes from the server session. The public request source actually stores the submitted contact name/email even when logged in, despite its comment suggesting otherwise; that observed behavior is preserved. The separate portal inquiry endpoint always uses the session name/email, also as in the source.

## Transactions, authorization and compatibility

Public request rate windows remain 3/10 minutes and 8/day, now shared in MariaDB. Submission validation/bot checks still precede that quota. Account inquiry quota is keyed by user and public inquiry quota by network. A hashed OperationLock serializes duplicate request submissions across connections; the existing same-email/description 30-minute rule remains. Request/inquiry parent-row locks serialize replies, duplicate retries and state transitions. A client reply to awaiting_info creates one transition to in_review even with concurrent retries. Internal notes require the original staff permission; clients cannot send or read them. Inquiry account ownership retains the original owner/assigned-staff 404 semantics; request denial retains 403.

The request record, audit, in-app notices and encrypted outbox jobs commit atomically. Staff notification inserts are batched and staff recipient data is fetched once, avoiding a per-recipient user lookup. List responses use fixed query counts with joined/aggregate projections rather than per-row relationship queries. All external values are bound parameters; persistence identifiers are restricted to the frozen schema or fixed whitelists.

Source SQLite LIKE folds ASCII but not accented/other Unicode letters. The MariaDB query explicitly reproduces that behavior and selects an escape character while escaping only that character in the bound pattern. This preserves literal backslashes and source `%`/`_` wildcard semantics. Real SQLite reference expressions are compared with actual MariaDB results, including `Café`, `Äpfel`, mixed ASCII and backslash/underscore cases. A generic case-insensitive MariaDB collation is not used to hide these differences.

Read/unread timestamps and returned projections follow the source. Inquiry duplicate replies retain HTTP 200 while new replies return 201; request duplicate replies retain the source's 201. Legacy and v1 routes execute the same service. Invalid page numbers are handled as page one instead of producing a database error; valid pagination remains unchanged.

## Explicit corrections

- The source includes attachment metadata from internal-note messages in a client's detail result. Client projections now exclude those linked attachments as well as the notes, with negative tests. The subsequent [files/claims portion](files-and-claims.md) extends this check to actual private downloads.
- Oversized drafts were sliced mid-JSON by the source and later silently discarded. The target rejects payloads over the same 20,000-character bound with a field error and retains the prior draft; a real database test proves no loss. Valid/incomplete drafts retain the source allowed fields and per-field truncation.
- Registration/recovery rate admission now runs before body parsing and DTO validation, correcting a migration regression found during this phase. Malformed JSON and invalid fields count once, including through legacy/v1 aliases. An in-process single-use permit prevents double charging when the service is called after successful validation; direct service calls still enforce quota. Source field-error precedence for short/long/weak registration passwords is explicitly preserved.
- Mutating public endpoints use the configured Origin/CSRF policy. Non-browser clients without Origin must obtain a CSRF challenge as documented for the new server session boundary. Arbitrary forwarded headers never choose the rate-limit identity.

## Durable webhook worker

Migration 6 adds OperationLock and WebhookJob; it does not rewrite existing Website records. An optional NOTIFY_WEBHOOK_URL job is enqueued in the request transaction. Its immutable URL and original JSON payload are AES-256-GCM encrypted with a webhook-specific authentication domain, and its deduplication key/digest prevents conflicting re-enqueue. URLs, contact payloads and provider bodies are not printed in worker logs.

The existing independent Node worker alternates mail and webhook claims. Webhook reservations use SKIP LOCKED, expiring leases, heartbeats and fencing. Connection refusal/DNS failure before dispatch can retry with bounded backoff (four attempts). An abandoned reservation can be reclaimed; a job lost after dispatch, ambiguous disconnect or HTTP 5xx/429 is marked uncertain and is not blindly resent. A successful HTTP response marks the job sent and stamps ProjectRequest.notifiedAt in one database transaction. This means receiver acceptance, not proof of downstream processing. No exactly-once claim. Operators must reconcile uncertain jobs with the receiver before any separately designed redrive operation.

Actual local HTTP tests cover competing enqueues/claims, payload corruption, abandoned leases, stale owners, refusal/retry/exhaustion and ambiguous failures. A separate compiled-worker smoke test SIGKILLs the real Node worker after the receiver sees the request body, restarts it and observes zero ambiguous resends. Mail worker crash/restart checks remain intact. No external webhook or SMTP destination was contacted.

## Evidence and remaining scope

`evidence/business-services/` contains unit/integration, compiled-process, browser and contract results. Read contracts are compared against the unchanged Website application for owner, another client and support across seven account routes (21 comparisons). Only documented volatile activity fields are omitted from equality: lastLoginAt, clientReadAt, staffReadAt and updatedAt; IDs, stored content, status, ownership, messages, attachments and all other returned values are compared. Source and target fixtures are isolated synthetic copies.

Browser cases exercise the original public request form, validation focus, its draft, successful persistence and queued notification, plus legacy/v1 account contracts and rejected cross-account/internal-note operations. Recovery has a separate fixture account so password-reset tests cannot alter the login credentials used by unrelated cases. Query instrumentation counts actual MariaDB statements and requires the request list to stay at two statements when a page grows from one to twenty records; it does not substitute a mocked repository.

This is not complete phase C: admin operations and the last-active-admin invariant still need migration/acceptance. Request claiming and file/media routes are implemented in the subsequent [files/claims portion](files-and-claims.md). Private account/admin screens and the full editor are not yet ported. Complete workload performance, full operational backup/restore with the new queues and final cutover/rollback rehearsal remain required. No production data was available or migrated. No deploy, domain change, release or merge occurred. Before reopening writes a rollback requires the matching database/files/queue/key snapshot; after reopening, preserve new writes and recover forward.
