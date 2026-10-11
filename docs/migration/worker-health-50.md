# Independent worker liveness and queue monitoring — #50

Proposed monitoring improvement; database/API readiness never established that the
worker process was alive. An explicit additive WorkerHeartbeat migration now
records each worker start, an independent five-second heartbeat, last completed
job/publication/cleanup activity and graceful stop. `--check` does not impersonate
a running worker. Idle workers can be healthy with no last activity. Abrupt loss
becomes degraded after 30 seconds; graceful stop marks the instance stopped.
Multiple workers are healthy when at least one unstopped instance is fresh.

`GET /api/admin/worker-health` and `/api/v1/admin/worker-health` require
`email.outbox`. They query only heartbeat timestamps and aggregate queue metadata:
known status counts, oldest queued/retry age, due/delayed counts and expired
leases, for mail/webhook/files. Unknown historical statuses are counted under
unknown. Reads never dispatch, claim, decrypt, requeue or modify jobs. Payloads,
addresses, tokens, errors, provider IDs and host identities are absent. No external
alerting, paid service, resend feature or new infrastructure is introduced.

The heartbeat proves process/DB contact, not that every dependency or delivery is
healthy. Queue metrics remain separate signals. Stopped/stale heartbeat rows are
retained for investigation; operational retention requires an approved housekeeping
policy. Deployment/schema credentials must apply the migration before starting
this release; production migration is not performed here.

Tests cover idle/fresh/stale/stopped states and nonmutation/privacy/permissions on
MariaDB. `test:worker` retains the existing real SMTP crash/no-resend test and adds
a real API/worker process check: stop worker, observe degraded while API readiness
stays 200; unauthenticated monitoring stays 401. Tests use isolated loopback only.
Actual SHA/results and any limitations are recorded in the PR.

Independent develop branch. Revert code via reviewed PR; additive table may remain.
No destructive down migration. This monitoring is not production readiness proof.
