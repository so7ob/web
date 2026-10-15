# Workflow draft protection — issue #131

## Source and reproduction

Work began with a clean workspace after fetching `develop` explicitly from `https://github.com/so7ob/web.git`: `a6d17c9c73f459e6628c08f191caf45f66ac9e5d` (including merged PR #135). Issue #131 was open, unassigned and without comments. Open PRs, prior PR matches and remote issue-131 branches showed no overlapping implementation. The independent branch is `fix/131-workflow-unsaved-changes`; no commits target main/develop.

Tested implementation/test source: `8ea0ff36f78fa171bd0401f65fec4d5add6447d2`. A following evidence commit changes this document only. Local runtime is Node 24.21.0 / npm 10.8.2, MariaDB 10.11.18 in the disposable `so7ob-issue131-test` container on loopback 33131, with separate `so7ob_issue131_unit_test` and `so7ob_issue131_browser_test` databases. Accounts, workflows and definitions are synthetic. Fixtures create unpublished workflows and remove only the exact IDs they created. No production data, external delivery worker, mail, webhook or paid API is used for these form journeys.

The regression first failed at component level (`before-unit.log`), then in a real browser (`before-browser.log`). Selecting synthetic workflow one, changing its English name without saving, then selecting two replaced the name with two's saved value without a decision. The browser reproduction used the previously built UI; its workflow workspace/graph sources are identical to the newly fetched base. The source confirms `choose` directly replaced the local definition from the selected draft.

Two additional races were reproduced while validating the fix. A pending save of an unchanged definition could release a requested route after the save failed (`clean-save-failure-before.log`). A refresh started before a successful save could later replace the cached list entry, so selecting the saved workflow again showed old content (`stale-read-before.log`). Both now have passing regression coverage.

## Resulting behavior

The loaded or last confirmed definition is the comparison point. Object property order is ignored; array order and all workflow fields remain significant. Reverting an edit clears dirty status. Internal workspace tabs retain their existing local state, including the workflow definition; this issue does not add #132's query/deep-link contract.

Changing workflows, resetting to a new workflow or replacing its conversation type requires **Save draft and continue**, **Discard changes and continue**, or **Stay** when changes exist. Selection remains on the source until a decision completes. Copying as new explicitly preserves current content and produces an unsaved new draft. The dialog defaults focus to Stay, supports Escape/keyboard, restores focus and uses existing semantic design tokens with at least 44px targets. Dirty status has a textual live announcement.

Save is explicit and never implies publishing. Failed validation, conflict, uncertain writes and malformed acknowledgements keep the local definition and selection. Pending save failure cannot release a navigation even if the definition was initially unchanged. Save-and-continue only continues when the acknowledged snapshot still matches the latest definition. Newer edits remain dirty, retain the confirmed revision for the next write, and require a new decision. Cancelling the navigation while saving does not let its late acknowledgement navigate afterward. The existing busy fieldset remains; concurrent-edit component tests deliberately inject a later controlled-input change while the promise is pending to verify the defensive snapshot rule.

The existing draft endpoint additionally acknowledges its exact revision from the same transaction (0 for a create; the successful CAS increment for an update). No permission, validation, transaction, binding, publication, transfer, deadline or pinned-version rule changes. The client uses the existing shared schema to reflect server normalization only when no newer input exists. A new saved ID is adopted immediately, so a later write targets that workflow rather than creating another one. The local overview entry is updated from this confirmed snapshot without a second list read or changes to ordering.

Overview refreshes retain confirmations that occurred after a read began and ignore superseded responses. A later fresh read can show another editor's newer server state; confirmations are not a permanent overlay. Refresh does not silently replace the active local draft. Conflicts retain the server's CAS fence and never force an overwrite.

Application links and router-managed Back/Forward receive the same decision dialog. Same-page tabs/search/hash changes that retain this editor do not discard it. Modified/new-tab links preserve normal browser behavior. Reload, closing the tab, external navigation and history outside the router use native `beforeunload` protection; browsers control that prompt and may suppress it (including mobile process termination). Native prompts offer leave/stay, not an application-controlled save button. There is no new permanent or session browser storage and no definition/field data in URL. Explicitly leaving without saving, or a browser terminating the page without a prompt, does not promise recovery.

The existing graph scroll area had an ARIA label without an eligible role. The new whole-page axe check reproduced `aria-prohibited-attr`; adding its named region role preserves scrolling/keyboard behavior and fixes that observed violation. No axe rule was disabled or graph excluded.

## Verification and evidence

Ignored local evidence is in `.migration/issue131/`; trace/screenshots are disabled for the new journeys. Browser checks use system Chromium 154 through an ignored alternate configuration, separately from the pinned full-suite CI.

| Check | Result |
| --- | --- |
| Before-fix reproduction | Component failure plus confirmed browser loss on switching; `before-unit.log`, `before-browser.log` |
| Focused component coverage | 29 passed (`unit-stale-fixed.log`), including both languages, save/discard/stay, 400/409/503, new IDs, malformed replies, cancelled saves, newer edits, stale/fresh reads, route history, unload, and read-only permissions |
| Existing workflow integration | 13 passed (`workflow-integration.log`); exact save revisions and stale rejection added while retaining pinned publication/transfer cases |
| Full unit/integration suite | 65 files / 1054 passed (`test-delivery.log`) |
| New browser matrix | 32 passed (`e2e-delivery.log`), AR/EN at 375/1280, including the failed in-flight clean-save case; the preceding matrix passed 28 (`e2e-matrix.log`) |
| Existing smoke/workflow browser journeys | 8 passed (`e2e-existing.log`), including publishing, transfer, queues and ownership |
| Lint / typecheck / build / independence / policy / diff | Passed (`lint-delivery.log`, `typecheck-delivery.log`, `build-delivery.log`, `independence-delivery.log`, `policy-delivery.log`); independence 3/3 and CI policy 13/13; documentation and diff checks passed |
| Standard pinned-browser local attempt | 386 selected; 1 failed before a browser journey, 385 not run because headless shell v1234 is absent (`pinned-local-attempt.log`); not reported as a complete local pass |
| Local infrastructure check | Blocked before Nginx configuration validation: `nginx` executable absent (`infra.log` and `command -v nginx`); not reported as passed |
| Remote CI | Recorded against the exact final PR head in the PR description |

The browser matrix checks 375/1280, Arabic/English and RTL/LTR, real draft saves and unchanged other workflows, absence of publication, failure/uncertainty, a real 409 from a concurrent server edit, router Back/Forward, language navigation, cancelled native reload, keyboard Escape/Enter and focus return. Whole-page axe checks and dialog bounds/44px targets remain mandatory. The new spec is added to mandatory workflow smoke coverage; existing smoke specs and the strict complete-case gate remain. Its policy fixture grows rather than weakening any coverage condition; unknown/unclassified specs still select full coverage.

During test development, the first post-fix browser harness searched modal-hidden background fields by accessibility role, treated two full document visits as router-owned history, and awaited a cancelled reload as if a load would finish. Those harness failures are separate from product reproduction. The harness now checks the labelled background values, enters workflows through the real application link, and waits for the native prompt/dismissal. A subsequent run passed six cases and found the graph ARIA violation above. The initial complete suite passed 1052 tests; after the failed-in-flight-save correction it passed 1053. Final results above must be read against the final source, not those intermediate runs.

## Separate CI observation supplied by independent review

This is not part of #131's implementation or a claimed fix. The reviewer inspected the trace for [CI196 attempt 1](https://github.com/so7ob/web/actions/runs/38680821176/attempts/1) and established an existing `admin-configuration.spec.ts` race: waiting for Save to become disabled also accepts the saving state; the announcement click is ignored while saving, the subsequent line-21 action fails, and cleanup at line37 masks the original failure with the test timeout. The English case inherits the same phone value after the failed cleanup and therefore does not make Save enabled. The reviewer assigned this to a separate task. That test, its timing, assertions and product settings behavior are untouched here. A final open-work check found independent Draft PR #138 for #136, with no workflow editor paths changed; its implementation is not copied into this branch. The previous design-system QueryFailedError observations are also not claimed fixed.

## Rollback

Revert this issue's client/server changes together. There is no migration, live-data repair, permission adjustment or published workflow rewrite. Keep the PR Draft for independent review; merging, deployment and another issue are outside this task.
