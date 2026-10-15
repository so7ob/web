# Explicit workflow deadline timezones (#100)

## Scope and source

Base develop: `2e2382f72d850e4fb4c3c00d7a049d4b7fd23f34` (PR146 merged). The preserved local work is commit `8b16ae8d3b065bc9d210614e04f4156b2cd726d2`; develop was merged into its independent `fix/100-workflow-deadline-timezones` branch without rewriting that commit. #147 and the separate browser preview are excluded.

The original display defect was reproduced against `3e5dd07754410f16026a6c17cb806a280b2b7e61`, whose application source is unchanged by PR146. For the same stored response/stage instants `2026-10-15T07:00:00.000Z` / `09:00:00.000Z`, the English details showed 10:00/12:00 in an Asia/Aden browser and 03:00/05:00 in an America/New_York browser, with no timezone label. The two-case baseline probe passed by asserting that defective behavior; it is not a passing acceptance result.

## Resulting policy

- Details and conversation lists display deadlines in the work calendar pinned to the record's published workflow version. Transfer preview uses the destination version's calendar.
- Each semantic `time` retains the original ISO instant in `datetime`, a localized Gregorian date and 24-hour time, and a visible IANA timezone plus the offset at that instant (for example `Asia/Aden · UTC+03:00`). The zone uses left-to-right isolation in Arabic and can wrap on narrow screens.
- Missing or invalid timezone metadata has an explicit UTC fallback. Missing deadlines stay absent. Calendar metadata is optional for compatibility with older responses.
- Only the timezone string is projected from the pinned calendar. List projection uses a join rather than one calendar query per row. Existing record-view authorization remains in force; a staff reader does not need workflow administration permission to interpret an already authorized deadline.
- No schema migration, deadline arithmetic, timer/job schedule, workflow publication, transition, ownership or authorization policy changes. Reading details, lists and transfer preview must leave the stored workflow state and published definition unchanged.

## Regression coverage

The new component/management regressions cover requests and inquiries in Arabic/English, response and stage instants, DST spring-forward and repeated fall-back hours with different offsets, invalid/missing zones, absent deadlines and machine-readable instants. Before the fix, 20/24 failed; the four absent-deadline cases already passed.

Server regressions cover both scopes across two published versions with different pinned calendars and an edited draft. Detail/list metadata stays attached to the record's immutable publication; transfer preview names the destination calendar without applying the transfer. Unauthorized public detail/list calls remain forbidden, and the test reader lacks `workflows.view`.

The new browser matrix has 24 cases: two browser zones, two languages and two viewports (375/1280), request/inquiry details and lists, plus transfer preview. The synthetic calendar runs Sunday–Thursday 08:00–16:00 in Asia/Aden with two/four-hour deadlines. One record starts Thursday 08:00; another starts Thursday 15:00 and crosses the Friday/Saturday weekend to Sunday 09:00/11:00. Fixtures assert the exact persisted UTC deadlines before UI testing. Tests exercise keyboard navigation, WCAG 2/2.1/2.2 AA axe tags, no horizontal overflow, limited-reader access, API metadata, unchanged stored workflow rows and immutable published definitions. Setup/cleanup uses fixture-owned synthetic rows and a separate fixture timeout, independent of the test body.

The new spec is mandatory workflow smoke. Coverage-gate regressions reject a catalog/report missing it; no prior assertions, rules, retries or timeouts were relaxed.

## Verification and limits

- After restoring develop: build, lint, TypeScript, CI policy, independence and infrastructure checks passed; focused management/calendar/workflow units and integration: **46/46**.
- The first browser probe revealed an error in the new test's response-envelope access; corrected to the actual request/inquiry envelope and assert HTTP200. Visible deadline assertions select the active responsive rendering. The corrected English desktop probe passed (17.003s test body).
- An initial concurrent browser/full-unit run was stopped after the browser reported one pass and one timeout in its second axe scan (22 unrun); the unit run also reported existing identity integration deadlines. Those runs are not green or complete. Their logs/trace are retained locally. Subsequent verification is run sequentially without increasing deadlines.
- The sequential 24-case browser attempt stopped at the existing 30000ms webServer readiness gate, before any case ran. No timeout was increased. A separate read-only probe took23.054s to import the server package and open an isolated database connection; it does not identify which startup stage consumed the time. No active database sessions remained. CI and the separately running serial full-unit check must supply the remaining evidence; they are not claimed passed while pending.
- Local Node24.21.0/npm10.8.2 and isolated MariaDB10.11.18; local Chromium154.0.8037.57 because the pinned151 download is blocked. CI must supply pinned-browser evidence. Full serial local E2E is not claimed.
- Synthetic loopback data only. No external mail/webhook delivery, real data, production credentials, deployment or merge.

Local evidence hashes (ignored `.migration/cloud/`): baseline report `c8197190aa5779fa6da0b24e4066bb4000845d93d415d29e1f0dc02173778bcb`; before-fix unit log `58ea16ad88e619d474ab80f0b116aaaaa7fbde97d8060d668551925914538792`; restored focused unit log `d6f634541652ba4cc0fc2333fa0caa7421d1b6197bb4b9d15b912c81412d0925` (SHA256).

Rollback: revert this isolated display/metadata change. No stored deadlines or calendar versions need conversion.
