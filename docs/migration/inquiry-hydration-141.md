# Inquiry creation readiness (#141)

Base: fetched develop `5e69750fb535d98c1807aef1db784c81b0cc0ce8` on 2026-10-15, after the reviewed #136 merge. Remote branch/PR searches found no duplicate #141 work before creating `fix/141-inquiry-hydration`. No #131 or #137 source/tests are changed.

## Proven cause

[Issue #141](https://github.com/so7ob/web/issues/141) retains the original [CI 202 failure](https://github.com/so7ob/web/actions/runs/38690153560/job/116274949018) and [trace artifact](https://github.com/so7ob/web/actions/runs/38690153560/artifacts/11951199952). The issue's recorded evidence is an enabled, focused create button after a completed click, a missing subject field/dialog, successful page/list GETs, no inquiry POST and no recorded page/console error. Its initial hypothesis was tested against the unmodified application at the base SHA, rather than inferred solely from the original timing.

A local probe held the real `/assets/inquiries-*.js` request before `entry-client.tsx` could finish resolving matched lazy routes and call `hydrateRoot`. The server-rendered Arabic administrator create button was visible and enabled. Three real pointer clicks completed and were counted by a native document capture listener, yet no dialog or inquiry POST occurred. Releasing the chunk caused the first inquiry GET from the React effect. The earlier clicks were not replayed; one new click on the same button opened the dialog. There were no page errors. This probe passed in 8.7 seconds by asserting the broken sequence explicitly:

```json
[
  {"phase":"SSR / real lazy chunk held","chunks":1,"lists":0,"posts":0},
  {"phase":"three native clicks completed without a dialog","clicks":3,"lists":0,"posts":0},
  {"phase":"React effect ran after chunk release; clicks were not replayed","lists":1,"posts":0},
  {"phase":"same button opens dialog after listener attachment","lists":1,"posts":0,"errors":[]}
]
```

The permanent regression was then run against the still-unmodified application. It failed at `toBeDisabled()` with expected disabled / received enabled while the real route chunk remained held. The original failure report, screenshot, error context and trace were copied into ignored local evidence before the next browser run. Trace SHA-256: `b23ae7be5f62f5465ba0f6a1a45f460c7435925aa7e345d369363a53a02d0b38`; report SHA-256: `6c1495ac077728e63a164b4689d0d3c11edd3a2d298e830210cda50d2e7b4525`. These hashes identify retained local evidence, not a claim of remote upload.

## Correction and coverage

Both create buttons now use the same local post-mount readiness pattern already present in login and profile editing. Their SSR and initial client render are disabled and marked `aria-busy`; a React effect enables them only after the click handler has been installed. They advertise a dialog and retain their translated labels, native button semantics and design tokens. No request, persistence or permission condition gates opening the dialog. The change does not queue an early user intention: unavailable controls remain inert, and one activation opens the dialog once ready. Existing bootstrap failure feedback remains in place.

Three separate contracts cover bootstrap readiness, ready-dialog interactions, and back navigation with delayed reload. Each runs in Arabic/English for admin/client roles at 375/1280 widths, totaling 24 new cases. Each owns a fresh synthetic account cloned from the isolated run's matching role, with an independent fixture teardown budget. A real route-chunk gate controls initial bootstrap and reload. Cases check disabled SSR controls, inert early/repeated pointer input, post-mount availability, both create buttons, single/repeated activation, keyboard opening, dialog name, initial focus, focus wrapping, Escape/cancel focus restoration, discarded input, back navigation, delayed reload, axe and absence of inquiry POSTs/page errors. Timeline JSON is attached to each passing case.

The existing account-inquiry ownership journeys retain all their actual POST/201, conversation, reload, list uniqueness and administrator detail assertions unchanged. Server authorization and ownership tests remain unchanged. CI policy registers the new spec in the request domain; test infrastructure edits still select full CI. No assertion, retry policy or test/body deadline is weakened.

## Verification and limits

Final source-tree local checks and exact-head CI results are recorded in the PR validation section, including the before/after regression result. Pending checks are not represented here as passed. Local checks use Node 24.21.0/npm 10.8.2 and fresh isolated MariaDB databases `so7ob_issue141_browser_test` and `so7ob_issue141_unit_test`, with synthetic accounts and loopback services only.

The first combined local matrix passed all eight unchanged ownership journeys and six of eight combined regressions (14/16 total). The English mobile admin journey reached its unchanged 30-second body deadline after successful dialog/keyboard/repeated-activation checks, during the back/reload sequence; fixture cleanup then removed the account before a pending reload completed. The English mobile client journey completed its UI assertions but reached the deadline with slow context teardown (26.6s recorded). Their original reports/traces are retained locally. The regression was decomposed into the three independent contracts above, retaining every interaction/assertion across every role/locale/width, rather than increasing the deadline or adding retries.

After decomposition, the full focused local matrix passed **32/32** in 5.9 minutes: all 24 new cases plus all eight unchanged creation/ownership journeys, without retries. The earlier failed combined matrix remains part of the evidence; it is not replaced by this result.

The environment blocks the pinned Chromium 151 download with HTTP 403; local browser checks use installed Chromium 154.0.8037.57. Canonical CI remains the pinned-browser proof. Local infrastructure checks use the existing extracted Nginx wrapper that only moves compiled temporary paths into the check's disposable directory. A complete local serial browser run is not substituted for the canonical complete CI catalog.

Risk is limited to the short disabled interval before inquiry listeners exist. No authentication, role permissions, schema, ownership service, workflow or design fixture changes are included. Rollback is a revert of this issue's commit. The PR remains Draft for review; no PR merge, deployment or permission change is authorized by these checks.
