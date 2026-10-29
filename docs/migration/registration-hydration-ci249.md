# Registration hydration race after CI249

Post-merge CI40779837547 on develop 08d0675 failed functional shard 1
(job 123140163660): auth-public.spec.ts:31 timed out awaiting the registration
POST; 109 cases passed and 1 failed. The aggregate correctly failed. CI248's
premerge success does not establish a postmerge pass.

## Reproduction and correction

RegisterForm exposed enabled controlled inputs in SSR while initializing their
React state to empty strings. LoginForm already gates first interaction until
hydration. A controlled probe on the unchanged application holds the auth chunk,
enters the SSR name, releases hydration, enters the other fields and submits.
The entered name becomes disconnected from React state: required-field validation
fails and zero registration POSTs occur. This is a reproducible product race
consistent with the observed missing response, rather than a reason to extend
the test timeout. Exact CI trace attribution remains limited: the authorized
artifact connector returned a file reference, but local download returned HTTP403.
No alternative route or network policy change is used.

Registration now follows the existing login pattern: name, email, password,
confirmation and submit remain disabled until the mount effect completes.
The form exposes its busy state while initializing/submitting. Server auth,
validation, outbox encryption, tokens and permissions are unchanged.

The new delayed-hydration regression fails on the old build because the name
field is enabled. It holds the real auth chunk in AR/EN at 375/1280, asserts all
controls disabled, releases it, checks enabled state and accessible contrast,
then uses first keyboard input, mismatch validation and correction to submit
exactly one successful request with unchanged entered values. Original public
authentication, encrypted-outbox and one-use-verification assertions remain.
There are no forced clicks, sleeps, retries, skips, reduced-motion overrides or
timeout increases. This is separate from #147's unproven Chromium retry trigger.

## Publication and verification

The issue-creation action was rejected by automatic approval review because it
considered the proposed external publication insufficiently authorized. A local
branch and concrete implementation/tests are prepared without publishing the
same information through a different route. The exact rejection and local
results are retained under ignored .migration/acceptance/ci249. Final pass/fail
counts and tested source must be reported there; no pending check is claimed
successful. Issues #179/#180/#147 remain open. No production or main change occurs.

The first post-fix focused run passed 15 cases and failed 3 with real HTTP429:
the four extra successful registrations exceeded the unchanged three-attempt
shared-IP limit across projects. Each new synthetic test now snapshots the exact
registration bucket and restores that entire snapshot afterward; it does not
identify and remove an individual contribution. This requires one worker,
fullyParallel:false and an exclusively owned database per shard. The test asserts
the two runner settings; separate database ownership is a harness prerequisite.
The completed local full run used so7ob_registration_shard1_test through
so7ob_registration_shard4_test, respectively, on loopback ports 3602/3603,
3604/3605, 3606/3607 and 3608/3609 (HTTPS/API). No database was shared by shards.

The original saved-length-plus-one assertion was invalid if an existing timestamp
expired from the 24-hour window during the test. The follow-up seeds one already
expired timestamp, then checks the exact surviving timestamps plus the newly
charged server timestamp, bounded by the request's start/end time. This exercises
actual pruning and handles expiry during the request without relaxing the count
of charged attempts. Finally restores the original timestamps and updatedAt, or
removes the test-created bucket if none existed. Earlier attempts and all original
auth assertions remain; no production rate limit, proxy identity or auth policy
is changed. Snapshot restoration is not safe with another writer to this bucket.
