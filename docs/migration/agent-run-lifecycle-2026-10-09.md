# Agent Run lifecycle — illustrative

[Open the lifecycle diagram](../../.archify/lifecycle-agent-run-20261009-231544/agent-run.html) · [Specification](../../.archify/lifecycle-agent-run-20261009-231544/candidate.json) · [Validation receipt](../../.archify/lifecycle-agent-run-20261009-231544/agent-run.finalize-summary.json)

## Scope and evidence

The lifecycle request did not name an object. A clarification was offered; while awaiting an answer, the diagram follows the preceding confirmed preference for the included Archify example family. Its subject is the **illustrative Agent Run**, not an implemented So7ob agent. The immediately preceding event-stream request was treated as superseded; no dataflow artifact was produced.

Inspected repository: `https://github.com/so7ob/web.git`, local `develop`, commit `e84fe1b3c3f6b2fd9bf2c79c0a08e53458e5dae3`. No fetch or remote write. Existing untracked skill, artifacts, and reports were preserved.

Source: `.agents/skills/archify/examples/agent-run.lifecycle.json`. The skill is untracked and is not part of that commit. [Source snapshot and hash manifest](../../.archify/lifecycle-agent-run-20261009-231544/evidence.json) distinguish it from committed implementation evidence. The source is schema v1; `.agents/skills/archify/renderers/lifecycle/README.md` documents its implied ordered main rail. The new schema-v2 diagram makes those four rail transitions explicit and preserves all six explicit source transitions.

Application code was also inspected to avoid substituting unrelated behavior: `packages/server/src/queue/mail-queue.ts:29–62` and `queue/worker.ts:16–49` implement MailJob retries, lease recovery, sent, failed, and uncertain outcomes, but no cancelled status. `packages/contracts/src/requests.ts:16–33` permits reopening closed and cancelled ProjectRequests. Neither is evidence for this illustrative agent lifecycle.

## State and transition interpretation

| Area | States and source-defined transitions |
|---|---|
| Main progress | Queued → Planning → Executing → Reviewing; then Completed. |
| Waiting/interruption | Executing → Needs Approval; Reviewing → Blocked for missing input. |
| Recoverable failure | Executing → Failed → Executing on retry. Failed is not a terminal state. |
| Terminal outcomes | Needs Approval → Cancelled when the user stops; Blocked → Expired on timeout; Reviewing → Completed. All three endings are visible with final-state borders. |

Every arrow is labeled. `advance*` and `complete*` explicitly denote progression whose triggering event is unspecified by the source; they are not invented event names or code contracts. Other labels are descriptive readings of the source's transition IDs, state labels, and sublabels.

There is no source transition for approval granted → resume, input supplied → resume, cancellation from every state, or a global timeout. The source card mentions a retry budget, but supplies no budget value, enforcement, or exhausted-budget ending. No terminal Failed state is invented. The recoverable failure and the three supported endings are shown separately rather than conflated.

[Topology verification](../../.archify/lifecycle-agent-run-20261009-231544/topology-check.json) confirms all 10 states and 10 explicit-plus-implied relationships are preserved, and that the only zero-outgoing states are Cancelled, Expired, and Completed.

## Artifact verification

- Archify lifecycle showcase: **9/9**, zero errors and warnings; validate, deliver, strict artifact provenance check, and real-browser check passed. The linked receipt records specification and HTML SHA-256 values. These are artifact checks, not agent implementation tests.
- Captures passed for light/dark at 1440×900 and 2048×1320. Manual visual inspection covered light 1440 and dark 2048; the progress, failure/retry branch, waiting states, and three endings are visible. [Capture receipt](../../.archify/lifecycle-agent-run-20261009-231544/visual-check/agent-run.visual-check.json).
- At widths 375 and 1280, default English/LTR and DOM-emulated Arabic/RTL had no horizontal overflow. RTL emulation is not an authored Arabic translation. Tab reached viewer controls and diagram elements; keyboard coverage is limited.
- Axe found four viewer-template violations: `heading-order`, `landmark-one-main`, `nested-interactive`, and `region`. Accessibility acceptance did **not** pass; no rules were weakened. [Detailed evidence](../../.archify/lifecycle-agent-run-20261009-231544/viewer-accessibility.json).
- Application code and tests are unchanged. The earlier application checks at the same HEAD were not repeated: lint/typecheck/build/infra had passed; full test/E2E completion required isolated MariaDB configuration. `git diff --check` was run for this task. No commit or deployment was made.
