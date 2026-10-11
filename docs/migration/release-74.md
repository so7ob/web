# v1.2.0 preparation and authorized promotion — Issue #74

The owner explicitly requested `develop` → `main`, a new release, and an illustrated README. [Issue #74](https://github.com/so7ob/web/issues/74) tracks completion. This authorizes the release workflow, not application deployment, production migrations, protection changes or external services.

## Baseline and scope

- Starting `develop`: `230c69f5060a53681b573c94c5a47f4d6bc8c2ee` (PR #73 merged).
- Starting `main` / v1.1.0: `2a26ee0c19bec249ea394d5584028ddff599b6dc`.
- Preparation branch: `docs/74-v1.2.0-release`, based on develop.
- Before this documentation update, a trial merge produced develop's exact tree `696cf919241e518d04347d40c60c867196ff2f75`; main-only commits were prior promotion merges, with no conflicting content.
- Change set: bilingual README, existing real synthetic images, release/upgrade notes and root package/lock versions from 1.1.0 to 1.2.0; plus the release gate accessibility fix below. Workspace versions and dependencies remain unchanged.
- Delivery sequence: preparation PR to develop, checked promotion PR to main, then v1.2.0 on the exact main merge commit. Branches are retained; no direct main/develop push or tag rewrite.

## Image provenance

README embeds tracked screenshots; no customer screenshots, generated mockups or private data are added. Images remain unchanged at their original paths:

| Image family | Captured code | Existing evidence |
|---|---|---|
| Audit desktop/mobile, Arabic/English, before/after detail | `abf3304` | [Visual manifest](audit-70/evidence/visual-manifest.json), [verification](audit-70/verification.md) |
| Health and policy, Arabic/English | `d978938b431456ca10297ef24937f6ebbcaef6b6` | [Collation fix](audit-72/README.md), [checks manifest](audit-72/evidence/checks.json) |
| Official icon | Existing public application icon | `apps/web/public/icon-192.png` |
| Architecture | Existing source-pinned diagram | [Architecture explanation](architecture-explained-2026-10-09.ar.md) |

The README captions distinguish those capture versions from later documentation-only release commits. Arabic and English guides link to each other; images have meaningful alternative text. Expanded desktop captures and collapsible mobile/detail examples keep the landing page readable.

## Validation and release gates

Local preparation checks passed: 85 Markdown/HTML references resolve, all embedded local images decode and have alternative text, root package/lock versions agree at 1.2.0, ESLint, TypeScript, infrastructure and whitespace checks. A local Markdown preview at AR/EN × 375/1280 loaded every image without page-level overflow. This preview is a documentation rendering check, not a claim about GitHub-hosted CSS or new application acceptance. Full required checks run on the preparation and promotion PRs in the existing unmodified workflow: unit/integration tests, build, worker/file/webhook/authentication, CMS limits, restore, 240 browser journeys and infrastructure checks. Their actual final status and source SHA are recorded in the linked PR check runs and release notes, rather than asserted prospectively here.

The preceding application regression has [895 unit/integration tests and 240 browser journeys](audit-72/README.md); [PR #73 CI](https://github.com/so7ob/web/actions/runs/38152858721) passed. Those counts are historical source-pinned evidence, not a replacement for the release PR checks. Request mutation behavior, permissions and schema are unchanged by preparation; only attachment input semantics are strengthened. Browser fixtures use isolated MariaDB with synthetic data.

Local environment: Node 24.21.0, npm 10.8.2, MariaDB 10.11.18; existing process on port 3108 is preserved. A release build can be checked in an ignored isolated preview to avoid replacing files served by that process.

## Upgrade, limits and recovery

See [v1.2.0 notes](../releases/v1.2.0.md) for all four migrations since v1.1.0 and the required writer pause / separate database identities. Code release does not execute them on an existing site. No production data, .env, files, runtime artifacts or secrets belong in this change.

New audit permissions remain independent, rules start disabled and event retention remains unconfigured. Independent/off-host recovery and external evidence signing are not activated. Post-write recovery must move forward without losing new audit evidence. Documentation/version changes can be reverted through a new PR; published tags must not be rewritten.

## Release gate accessibility correction

While preparing this release, [develop run 38154570885](https://github.com/so7ob/web/actions/runs/38154570885) reported one failed existing axe check out of 240 browser cases: the Arabic request saved-but-refresh-failed scenario exposed an unlabeled conversation file input. A CSS `hidden` class is not a substitute for an accessible name. The input now has its existing translated attachment label and native `hidden` semantics; the visible attachment button still opens it. The AR/EN scenario asserts the label and retains the complete axe scan. No timing retry or disabled rule masks the failure. This is a narrow release-readiness correction under #74, not a change to the resolved status/priority mutation contract.

The first local browser attempt failed before tests because the newly allocated synthetic database had not yet been migrated. Explicit migrations were then applied to that isolated database only. The first unit process printed all 895 passes but exited 143; a repeat completed with exit 0. Initial attempts are retained in ignored local evidence and are not counted as passing gates. Final candidate checks are tracked on the PR.
