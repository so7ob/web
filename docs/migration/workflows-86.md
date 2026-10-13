# Conversation interfaces and versioned workflows — issue #86

Implementation branch: `feat/86-conversation-workflows`, based on `develop` at
`3484ca7b7d83c699c43ab00406ba56a963b339dc` (PR #85). No stacked dependencies.
The implementation uses only this repository; historical attribution remains in
[source-provenance.md](source-provenance.md). Issue: <https://github.com/so7ob/web/issues/86>.

## Product changes

Requests and inquiries share the list, filters, saved filters, saved replies,
selection, quick assignment, pagination and CSV interaction. Existing request
filter storage is retained. Desktop tables have fixed column allocation and wrap
long content; at 375px the same records/actions use cards. Details retain the
conversation/main area and management/sidebar order. Assignment, priority and
allowed transitions save immediately; required transition reasons use a dialog.
The reply composer keeps separate public/internal drafts and retains failed
uploads and text. Inquiry attachments and saved replies use inquiry permissions.
Public replies show their configured workflow effect. Both original workflows
use the site's response policy for their displayed deadlines.

`/{locale}/admin/workflows` supplies drafts, copying, validation, simulation and
publication, teams, calendars and transfer previews. Its SVG graph supports
pointer/keyboard dragging, zoom and selecting a source/destination to connect
stages. Every graph operation also has labeled form controls. Arabic and English
stage/action names are stored together. Public account/tracking screens retain
their layout and receive only a stage's two names and operational status.

## Engine and persistence

`1792108800000-workflows.ts` creates WorkTeam, WorkTeamMember, WorkCalendar,
Workflow, WorkflowVersion, WorkflowBinding, ConversationWorkflow, WorkflowEvent,
WorkflowJob and WorkflowTransfer. Existing records are attached to separate
original request/inquiry versions without changing their rows, assignees,
messages or existing history. Table/FK collation matches the existing schema
(`utf8mb4_nopad_bin`). The migration does not reset or seed user data.

Workflow drafts have optimistic revisions. Publishing inserts a new immutable
version and updates a unique `(scope, selector)` binding. A service/category
binding takes precedence over `*`. Existing records remain pinned. Published
workflow/calendar definitions have no update endpoint. Each conversation stores
its version, stage, team, visibility, revision and stage epoch. Revision conflicts
return 409; stage epochs fence delayed jobs without discarding a reply event just
because an assignee changed.

Manual transition, routing, history, status event, audit, notification and timer
changes share one database transaction. An operation ID deduplicates transitions.
Team-row locking serializes round robin. Taking a queue item requires that type's
assignment permission, eligible active staff and the expected revision. Routing
failures roll back manual transitions. Automatic failures preserve the triggering
reply/current stage, record a failure and notify supervisors. Initial automatic
routing failures retain the new record with supervisor-only visibility.

The existing worker handles durable reply/timer jobs. It locks the parent before
the job, checks version/stage/epoch, executes the first matching ordered rule
once, and commits the event and resulting changes together. A killed process
leaves an uncommitted job available for restart. Completed/failed jobs are not
blindly retried. Existing mail/webhook uncertain-outcome handling is unchanged.
Leaving a stage cancels its pending timers; close/archive stops deadlines.

Conditions are structured, allowlisted field comparisons: equality/inequality,
comma-separated membership, emptiness, and all/any groups. No executable code or
SQL is accepted. Publication validates unique stage/action IDs, start and target
stages, reachability, terminal paths, scope statuses, routing and calendar
references. Automatic transitions cannot demand a user-entered reason.

## Calendar and rollout controls

The central calendar starts with `Asia/Aden` selected and **no assumed hours**.
Configure weekly intervals, holidays/date overrides and timezone before
publishing a custom workflow. Response hours inherit the site's numeric policy
or use the stage override; stage residence hours are separate. Custom deadlines
consume only business time, including split shifts and timezone/DST boundaries.
Each published workflow stores a calendar version, so later calendar edits do
not recompute running deadlines. Calculation has a ten-year horizon and rejects
an impossible deadline rather than spinning indefinitely.

Publishing affects new conversations only. Moving current conversations requires
selecting records, mapping old stages, reviewing status/assignee/team/visibility
and deadline changes, then confirming a short-lived server preview. Confirmation
checks the record snapshot and routing again; changes require another preview.
Search/pagination supports selecting older records, in batches of at most 50.

New permissions: `workflows.view`, `workflows.manage`, `workflows.publish`,
`workflows.transfer`, `workflows.supervise`, and `teams.manage`. Only the system
administrator receives these implicitly; other roles need an explicit grant.
Teams are independent of roles. Restricted stages remain scoped in administrative
lists/details/mutations, search, export, statistics, user views, attachment access,
staff tracking links, notifications and conversation audit views. Existing
customer ownership and public tracking capabilities remain independent.

Both `/api/admin/workflows` and `/api/v1/admin/workflows` expose overview/options,
teams/calendars/drafts, validate/simulate/publish, transfer records/preview/confirm,
and scope/record state/assignment/transition. Writes use a `{ payload: ... }`
envelope with server validation and existing authentication/CSRF protection.
Legacy status routes pass through the engine and reject ambiguous custom-stage
destinations rather than choosing one arbitrarily. Errors use the existing
sanitized code/reference envelope; the UI retains uncertain drafts until review.

## Verification and evidence

All local data was synthetic in isolated `so7ob_workflows_86_*_test` MariaDB
10.11.18 databases, with Node 24.21.0/npm 10.8.2. Browser fixtures were separate
from worker/outbox fixtures. Ignored `.migration/workflows/` contains local logs
and synthetic screenshots; no environment files, database dumps or attachments
are committed.

- Unit/integration: calendar boundaries, split shifts, holidays, DST, invalid
  calendar/graph/conditions; restricted visibility and public projection;
  concurrent transition/assignment, reasons, round robin; duplicate reply/timer
  events; empty/inactive routing; inquiry-only staff; pinned versions, transfer
  conflicts, archive/restore/reopen and old timers; original response policy.
- Migration/process: `node --import tsx tools/migration/workflow-smoke.ts` on an
  empty isolated database upgrades legacy rows (including bcrypt), kills the
  actual worker mid-transaction, checks rollback, restarts it and verifies one
  transition. Completed successfully locally. CI runs this on its own database.
- Existing compiled-worker mail, heartbeat, file cleanup, webhook and HTTP auth
  smokes passed. Uncertain mail/webhook delivery was not resent.
- Browser coverage exercises Arabic/English, RTL/LTR, 375/1280, keyboard graph
  controls and forms, axe, long text, saved replies, assignment, reason-required
  transitions, independent drafts, failed uploads and a public reply processed
  by the real engine. CI uploads the synthetic conversation/editor screenshots.

Local unit/integration result: 926 passing tests across 52 files. Lint, TypeScript,
build, independence and infrastructure checks passed during implementation. The
full local browser run passed 252 cases; final refinements also receive focused
browser checks. Exact PR-head CI results are recorded in the PR.
No pending command or CI job is counted as passing.

During development, real MariaDB revealed an initial FK collation mismatch;
this was corrected before successful fresh migrations. Browser checks exposed
native-select accessible-name duplication and mobile detail/table overflow;
these were fixed and rechecked. A worker-smoke assertion compared a MariaDB count
string to a number; the assertion now normalizes the count. These failed runs
remain in ignored local logs and are not reported as passing evidence. The first
PR CI run (38430543999) also caught the v1 upgrade smoke's explicit migration list
missing the new migration. Its expected ordered list was extended, and the v1
and identity upgrade rehearsals passed on new isolated databases. Final review
also corrected an early revision increment on compatibility-route assignment and
added scope-view checks to transfer previews/confirmation and assignment; tests
cover both assignment routes and permission revocation after preview.

## Recovery and boundaries

No merge, release, deployment, production migration or live calendar setup was
performed. Review and passing CI do not authorize these operations. Before an
approved rollout, back up the target database and rehearse the explicit migration
against an isolated copy under the repository's operational procedure. Configure
teams/calendar and publish only after administrative review.

The migration intentionally has no destructive `down`: workflow history and
pinned instances must be preserved. Before any custom publication/use, reverting
the application can retain the additive tables and original behavior. After
custom workflows have accepted writes, use a forward fix or a reviewed transfer;
do not run an older application that bypasses workflow visibility/routing. A full
snapshot restore is only appropriate while writes remain paused and with separate
authorization; never restore stale data over subsequent writes.

Kanban, multistep approvals, custom fields and external integrations remain the
explicitly deferred scope. Stage graph layout is saved with the draft; it is not
a general-purpose diagramming tool. No production scale benchmark or external
mail-provider delivery is claimed by the synthetic checks.
