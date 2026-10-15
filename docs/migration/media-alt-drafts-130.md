# Media alternative-text edit races — issue #130

## Source and environment

Base develop fetched explicitly from `https://github.com/so7ob/web.git`: `fc9f82035641682df6934051e6364f9527e30938`. Checkout was clean, origin fetch/push identities matched so7ob/web, and no open PR or issue comment indicated overlapping work on #130. #129 was already merged and was not changed.

Implementation and test source: `d54764f19369d7340bc5070fc42636da67d2fbd8`. The following evidence commit changes only this document; source blobs tested below remain the same at the PR head. Node 24.21.0, npm 10.8.2, isolated Docker MariaDB 10.11.18 on loopback port 33130. Browser fixtures use `so7ob_issue130_test`; the complete unit/integration suite uses a separate fresh `so7ob_issue130_unit_test`. No production data, external mail/webhook worker or paid API was used.

## Reproduction and root cause

The original component clears the entire `altEdits` map when a single PATCH completes and calls reload. A response for image A therefore resets the focused input for B. It can also reset a newer edit to A, and unrestricted repeated blur saves can race for the same file.

Before the edit, the initial ten component cases failed in Arabic and English. Browser reproduction against the base component, compiled into the real application, failed at `Keep second draft نص` becoming `Original 2` in all four ar/en × 375/1280 cases. The test delayed response delivery after `route.fetch` had committed image A to MariaDB, then edited image B. The final twelve component regression cases were also run against the original component: all twelve failed (plus two subsequent unhandled errors from the deliberately unsupported duplicate-save sequence). They pass with the fixed component.

## Final behavior

Each draft carries a local revision. A successful PATCH updates only the confirmed media row from the existing server response, clearing its draft only if that exact revision is still current. Sibling edits and newer edits survive. Same-file saves are serialized; duplicate blurs for a revision are coalesced and the newest explicitly blurred queued edit is saved next. Different files can save independently, and each retains its own pending indicator. Failure retains the current text and shows the existing translated error toast; a later blur retries it. Generic list refreshes preserve local drafts.

No API, permissions, schema, identity, layout, translation or deletion barrier was changed. Local revision tracking is UI state, not server optimistic concurrency. Unsaved text still lives in this mounted component; this change does not add persistence across navigation or page reloads, nor coordination between browser tabs.

## Verification and evidence

Ignored logs are in `.migration/issue130/`. Source tests are `media-client.test.tsx` and `tests/e2e/media-alt-drafts.spec.ts`. The new browser spec is registered in the existing CMS domain, with an assertion that affected CMS selection includes it; the unknown-spec fallback and exact coverage gate remain intact. This PR selects full CI coverage because it also changes tests and CI catalog files.

| Check | Result |
| --- | --- |
| Final component cases on original component | 12 failed; expected draft/race assertions (before-final-regression.log) |
| Final component cases after fix | 12 passed; sibling/newer drafts, reverse-order responses, duplicate blur, serialized saves, return to original value, failure/retry |
| Initial browser reproduction on base component | 4 failed at sibling text reset (e2e-before.log) |
| `npm test` on fresh unit database | 60 files / 980 tests passed (test-clean.log) |
| `npm run lint` | Passed: independent ESLint and design tokens |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm run test:independence` | Passed |
| `npm run test:ci-policy` | 13 passed; new browser spec classification retained |
| Focused browser run with system Chromium | 8 passed: new race spec and existing media-library spec, each ar/en × 375/1280 (e2e-after.log) |
| `git diff --check` | Passed |
| Standard full browser attempt | Blocked before journey: pinned headless shell v1234 absent; stopped at first environmental failure, 315 cases did not run |
| `npm run test:infra` | Blocked before configuration validation: nginx absent |

The browser race spec tests native Shift+Tab navigation from one image field to the other, Tab blur saves, mouse return to a field, delayed response delivery, failed save with visible error feedback, retry, same-image newer text retention, and MariaDB values after page reload. The existing media-library cases also pass axe checks and verify upload/folder/search and protected deletion in both locales and widths. No visual redesign was made. Successful local browser cases use system Chromium 154.0.8037.57 through an ignored config importing repository settings with only executable/path/reporter overrides; they do not establish pinned-browser/full-suite success.

The first full `npm test` attempt reused the browser database after public-content fixture setup and failed 11 tests (969 passed) in migration destination comparisons and settings assertions. Destination conflict evidence named fixture Page rows. The suite was rerun against a new empty isolated unit database and all 980 passed. No assertions were changed or synthetic destination rows removed to pass the suite. Separate databases prevent that setup conflict.

Remote CI is tracked in the PR description against its actual head and must complete before review acceptance. The two prior design-system QueryFailedError observations remain outside this change; no claim about fixing them is made. Revert the implementation commit to roll back; no migration or data repair is needed. Keep the PR Draft for independent review and merge decision; no merge or deploy is authorized here.
