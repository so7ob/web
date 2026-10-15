# Deferred keyboard focus synchronization (#145)

Base: fetched develop `3e5dd07754410f16026a6c17cb806a280b2b7e61`, the merge of #144. [Issue #145](https://github.com/so7ob/web/issues/145) tracks the postmerge CI failure. Work on #100 is paused and preserved locally on `fix/100-workflow-deadline-timezones` at `8b16ae8d3b065bc9d210614e04f4156b2cd726d2`; none of that implementation is included here.

## Diagnosis

[CI #212](https://github.com/so7ob/web/actions/runs/38715826853) failed one Arabic inquiry cancellation/reopening case in [mobile smoke](https://github.com/so7ob/web/actions/runs/38715826853/job/116359633852), with 33 other cases passing. The failure is the exact option-focus assertion before Enter, not a transition HTTP or data failure.

The parent's independent reading of [artifact 11962623759](https://github.com/so7ob/web/actions/runs/38715826853/artifacts/11962623759) identified five ArrowDown calls between 43829.650 and 43893.879. The desired decision option was highlighted at 43897.206 and active when the helper checked it at 43904–43909, then another pending movement focused the following option before the assertion at 43913.155. The popup remained open, with no Enter or transition POST. These raw trace observations are attributed to the parent; this environment verified the job log/stack, but downloading that artifact locally returned HTTP 403.

The installed pinned `@radix-ui/react-select` is 2.2.6. Its keyboard handler derives candidate nodes from the event target and schedules `focusFirst(candidateNodes)` with `setTimeout`. The previous helper awaited key dispatch and immediately checked `activeElement` on the next loop. A completed keyboard RPC therefore did not establish completed focus movement. Multiple arrows could compute candidates from stale focus, or a pending move could overshoot after the target check.

## Deterministic reproduction and fix

The regression opens the real inquiry detail's Radix listbox using real keyboard events, chooses the reason-required destination, cancels, reopens, and establishes its initial option with Home and an exact focus assertion. It then intercepts only zero-delay tasks scheduled during an ArrowDown event inside that listbox. The queued callbacks are Radix's actual focus callbacks; the fixture does not replace them with a synthetic focus implementation.

The helper's focus waiter is injectable only for this controlled test. Before releasing a held callback, the regression requires exactly one pending callback, releases it, and verifies the actual expected option is focused. The default waiter is the unchanged exact Playwright focus assertion. With the old loop, this same test failed with **expected 1 pending task, received 6**. Red evidence is retained locally: report SHA-256 `eb16385ad76959d5597253b66424be4e634917e89bb8eb6450d3c54e5e888c16`; trace SHA-256 `56d10f7036121aea5807a0f2ff1fa08eb23d87cca8e439648205a7248be315a6`.

Reproduction source is independently reviewable at commit `b587dba40161c5b9fc7d471a5b0e0da99e27eda2`: it extracts the unchanged old loop with the injectable assertion and adds the failing controlled regression. The following commit applies the synchronization fix. Only the final branch head is submitted for CI.

The corrected helper waits until focus is within the open listbox, resolves the destination among enabled options, and awaits the exact next option's focus after every real arrow. It handles the disabled current-stage option that Radix can initially focus. The final exact destination-focus assertion remains directly before Enter, independent of the injected waiter. The controlled case requires three individually settled arrows from its established first option, reopens the correct reason dialog, and verifies no transition POST or record-state change occurred.

Two initial fixture attempts exposed setup assumptions rather than the intended race: initial focus can be on the disabled current-stage item, and resetting the capture flag in a microtask can precede the React key handler. Setup now establishes Home focus explicitly and brackets capture with actual event propagation/key-up. The retained red test above ran after those corrections and before the helper fix.

All 16 existing Arabic/English request/inquiry journeys and their HTTP payload, history, audit, cancellation, reason, axe, overflow and viewport assertions remain. Two new locale cases run in both existing projects, adding four deterministic regressions to mandatory workflow smoke. No product code, permissions, stored data format, business transition rule, timeout, retry policy, skip or expected-failure setting changes. There are no sleeps or direct option clicks in the tested selection.

## Validation and limits

Focused final-source and exact-head CI results are recorded in the PR, separately from any local full-suite limits. No complete CI run was restarted as diagnosis: the first failed postmerge run remains intact, and a new issue-branch CI follows controlled reproduction and focused validation.

The exact controlled Arabic mobile case passed after the fix in 5.8s, with pending callback counts `[1, 1, 1]` and zero transition POSTs. The final focused matrix passed **20/20 in 247.865s (4.1 minutes)**, with zero skipped, unexpected or flaky cases: all 16 original journeys plus both new locales at both widths. Local lint, TypeScript, CI policy, independence, infrastructure, documentation and diff checks passed. Complete unit/integration and canonical CI results are reported separately in the PR.

All records/accounts are synthetic in isolated `so7ob_issue145_browser_test` / `so7ob_issue145_unit_test`, with existing independent fixture cleanup. The test restores its timer/listener interception in `finally`. Local pinned Chromium 151 download remains HTTP 403; local acceptance uses Chromium 154.0.8037.57 and CI supplies pinned-browser evidence. Local infrastructure uses the existing disposable Nginx wrapper. Complete local serial E2E is not claimed. Rollback is a revert of this test-only change; merging and deployment remain for parent review.
