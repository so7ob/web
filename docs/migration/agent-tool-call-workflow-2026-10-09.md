# Illustrative agent tool-call workflow

The user confirmed that the requested subject is the included Archify example, **not an agent runtime implemented in So7ob**.

[Open the six-lane workflow](../../.archify/workflow-agent-tool-loop-20261009-231121/agent-tool-loop.html) · [Specification](../../.archify/workflow-agent-tool-loop-20261009-231121/candidate.json) · [Delivery receipt](../../.archify/workflow-agent-tool-loop-20261009-231121/agent-tool-loop.finalize-summary.json)

## Evidence and scope

Inspected `/root/So7ob/web`, branch `develop`, commit `e84fe1b3c3f6b2fd9bf2c79c0a08e53458e5dae3`, origin `https://github.com/so7ob/web.git`. No fetch was performed. Searches of application sources in `apps`, `packages`, and `tools` for tool-call dispatch, agent runtime, approval gates, and agent SDK references did not identify an implemented agent tool-call loop. This is a bounded inspection, not proof about every historical or external source.

The positive source is [Archify's local example](../../.agents/skills/archify/examples/agent-tool-call.workflow.json). Its nodes and `mainPath` are at lines 28–42; its directed edges are at lines 44–55. The skill directory is untracked, so this example is **not evidence at the So7ob commit**. An exact local snapshot and SHA-256 manifest are retained in [evidence.json](../../.archify/workflow-agent-tool-loop-20261009-231121/evidence.json). The source SHA-256 is `d67965d50872c97e4ff3476271e645bf19fab6b3ab44e111bdb44b063e3aa36f`.

`AGENTS.md:3–15` and `CONTRIBUTING.md:5–11` establish repository working policies, not an executable agent approval engine. `docs/migration/agent-skills.md` describes development skill packaging outside the application runtime. These distinctions are why the diagram is labeled illustrative and does not claim commit-verified implementation provenance.

## Reading the lanes

| Lane | Source-supported example behavior |
|---|---|
| User surface | User request enters a chat surface; a final reply contains the answer and changes. |
| Agent runtime | Planner chooses the next step; router chooses a capability. These are example roles, not identified code modules. |
| Policy boundary | An approval gate represents scope and consent; its permitted branch reaches the tool. |
| Tool execution | A tool call reaches an external API, whose result leads to the final reply. This is the example's specific path, not a claim that all tools require a network API. |
| Exception handling | Denial leads to Blocked, described as wait or reject, then to Retry / revise request. |
| Observability | External API → trace log and context store → trace log are explicit evidence paths. |

The primary path is green; policy checks and denial are pink; secondary revision and evidence branches are purple. Dashed lines distinguish these paths, **not a verified asynchronous execution guarantee**.

The diagram preserves all 12 nodes and all 11 directed relationships, while separating the example's combined lanes into the six requested responsibilities. [The topology comparison](../../.archify/workflow-agent-tool-loop-20261009-231121/topology-check.json) confirms that no directed edge was added or removed.

## Explicit gaps

- There is no outgoing edge from Retry / revise to planning, approval, or tool execution. This example does not define a closed retry loop.
- There is no tool-error branch, exception classifier, backoff, retry budget, timeout, cancellation path, or recovery handler.
- The approver, consent interaction, enforcement mechanism, and blocked-state persistence are unspecified.
- No trace/context edge returns to the planner or final reply. Trace storage, durability, memory updates, and audit delivery guarantees are unspecified.
- External API → final reply is retained as drawn; an intervening result-processing loop is not invented.

## Verification

Archify `finalize workflow --quality showcase` passed all four gates: validate, deliver, strict provenance check, and real-browser check. Artifact validation: **9/9, zero errors, zero warnings**. The receipt contains specification and HTML SHA-256 values. This validates the diagram artifact, not an agent implementation.

Light/dark screenshots were captured at 1440×900 and 2048×1320. Manual inspection covered light 1440 and dark 2048: the success path, separated lanes, denial detour, revision terminal, and evidence paths are visible without crossing unrelated nodes. The automatic advisory about the long denial detour remains; it is an intentional route around the primary path. [Capture evidence](../../.archify/workflow-agent-tool-loop-20261009-231121/visual-check/agent-tool-loop.visual-check.json).

Additional checks covered widths 375 and 1280, default English/LTR and DOM-emulated Arabic/RTL; the latter is not an authored Arabic translation. No horizontal overflow was observed in four cases. Tab reached viewer controls and diagram elements; this is limited keyboard coverage. Axe reported four viewer-template rule violations: `heading-order`, `landmark-one-main`, `nested-interactive`, and `region`. **Accessibility acceptance did not pass.** No rules were disabled. [Accessibility evidence](../../.archify/workflow-agent-tool-loop-20261009-231121/viewer-accessibility.json).

No application source or tests changed. The application checks from the preceding task at this same HEAD were not repeated: lint/typecheck/build/infra passed, while the full test and E2E commands could not complete without isolated MariaDB configuration. This workflow's checks are separate from those results. Existing untracked work was preserved; no commits, remote writes, or deployment occurred.
