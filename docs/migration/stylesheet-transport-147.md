# Stylesheet transport investigation (#147)

Base: develop `e8d0f6cf7367d8732abaa179a1c118010cd86f5e`.
The saved checkout started at `f3935f3`; its origin fetch refspec only covered
main, so fetching develop did not refresh the old origin/develop reference.
This branch was explicitly fast-forwarded to the verified remote develop SHA.
No open PR duplicated #147 when work began.

## Evidence and scope

Issue #147 and its comment attribute two CI failures to a terminal Chromium
stylesheet request failure (`net::ERR_TOO_MANY_RETRIES`), preceding axe or
mobile overflow failures. The old artifact download returns HTTP 403 in this
environment. Those raw-trace observations remain attributed to the parent,
not independently downloaded here. They establish the downstream unstyled
page, not which Chromium retry counter was exhausted.

This change installs observation before navigation in the account and deadline
journeys. Terminal stylesheet transport/HTTP failures survive later requests
and navigations and are attached even if another assertion fails. Before axe
and deadline layout measurements, the real document stylesheets must contain
readable rules and the application preflight must be applied. A non-null sheet
alone is insufficient. No reload, replacement fetch, timeout increase, changed
UI, assertion removal, or trust change is used.

Deterministic browser cases cover a held stylesheet, aborted load, HTTP failure,
empty CSS, a successful later XHR, and a healthy later navigation. Negative
cases assert that the readiness check fails rather than suppressing failures.

The affected browser workers record default-mode Chromium NetLog (20 MiB bound
per worker) under ignored `.migration/e2e/netlog`. CI retains those synthetic
logs with its existing browser artifacts. Browser close flushes each worker's
file. Use `node tools/test/stylesheet-netlog.mjs <file>` for a redacted event/error
summary; inspect the linked source IDs in the raw synthetic log to distinguish
certificate/auth restarts from connection-error retries. Counts alone do not
prove causality. Do not run these fixtures against production or real data.

## Validation in progress

Local build, lint, typecheck, independence and the NetLog summary unit test pass.
The focused account/deadline/readiness browser suite and full unit/integration
suite are running on separate isolated MariaDB 10.11.18 databases. Local browser
is Chromium 154; the pinned Chromium 151 download is denied HTTP 403 even after
an approved escalation. Node initially is 24.19; Node 24.21 was obtained via npm.
Infrastructure syntax validation cannot complete locally because nginx is absent.
Required CI must be tracked on the exact published head; no passing CI claim yet.

## Remaining work and review boundary

Transport root cause is not yet proven. This is an investigation draft, not a
claim that #147 is resolved. A passing run alone cannot prove the intermittent
failure fixed. Preserve the original checks and use captured failure evidence
before selecting a transport change. Parent reviews merge readiness; no merge
or deployment is authorized here. Rollback reverts this isolated test/diagnostic
change, leaving product behavior unchanged.

## Prioritized independent queue

1. #147: establish transport retry cause and retain primary failure evidence.
2. #153 (P2): preserve allowlisted contact CTA service/type across language switch;
   independent next issue, with regression coverage for #110/#116.
3. #156 (P2): advance notification pagination only after confirmed success.
4. #103 (P3): synchronize admin notification header count after confirmed reads.
5. #159 (P3): complete Arabic permission-group titles with a nonempty fallback.

These remain open with no open duplicate PR at inspection. Reproduce each on
current develop before implementing. #162–#175 are proposed roadmap work with
explicit planning-only status, not substitutes for the confirmed bug queue.
