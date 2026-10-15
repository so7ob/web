# Contact form drafts across languages — issue #110

## Provenance and reproduction

Develop was fetched explicitly from `https://github.com/so7ob/web.git` at `761e229ad9dbb8b2dbcac2c91c4acd36566d2ca6`. The workspace was clean, no open PR or issue comment indicated overlapping work, no remote issue-110 branch existed, and a search of prior PRs found no implementation of #110. Work is on `fix/110-contact-language-draft`. An environment interruption notification was received during the task; subsequent filesystem/Git/Docker reads confirmed the existing environment and files were available, and completed test logs were inspected rather than inferred from message acceptance.

Tested implementation/test source: `1df9357f7ff776b796e3ac011db15ab10b5d4817`; the following evidence commit changes this document only. Runtime: Node 24.21.0, npm 10.8.2, isolated MariaDB 10.11.18 on loopback 33110. Unit/integration database: `so7ob_issue110_unit_test`; browser database: `so7ob_issue110_browser_test`. All data, accounts and submissions are synthetic; no worker, external mail/webhook or paid API was used.

Both source hypotheses were reproduced before the fix. The original form loses the final change when unmounted before its 400ms localStorage timer. A separate integration test first confirmed a mobile-service draft was stored, then changed locale and observed CMS's automatic `service=web` URL rewrite replace it with web. Four of the first five form cases failed (one existing current-edit case passed), and the CMS-default integration case failed. On the original UI files from the base commit, browser native input/change and language activation in the same task lost the description in both AR→EN and EN→AR (`before-e2e-confirmed.log`). The initial browser harness incorrectly selected the request-type radio group as a select; that harness failure is not counted as defect reproduction and was corrected before the confirmed run.

## Behavior and privacy policy

Priority is current edits, then a validated same-owner tab draft, initial/server values, valid explicit URL prefills, CMS defaults, and empty values. Changing locale does not rerun prefills over current state. The CMS shell passes its default directly rather than writing it into URL.

Public form input is saved synchronously to tab memory and a versioned sessionStorage envelope, not the old unscoped localStorage key. Recovery snapshots expire 30 minutes after the last change, remain bounded and accept only known string fields and valid option IDs. Objects, unknown properties, client ownership fields, honeypot, locale and internal fill timing are excluded. Current live memory is preserved across client navigation even when a recovery snapshot expires; after reload, recovery requires an unexpired snapshot. The UI explains the retention period and account/send cleanup.

A single active owner is identified as guest or by the authenticated viewer's own ID, never name/email or an inspected authentication token. SiteViewBase.viewer gains that one manually projected identity field; the existing authenticated public-view response is no-store. No permission, session validation, database schema or request-ownership rule changes. Identity transitions clear the preceding tab recovery even on routes without a form. Explicit logout clears tab memory/session recovery as well as keeping the existing legacy logout cleanup. A client-generated 404 lacks authoritative identity, so it does not infer logout and erase current input.

The old global `so7ob-request-draft` is deliberately not imported: its owner cannot be established. This change does not rewrite or delete pre-existing legacy contents during form recovery; existing explicit logout cleanup remains intact. Thus legacy public drafts do not automatically migrate. This is a privacy/backward-recovery limitation, not an assertion that old browser data never existed. There are no new permanent localStorage writes and no form fields or contact details added to URL.

Ordinary contact-language activation uses client navigation to retain the in-memory fallback when session storage is unavailable. A visible bilingual warning explains that refresh/close can lose that fallback. Modifier/new-tab navigation retains ordinary link semantics and is not promised memory-only recovery. Tracking language navigation from #116 keeps its existing card-only and token-stage guard; other routes retain their existing behavior.

Account forms still suppress browser draft storage and use their existing account-scoped server API. Their external 400ms callback is canceled on success, reset and unmount; the parent account-save queue/cleanup remains intact. Successful public submission clears only its matching snapshot so an older acknowledgement cannot erase a newer edit; explicit reset clears the current draft. No deferred save can recreate cleared input. Anonymous people sharing one unclosed tab still share its anonymous draft until reset/identity change; this is tab/identity isolation, not a browser security boundary against same-origin script access.

## Verification

Ignored evidence lives in `.migration/issue110/`. The final product build has also been exercised after adding the explicit logout cleanup.

| Check | Result |
| --- | --- |
| Before-fix component and CMS regressions | Four form failures plus one CMS failure; confirmed desktop browser reproduction in both directions |
| Full unit/integration suite | 64 files / 1021 tests passed (`test-final.log`) |
| Focused form/storage/locale unit checks | Passed, including malformed/expired/oversized snapshots, allowed fields, account separation, blocked storage, failed submission, delayed success, reset and logout |
| Lint / typecheck / CI policy / build | Passed; independent ESLint, 13 CI policy cases, production client/SSR build |
| Runtime independence / diff check | Passed |
| Broad browser suite | 42 passed (`e2e-final.log`): new contact matrix, existing submissions, account portal/server drafts and #116 tracking-language matrix |
| Latest-build focused browser suite | 18 passed (`e2e-complete.log`): complete new contact matrix and existing ar/en login/logout checks at 375/1280 |
| Standard full browser local attempt | Blocked before journey: pinned headless shell v1234 absent; stopped at first environmental failure |
| Local infrastructure check | Blocked before configuration validation because nginx is absent |

The contact matrix covers an immediate last edit and language click in the same browser task, repeated AR/EN changes, native keyboard activation, back and reload, all service/type/budget/currency/timeline/contact/reference fields, no automatic submission, current draft above CMS defaults, valid field IDs across translations, storage failure with memory fallback and reload warning, server failure retaining input, real successful submission, reset without resurrection, and two authenticated accounts. The account-isolation scenario preserves a server-draft sentinel while contact drafts change accounts. Existing account-portal coverage confirms the server draft queue and deletion behavior. The old submissions test now checks the temporary session envelope, preserving the original persistence and successful-clear assertions.

Axe scans pass for both normal and blocked-storage contact states in both locales and viewports. Existing account, submission and tracking tests also passed, including private-note/capability boundaries. Production rate limiters stay enabled; the new acceptance fixture snapshots/restores only synthetic loopback quota state so successful-form cases do not consume one another's quota assertions.

New submission tests disable trace/screenshots because successful responses may contain synthetic tracking capabilities. No actual capability, credential or user data is included in this document or the PR. The browser runs used system Chromium 154.0.8037.57 via an ignored configuration; that success is separate from pinned-browser/full-suite CI. Remote CI is recorded against the final PR head in its description. The two earlier design-system QueryFailedError observations remain outside this issue and are not claimed fixed.

## Limits and rollback

Refresh recovery depends on sessionStorage availability and an unexpired same-owner snapshot; when storage is blocked only the current tab's live navigation fallback is guaranteed. Multiple tabs are not synchronized. Existing unscoped legacy drafts are not adopted, and no server draft is migrated or deleted by this feature. Reverting this issue restores the older browser-draft behavior and removes the additive viewer ID projection; no database migration or data repair is needed. Keep the PR Draft for independent review; no merge or deployment is authorized here.
