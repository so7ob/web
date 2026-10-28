# Integrated acceptance of AdminLTE, identity and stylesheet diagnostics

## Source and scope

On 2026-10-28, read-only remote inspection returned develop
`e8d0f6cf7367d8732abaa179a1c118010cd86f5e`, PR178
`e6dae581855ee65132eb8c5ed9b24c3e7e5fb9b1`, and PR181
`ddd102d20c61541d78733713c802565e5ac82fb4`. The saved workspace was older
(`f3935f3`); it was clean. Local branch `fix/147-adminlte-acceptance` combines
both open candidates without modifying their branches. Its integration parent
is `4296215bfc0196e5a89526f4b456a3bee2babb16`. Review the incremental changes
with `git diff 4296215..HEAD`; the develop comparison includes both predecessor
PRs. Neither predecessor's earlier CI nor documentation is fresh evidence for
this combined candidate.

## Concrete corrections

- **#159:** Arabic permission fieldsets for workflows and teams had no legend
  text. A shared label resolver includes every current group and falls back to
  an unknown group's key. Catalog tests enforce complete Arabic labels; the
  existing bilingual identity journey additionally checks both accessible group
  names. Permission keys, delegation rules and role data are unchanged.
- **#180 migration safety:** after an empty installation, manually invoking the
  appearance migration again could reset newly saved customization because no
  archive existed. Record completion in `AdminRevision` even for empty installs.
  Keep migration metadata out of `SiteSetting`, so initialization and exact
  source-data transfer still see an empty site. Only allowlisted appearance
  keys are archived/reset; extension keys, other settings and later choices are
  preserved. Existing archives still prevent reapplication. Transactions keep
  the archive, baseline, revisions and completion marker atomic. This edits an
  unmerged migration; already-applied migrations are not automatically rerun.
- **#147 diagnostic privacy:** raw Chromium NetLog may contain paths, query data
  and request metadata even in default capture mode. Capture is opt-in locally
  (`SO7OB_E2E_NETLOG=1`, owner-only directory); CI captures bounded synthetic
  logs but exports only allowlisted event/error counters. Raw files are ignored
  and excluded from all three artifact paths. Unknown event/error labels become
  numeric IDs. Incomplete logs produce a fixed status, never a parser excerpt.
  Regression cases include malicious constants, truncated private content and
  the actual workflow artifact configuration. Counts alone do not prove a
  transport cause; raw logs remain local for a separately reviewed investigation.

## Page and component coverage matrix

The existing frozen design catalog retains all 105 views and 31 CMS block types.
The following are the acceptance sources to run on the new head, **not results
inferred from old screenshots or reused CI244 evidence**. Runtime outputs live
under ignored `.migration/acceptance/`; publish only curated reports/screenshots.

| Area | Pages/components | Functional and interrupted/repeated flows | Visual coverage |
|---|---|---|---|
| Identity | users/detail, roles, permissions, invitations | identity-management: held hydration and role load, creation, duplicate draft, forced password change, revoked live session; identity-drafts conflicts | AR/EN, 375/1280, keyboard, axe, permission legends and IAM PNGs |
| Audit | events/detail, cases, rules, alerts, reports, health | audit-operations/audit-rules: refresh failures, retained filters, denied evidence, report/download and focus return | design-system tour and audit screenshots, both directions/widths |
| Workflows | lists, graph, team/calendar editors, transitions | workflow-drafts, workflows, workflow-transition-labels, workflow-deadline-zones: failed saves, deadlines, stale versions, transfer permissions | tour, workflow PNGs, real stylesheet readiness before layout |
| Media/CMS | media library, picker, pages/editor, device preview, menus | media-alt-drafts, cms-ui, menus-editor, tree-editor: interrupted saves, repeated blurs, sibling drafts, upload errors, preview focus | tour, 31 block types, RTL/LTR, 375/1280 |
| Appearance | independent visitor/admin tabs, generator, actual React preview | settings-appearance/adminlte-design: all 29 presets, no-mutation preview, save/reload, conflict, theme priority, iframe dialogs/tooltips | eight language/mode/width cells, 991/992 boundary |
| Shared/public/account | controls, header/footer, auth, portal, tracking, error states | account-portal, auth-ui, tracking and stylesheet-readiness: delayed CSS, abort/HTTP/empty failure, successful XHR and later navigation cannot erase failure | complete design tour, axe/keyboard and real applied CSS |

