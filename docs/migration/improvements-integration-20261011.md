# Improvement integration — 2026-10-11 (Asia/Aden)

Issue #56; additive handoff after the owner explicitly requested merging the improvement PRs and closing their completed issues. The earlier delivery report remains a historical pre-merge snapshot.

## Integration order and evidence

All PR bases remain `develop`. Merge commits preserve stacked ancestry. No force push, branch deletion, main promotion, release, deployment or production migration is part of this handoff.

| PR | Issue | Integration dependency | Status at this document revision |
| --- | --- | --- | --- |
| [42](https://github.com/so7ob/web/pull/42) | #41 | none | merged at `6283681732c179944ce8f40e8baca167076d830b` |
| [47](https://github.com/so7ob/web/pull/47) | #43 | #42 | merged at `d296d21b0ae10f7c250355bc61f1bf56176c1f28` |
| [49](https://github.com/so7ob/web/pull/49) | #45 | #47 | merged at `589d104e4664440f1a5408be58a1700a12fbff61` |
| [48](https://github.com/so7ob/web/pull/48) | #44 | #47 | updated; validation pending |
| [51](https://github.com/so7ob/web/pull/51) | #46 | #48, #49 | updated; validation pending |
| [53](https://github.com/so7ob/web/pull/53) | #50 | #51 | updated; validation pending |
| [55](https://github.com/so7ob/web/pull/55) | #52 | #53 | updated; validation pending |
| [58](https://github.com/so7ob/web/pull/58) | #54 | #55 | updated; validation pending |
| [57](https://github.com/so7ob/web/pull/57) | #56 | #58 | this documentation handoff; validation pending |

The added integration dependencies resolve overlapping additions without rewriting published history. Each PR retains its original focused change after predecessors merge. The linked PR timelines and Actions runs are the authoritative subsequent merge/check record; this table does not claim pending runs succeeded.

## Conflict resolutions

- Retained the export filter/5,105-row regressions, safe outbox metadata/authorization regressions, concurrent settings/menu regressions, response policy regressions and bounded inquiry summary regression exactly once each.
- Retained all worker-health, checked settings/menu and CSV controller routes and their authorization checks.
- Retained both additive migrations, registering `AdminRevisions1791676800000` before `WorkerHeartbeat1791676801000`. Do not reverse or drop either table during rollback.
- Kept Arabic/English portal fixes, reference baseline provenance, existing CSV redaction and uncertainty/no-resend behavior.

## Validation and closure requirements

Integration uses real isolated MariaDB at loopback port 3311, synthetic `so7ob_merge_*_test` databases, separate browser/unit data and private temporary directories outside the tested release. Updated heads require fresh CI; the final `develop` push also runs both existing jobs, including pinned historical-reference checks. Earlier branch evidence does not cover these integration commits.

Close each issue only after its PR is merged and combined validation passes. Closing #56 completes documentation, not independent-host recovery: that exercise remains unverified; RPO/RTO targets and branch protection still require owner approval/application. Legacy unchecked settings/menu API paths retain their documented compatibility limitation.

If integration regresses, fix forward on the corresponding issue branch/PR, or propose reverse-order PR reverts for review. Preserve revision/heartbeat data and do not automatically revert migrations or restore stale production data.
