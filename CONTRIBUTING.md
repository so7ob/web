# Contributing

This destination owns the entire migration. Website supplies a pinned reference snapshot; Rakim supplies architectural ideas only.

1. Inspect local changes, remote branches, existing issues/PRs and protection rules.
2. Create or reuse an issue in `so7ob/web` with scope, risks, acceptance criteria, tests and rollback.
3. Work on an issue branch rooted in develop: `refactor/<issue>-topic`, `database/<issue>-topic`, `test/<issue>-topic`, etc. Dependent branches may be stacked; document their predecessor and incremental comparison. PR base remains develop.
4. Preserve attribution and provenance. Exclude Git metadata, dependencies, build outputs, secrets and real data from imports.
5. Run applicable checks and preserve evidence. Transitional stages must state which old runtime dependencies remain and cannot claim migration completion.
6. Use Conventional Commits. Before every push/issue/PR write, verify repository identity and both origin URLs. Push one named branch explicitly to `https://github.com/so7ob/web.git`.
7. Open PRs to develop with dependencies, test results, limitations, security/data effects and rollback. Leave them for review. No automatic merge, release, deployment or production cutover.

## Empty repository bootstrap exception

The destination was verified to have no commits, remote branches, issues or PRs on 2026-10-02 (Asia/Aden). One administrative initial commit establishes main; develop starts at that same commit. No application development is included in this bootstrap. All subsequent work uses issue branches and PRs.

## Acceptance

Functional parity takes priority over literal Rakim conventions. One-time login is accepted at a separately authorized cutover. Full rollback is supported only while writes remain paused; after reopening writes, recover forward without restoring stale SQLite data.

Final checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:infra`, and `git diff --check`. Review and passing CI do not authorize merging or deployment.
