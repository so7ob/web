# Tracking context across language changes — issue #116

## Provenance

The restored workspace was ready and clean. Develop was fetched explicitly from `https://github.com/so7ob/web.git` at `fc9f82035641682df6934051e6364f9527e30938` before creating `fix/116-track-language-context`; no open PR addressed #116. During implementation, #133 was independently merged, advancing develop to `b84f3ced7de47d2a922446394745983a2652fd82`. That develop head was fetched and merged into this issue branch without rewriting history. The adjacent CI catalog conflict was resolved by keeping both `media-alt-drafts` (CMS) and `tracking-language` (requests); the merged #133 implementation was preserved.

Tested implementation/test source: `7a12b6dde037c5f0bb1fb0d42e679cae7b729350`. The subsequent evidence commit changes only this Markdown file, so the tested source blobs remain the same at the PR head. Node 24.21.0, npm 10.8.2, isolated Docker MariaDB 10.11.18 on loopback 33116. Unit/integration database: `so7ob_issue116_unit_test`; browser database: `so7ob_issue116_browser_test`. No production, external mail/webhook sending, paid API, account permission change or persistent secret was used.

## Reproduction and change

The original LanguageSwitcher used pathname alone. After exchange, TrackClient has replaced the capability-bearing URL with a non-secret `card=scope:id` query while server authority remains in an HttpOnly cookie. On the original source, six component cases failed (ten existing-behavior cases passed): four stable request/inquiry × ar/en links omitted card, and two token-stage cases still exposed a navigable language link. Browser reproduction on desktop failed all eight cases: four valid synthetic cards offered a language destination without their card context, and four delayed-exchange scenarios lacked the navigation guard. No live capability value is reproduced here.

The switcher now accepts one card parameter only on the canonical tracking path, validates request/inquiry scope and the server's nonempty/64-character identifier bound, and builds the other locale URL from that card alone. Ambiguous/malformed context is dropped. Extra query keys and fragments are not copied. Other routes retain pathname-only language navigation.

Raw-token URLs are a distinct state: language navigation has no href, is marked aria-disabled and is removed from Tab order until exchange replaces the URL with canonical card context. Its click handler also prevents navigation and locale-cookie changes. The raw token is never copied into a language link, URL fragment or temporary client store. TrackClient, its existing intentional copy/share action, cookie exchange, APIs and authorization remain unchanged.

This guard is intentionally based on the raw-token URL, not a claim to know the exchange's internal phase. If exchange fails and no trusted card context is established, the language control remains unavailable on that raw-token page. Missing/malformed card pages without a raw token retain ordinary pathname-only switching. Stable canonical expired/revoked cards preserve identity when switching but remain denied by the server.

## Checks and evidence

Ignored logs are under `.migration/issue116/`.

| Check | Result |
| --- | --- |
| Component regression before edit | 6 failed / 10 passed (before-unit.log) |
| Component regression after edit | 16 passed (after-unit.log); also included in full suite |
| Desktop browser reproduction on original component | 8 failed, stable and delayed exchange (before-e2e.log) |
| Initial full unit/integration suite on the original develop base | 984 passed |
| Full suite after integrating updated develop | 61 files / 1002 tests passed (test-final.log) |
| Lint / typecheck / build | Passed on integrated source; ESLint remains independent |
| CI policy | All 13 cases passed; new spec classified under requests and unknown-file fallback retained |
| Independence / diff check | Passed |
| Focused browser suite on final source | 26 passed: tracking-language plus existing tracking acceptance (e2e-final.log) |
| Standard pinned-browser full-suite local attempt | Blocked before journey: pinned headless shell v1234 absent; stopped at first environmental failure |
| Local infrastructure check | Blocked before configuration validation: nginx absent |

The new browser matrix is request/inquiry × starting ar/en × 375/1280, separately testing stable context and a held exchange. It covers both language directions, reload, history back, repeated navigation, keyboard activation, messages/reference continuity, unchanged stored ownership/locale/status and token generation, one stored record/link/reply, and exactly one successful capability exchange. Negative checks include a fresh context without a capability, expired/revoked links across languages, invalid exchange input, malformed/missing context, rejected post-revocation replies, and private-note exclusion. All fixtures and replies are synthetic and scoped to the test's record. Quota state is preserved/restored, not disabled.

The first focused run after the language fix had 24 passes and two failures in the existing English guest tracking axe scan. The violation targeted the success toast's transitioning foreground color, not the language control. The test now waits for that visible notice's opacity and finite subtree animations and hovers it to preserve it during the complete axe scan, consistent with other acceptance tests. No axe tags, content, thresholds or assertions were removed. The final 26/26 run includes both existing guest axe scans and staff tracking-panel axe scans, in both viewports/locales.

Capability tests disable trace/screenshots for the new token-bearing scenarios, including expected pre-fix failures. Assertions expose only canonical paths, non-secret card context, booleans or status codes; initial navigation failures use a sanitized error. A text-artifact scan found no raw capability URL values in task logs or test-results Markdown. Existing acceptance screenshots are taken after canonical replacement; no capability value is included in this evidence or the PR. Local validation used system Chromium 154.0.8037.57 via an ignored config; pinned-browser/full-suite and infrastructure success must come from CI at the final head. Remote results are recorded in the PR description.

## Limits and rollback

This change does not grant access from a card identifier: the existing cookie/account policy still decides access for every read/reply. It does not preserve arbitrary query strings on other routes, localize failed raw-token context across locales, rotate links, recreate records or coordinate multiple browser tabs. The two previously noted design-system QueryFailedError observations are outside this issue and are not claimed fixed.

Rollback the issue's language-switch implementation and related test changes without reverting the merged develop/#133 work. No migration or data repair is required. Leave the PR Draft for independent review; do not merge or deploy automatically.