Earlier `user-administration.md` records a historical server-only stage; the
current identity UI and permission contract are documented in
[identity-management-84.md](identity-management-84.md). The explicitly deferred
Kanban, multistep approvals, custom workflow fields and external integrations in
[workflows-86.md](workflows-86.md) are roadmap scope, not silently claimed complete.

## Verification and boundaries

Use Node 24.21.0/npm 10.8.2 and fresh isolated MariaDB 10.11.18 databases, with
256 MiB packet size, separate unit/browser/operational fixtures and no developer
`.env`. Required checks remain lint, typecheck, unit/integration, production build,
independence, full E2E, infra and diff checks. Logs and the final tested SHA are
recorded in the task's local acceptance report; a draft PR must list actual
pass/fail/not-run results, not check these off in advance.

The environment initially has Node 24.19/npm11; exact project versions were
installed under `/tmp`. The pinned Chromium151 download is denied with HTTP403
`Domain forbidden`. Local exploration uses installed Chromium154 via an ignored
config; it is not a claim of pinned-browser parity. A connected GitHub tool can
read issues even though the environment's `gh` GraphQL request is forbidden.

The first exploratory migration correction used an empty `SiteSetting` archive;
the unchanged source-transfer tests correctly rejected it (10 failures). The
completion marker was moved to `AdminRevision`. Repeating against the same old
synthetic database retained that exploratory row and still failed; a fresh isolated
database then passed all 30 schema/transfer tests, without changing the transfer
assertions or deleting live data.

**#147 remains open:** the original trace and issue establish an unstyled page
following `ERR_TOO_MANY_RETRIES`; they do not distinguish Chromium's restart
counter from connection-error retries. No causal transport fix, TLS trust change,
automatic reload, increased timeout, skip or blind CI rerun is introduced.

Rollback is a reviewed revert of these incremental changes. Retain migration
archives and completion metadata; do not restore a whole database or rewrite
business data to undo appearance. No production migration, main write, deployment,
branch deletion or automatic merge/issue closure is part of this acceptance work.

## Repeated iframe dialog readiness

The first combined-head local browser run on `70b7bd8` was stopped after 42
passes, two 90-second geometry timeouts and one interrupted case (539 unrun).
The trace stops after the close button is moving and Playwright logs its 20ms
retry wait. A script-free minimal sandboxed iframe with only a 300ms CSS button
animation reproduces that wait on Chromium154. Polling the real Web Animations
state from the runner completes the same ordinary click; enabling scripts also
changes the outcome but is deliberately **not** applied to the product.

The repeated-dialog test now asserts visibility and completed/nonpending dialog
animations before the original close-button click. All keyboard, pointer,
Escape, focus-return, tooltip, geometry and no-mutation assertions remain.
No forced click, animation disablement, sandbox expansion, sleep, retry of the
journey or timeout increase is used. This is a separate actionability-readiness
correction, not evidence about #147's stylesheet retry cause.

The initial new CI run 40759087586 passed build/lint/type/unit acceptance, then
one design job failed before tests while installing browser dependencies:
`packages.microsoft.com/ubuntu/24.04/prod` returned HTTP403 during apt update.
That environment failure is retained; no repository trust or network setting is
changed to bypass it, and no blind rerun is requested.

## Visual and hydration follow-up

Visual inspection of the Arabic dark mobile appearance screenshot found a false
fatal banner even though geometry assertions passed. Instrumented native events
in an isolated build identified `ResizeObserver loop completed with undelivered
notifications.` without an Error object. Such delivery warnings defer layout;
ClientErrors now leaves only the two exact native ResizeObserver warnings
uncancelled for browser diagnostics. Real exceptions, including the same message
with an Error object, still report. Three regression tests cover both warnings,
the next real failure and unknown native errors. Appearance screenshots now also
require no parent-document error alert.

CI run 40760702997 on 013bf26 passed all eight design cells, build/unit and
operations, but exposed three readiness gaps. Contact reload's empty SSR field
was not a hydration signal; inquiry list loading was independent of its dialog
trigger's enabled opacity transition; workflow back/forward required an SPA
history entry, which clicking an SSR link cannot guarantee. Tests now assert
interactive form state and full trigger opacity while preserving the loading
response gate, and establish hydrated navigation plus unchanged document time
origin before exercising the original back/save/forward/discard assertions.
No axe rules, color requirements, transport failures or dirty-draft assertions
are removed. These are test preconditions, not a claimed #147 transport fix.

The local 013bf26 full run was intentionally interrupted for this verified
product correction after 183 passes, no failures, one interrupted case and
400 unrun cases. It is not recorded as a full-suite pass. Final-head evidence
must supersede it without erasing its outcome.
