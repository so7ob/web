# Contribution gates — #41

Classification: confirmed workflow defects. The clean starting checkout was main
`2a26ee0c19bec249ea394d5584028ddff599b6dc`; develop was
`85ab40b8c7558f0590c684c4eb1031fbae678a66`, with identical trees. Live GitHub
inspection found no open issues/PRs before #41, both branches unprotected and
an empty ruleset list. Existing worktrees and branches were preserved.

The PR template now follows npm product gates and requests issue/dependency,
permissions/data, evidence SHA, limitations and rollback information. CI runs on
PRs targeting **develop or main** and pushes to **develop or main**, validating
actual integration commits as well as PR merge candidates. Feature branch pushes
alone do not trigger duplicate runs. Existing jobs, names, steps and the pinned
historical checkout are unchanged. No deployment job was added. Permissions
remain `contents: read`. Additional integration runs cost CI time.

## Owner action pending: branch protection

Apply protection to both `develop` and `main` after observing required checks on
an actual PR. Require PRs, at least one independent approving review, dismissal
of stale approvals, resolution of review conversations, and up-to-date passing
checks. Include administrators; disallow force pushes, deletion and direct pushes
except a separately audited emergency process. Main promotion should come from
reviewed develop integration. No auto-merge or release is enabled.

Require these exact existing job names with the GitHub Actions check source:

- `Imported reference checks (transitional runtime)`
- `Target lint, TypeScript, MariaDB tests and SSR build`

The former always checks historical commit
`a2dc18cff582159ef14b66250d600aa8307918cf` using its historical Bun runtime. It is
an archive regression check, not verification of current product code. The latter
checks the event commit with Node 24/npm, MariaDB, SSR, browser, independence,
worker, auth, file, webhook, CMS and recovery gates. Keep both checks;
never substitute the reference result for product acceptance.

**Protection remains pending owner approval/application.** Editing YAML does not
apply GitHub protection. No repository settings were changed.

## Verification and rollback

Compare `.github/workflows/ci.yml` against develop: only branch/event coverage
changes; all prior steps remain. Actual local and remote runs are recorded with
SHA in the PR, separately; this document makes no advance claim of success.
No runtime, schema, dependency or data change. Revert this package through a
reviewed PR; no predecessor dependency.
