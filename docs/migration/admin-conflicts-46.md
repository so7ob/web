# Menu and settings optimistic concurrency — #46

A real MariaDB regression at develop `85ab40b8c7558f0590c684c4eb1031fbae678a66`
reproduced two readers followed by sequential writes: the stale write succeeded.
The new regression fails on that behavior before implementation.

An explicit additive AdminRevision migration stores server-owned integer revisions.
Settings revisions are per key; menu revisions are per location. Snapshot reads
pair values/revisions consistently. Within the existing authorized/audited
transaction, an UPDATE with the expected revision accepts one winner; all content
and revision changes roll back together on conflict or audit failure. Different
settings keys can merge. Browsers do not provide timestamps or increment versions.

The UI uses `/api/v1/admin/settings/checked` and `/api/v1/admin/menus/checked`.
Missing revisions return 400/revision_required; stale revisions return 409/conflict.
Unsaved controls remain on conflict. A review panel preserves the user's draft in
user-scoped session storage, can fetch the current version and reload it while
keeping the draft available, including across page reload. Storage-disabled
browsers retain the draft only in memory. Nothing retries or overwrites automatically.

## Compatibility boundary

Legacy `/api/admin/settings`, `/api/admin/menus` and their existing v1 aliases
retain their unchecked write contract, and now advance revisions. Their callers
can still overwrite newer content; they are not claimed protected. Such a write
invalidates protected readers' snapshots. Migrate external clients explicitly to
the checked endpoints before separately deprecating old writes. Direct SQL tools
must likewise not be represented as protected API writers. Permissions are
unchanged; no account/session/hash migration occurs.

Tests reproduce stale sequential/concurrent settings/menu saves, disjoint settings,
legacy interference, missing revisions and denied actors on MariaDB. Browser
checks compare two editing pages, review/reload/draft persistence, locales/widths
and axe. Results/SHA and remaining checks are recorded in the PR.

Independent branch from develop. Revert code through reviewed PR if required;
leave additive AdminRevision data in place. Destructive down migration is disabled.
