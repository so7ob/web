# Complete bounded administrative export — #44

Confirmed at develop `85ab40b8c7558f0590c684c4eb1031fbae678a66`: requests.from was
ignored by CSV, SQL silently stopped at 5000, and both UIs announced success after
window.open. A regression reproduced list total 0 with an older row still exported.

List/export now share filters. `from` remains requests-only, matching the actual
API; the UI still sends only its existing supported filters. CSV columns, BOM,
Arabic, permissions and formula escaping remain. A repeatable-read snapshot is
read in batches of 250 with stable date/id ordering, selecting exported fields
rather than description/payload columns. Rows are written to a private temporary
file. No CSV response headers are sent until preparation and audit succeed.

Operational limits: 100,000 rows, 32 MiB, 30 seconds of preparation, two concurrent
exports per API process including prepared downloads, 60 seconds to consume the
file. Limits produce explicit 413/503; no successful partial file. Count appears in
X-Export-Count on success and in row/byte-limit error metadata. Connections and
failed/completed temporary files are released; a 60-second expiry bounds abandoned
prepared files. A process crash can leave private OS temporary files; staging must
provide normal temporary-directory cleanup and disk monitoring. Limits are guards,
not tested capacity promises. No new service or production configuration is applied.

The browser checks status, CSV content type, completed body and length before
requesting a download. It reports readiness, never filesystem-save success. Error
feedback covers sessions, permissions, limits, server and network failures. The
bounded browser Blob can occupy up to 32 MiB. No external requests are added.

Tests include 5105 synthetic rows, from-filter agreement, existing formula defense
and permission/audit checks, plus HTTP 401/403/413/500, network, login HTML and
truncated responses. Actual tested SHA/results belong to the PR. Full acceptance
is pending its gates; no production run or larger capacity claim.

Independent branch from develop. No migration/data changes. Roll back through a
reviewed revert PR; existing records and jobs are unaffected.
