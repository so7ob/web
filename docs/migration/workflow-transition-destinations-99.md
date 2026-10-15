# Manual workflow action destinations (#99)

Base: fetched `develop` at `a904aba8fc4ad3babdd2dad588c7a40e8896c719` on 2026-10-15. This is an independent issue branch, with no stacked dependency. Recent media draft, pointer-state, inquiry hydration and version-identity fixes (#130/#131/#137/#141/#121) were excluded from the candidate review. No new reproducible engine defect was established. [Issue #99](https://github.com/so7ob/web/issues/99) is a bounded P2 improvement: indistinguishable manual actions can cause an operator to choose the wrong destination. Broader transfer comparison and SLA display (#128/#100) remain separate.

## Current-base reproduction

A controlled browser probe published a synthetic clone of the inherited request workflow and opened its request detail. Four enabled options had the exact accessible name `انتقال`, despite four different destinations:

| Transition ID | Actual destination |
| --- | --- |
| `new-in_review` | قيد المراجعة |
| `new-awaiting_info` | بانتظار معلومات |
| `new-in_progress` | قيد التنفيذ |
| `new-cancelled` | ملغى |

The probe asserted this ambiguity on the unchanged base and passed in 2.8s. Its synthetic JSON evidence SHA-256 is `39ead4c9e48ac242172e5af9c799eeb5cc58b385705d512117cbc53c398a591b`. The permanent component regression also failed before the change: 12 destination/confirmation/compatibility cases failed, while four legacy-status cases passed.

## Change and invariants

`WorkflowState.transitions` gains optional response-only `targetStage` metadata (public Arabic/English names and status). The engine projects it from the record's pinned published definition, **after** the existing allowed-transition filter. Stored definitions, draft validation and `WorkflowTransition` remain unchanged. The client needs neither a workflow overview request nor `workflows.view` permission to identify a destination.

Manual options now show the action's original localized name followed by the localized destination, for example `انتقال إلى فحص بشري` / `Move to Human review` and `تدقيق مخصص إلى فحص بشري` / `Custom audit to Human review`. Custom names are retained. A response from an older server without metadata explicitly identifies the actual stage ID; it never guesses a custom stage's title from a status code. The required-reason dialog repeats the same complete label as its accessible description and uses a transition confirmation title. Legacy status labels and patch behavior remain intact.

Transition IDs, expected revisions, operation UUIDs, required reasons, authorization, stage visibility/routing, CAS, idempotency, version pinning, event persistence and audit implementation are unchanged. No schema migration, permission definition, deployment or production record operation is included.

## Verification

New component coverage contains 16 cases across Arabic/English and requests/inquiries: distinct inherited destinations, custom action names and exact payload IDs, required reasons and dialog descriptions, older response metadata, read-only controls and legacy patch behavior. All 16 passed after the fix.

The workflow integration file passed 15/15 on real isolated MariaDB, including two new scope cases. They verify allowed IDs, no added workflow-view requirement, view-only and assignee-only rejection, pinned names after a draft rename, unchanged published definition bytes, custom action execution and the resulting named history. Existing concurrency, reason, reply, timer, transfer, permission and visibility assertions remain intact.

The new browser matrix covers both languages, scopes and 375/1280 widths. It uses real publications, API transitions, keyboard selection, exact accessible option names, required-reason confirmation/cancellation, axe, overflow, immutable definition comparison, event version/destination/actor/reason and audit entries. It authenticates a synthetic staff member with existing record view/status permissions and verifies the workflow overview remains forbidden. The existing workflow journey retains its exact custom-action assertion with the destination added. The new spec is mandatory workflow smoke, so future workflow-only UI changes retain this coverage. The gate's synthetic catalog includes it and rejects an omitted spec even when reports match that reduced catalog. No gate, retry or timeout policy is relaxed.

The first browser attempt exposed an error in the new fixture: requests do not allow `new -> closed` in the inherited definition. That run was stopped after its first failure. The fixture now uses the existing `new -> cancelled` edge for request confirmation and `new -> closed` for inquiries; no product rule was modified. Original failure evidence is retained locally.

Subsequent local browser diagnostics corrected test assumptions about the initialization event/revision and long synthetic selector text. The tests now compare exact pre-action state, preserve prior events/audit rows and require one new actor-owned transition. A full-page axe scan with Radix Select open reports focusable elements in its existing aria-hidden background; the page is therefore scanned in full before opening, then the active listbox is scanned with all the same WCAG rules enabled. Radix dismisses Select on window resize/blur: full-page screenshot capture was closing the popup before the next action. Popup screenshots now capture the viewport; axe uses its documented same-page `setLegacyMode()` to avoid temporary result-page focus changes, and the test verifies the selected option remains visible before keyboard execution. The reason dialog retains a full-page axe scan. No axe rule is disabled and no existing accessibility assertion is removed. TypeScript also rejected a Playwright-only `exact` option in the new Testing Library tests; removing that unsupported option retains Testing Library's default exact string matching.

The final source-tree focused browser matrix passed **20/20 in 5.5 minutes**, without retries: all 16 new Arabic/English request/inquiry cases at both widths and all four existing workflow journeys. Component cases passed 16/16, the workflow integration file passed 15/15, corrected TypeScript and production build passed, and CI policy (13/13), independence (3/3), documentation, infrastructure and diff checks passed. Complete local unit/integration results and exact-head canonical CI evidence are recorded in the PR. Pending checks are not represented as passed.

All data uses new isolated `so7ob_issue99_browser_test` / `so7ob_issue99_unit_test` databases and synthetic `.invalid` accounts on loopback. Fixture cleanup has a separate budget and removes only its owned records, events, jobs, versions, bindings, calendar, staff account and synthetic role. Existing role definitions and workflow bindings are preserved.

Local pinned Chromium 151 download remains blocked by HTTP 403; local browser checks use installed Chromium 154.0.8037.57. Canonical CI supplies pinned-browser evidence. Local infrastructure uses the existing extracted Nginx wrapper for disposable compiled temporary paths. A full local serial browser run is not claimed in place of complete CI. Rollback is a revert of the issue commit; no persisted format changes require recovery.
