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

Browser workers record default-mode Chromium NetLog (20 MiB bound
per worker process), retaining the original shared browser lifecycle, under ignored `.migration/e2e/netlog`. CI retains those synthetic
redacted counter summaries only; raw logs are never included in CI artifacts. Local capture requires `SO7OB_E2E_NETLOG=1`. Browser close flushes each worker's
file. Use `node tools/test/stylesheet-netlog.mjs <file>` for a redacted event/error
summary; inspect the linked source IDs in the raw synthetic log to distinguish
certificate/auth restarts from connection-error retries. Counts alone do not
prove causality. Do not run these fixtures against production or real data.

## Validation in progress

Local build, lint, typecheck, independence, 15 CI-policy/summary tests and all
1149 unit/integration tests pass. The first focused account/deadline/readiness
run passed 40/40 in 4.8 minutes on isolated MariaDB 10.11.18. After moving NetLog
from a browser fixture override into the existing launch configuration (to
preserve browser lifecycle), the same 40-case suite passed again (40/40,
4.5 minutes; no skipped, flaky or unexpected cases).

A separate bounded probe loaded the real built CSS 80 times in each of 15 fresh
contexts (1200 stylesheet loads), through synthetic loopback HTTPS. There were
zero terminal request failures. The retained NetLog contains certificate errors
but no ERR_TOO_MANY_RETRIES: this does not establish the CI retry cause.

Local browser is Chromium 154; pinned Chromium 151 download is denied HTTP 403
even after approved escalation and at the official Chrome-for-Testing mirror.
Node initially is 24.19; Node 24.21 was obtained via npm. Infrastructure checks
pass with Node 24.21 and an nginx binary extracted from the official nginx:stable
container, using only relocated temporary directories in the generated local
configuration. No service was started. CI supplies the canonical environment.

PR #178 is draft. CI run 38911421562 at ca518b4 passed build, operations,
all eight design matrices, both smoke jobs and functional shards 1, 2 and 4.
Shard 3 passed 109 cases and failed the English mobile identity accessibility
check; the aggregate correctly failed. This failure was not rerun blindly.

### Related readiness defect (#179)

The failing Add user button had contrast 3.47 (#fbfcfd on #448fb9) at
identity-management.spec.ts:150 after reload. UsersClient starts roles=[] and
loads role options independently; CreateUser disables the button while that
list is empty. The button transitions opacity from its disabled 0.5 state.
The old test checked the users API but not completion of role loading or that
opacity transition before axe.

A controlled role-options response gate now proves the reloaded button is
disabled at opacity 0.5, then releases the real request and requires enabled,
fully opaque rendering before the unchanged axe check. All four AR/EN and
mobile/desktop identity journeys pass locally with that gate. This preserves
all role, account, password, revocation and accessibility assertions; it changes
no product colors, motion preferences or timeout. Issue #179 records the CI
failure and the separate scope. This is not a transport fix for #147.

Required CI for the new head must still be tracked; no passing aggregate claim
yet. Neither local success nor a single green CI run resolves the intermittent
transport cause.

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
