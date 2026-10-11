# Local development tools

These tools are optional for product development and are absent from all application runtime imports. `npm ci`, build, product tests, API/worker and maintenance CLIs do not execute them. The UI/UX skill's offline contract tests remain in CI because that maintained tool is retained.

| Skill | Retained purpose / dependency |
|---|---|
| `archify` | Source-backed approved So7ob architecture/request diagrams in `.archify`; candidate schemas, renderers, validation, tests, examples and licenses form one toolchain. Its rendered examples are also tested by its offline-self-containment suite. |
| `ui-ux-pro-max` | Bilingual, responsive, accessible UI design/review guidance; offline catalog contracts are tested in CI. |
| `ui-styling` | Existing Radix/Tailwind UI maintenance and accessibility references. |
| `brand` | Protect So7ob identity and brand context; token-sync regression depends on `design-system`. |
| `design-system` | Token generation/validation and shared styling support for brand/design/slides. |
| `design` | Owner-supplied identity, icon, banner and presentation tools, linked to brand/design-system. |
| `banner-design` | Owner-supplied hero/banner design guidance linked to brand and UI/UX tools. |
| `slides` | Owner-supplied documentation/presentation tooling linked to design/design-system. |

Packaging and maintenance history is in `docs/migration/agent-skills.md`. No evidence establishes that the owner-supplied interconnected design tools are obsolete, so they remain. `skills-lock.json` tracks the installed Archify package; #77 does not change its bytes or remove a locked skill. Generic **output copies** under `.archify` are separate from tool fixtures and were removed. Do not treat catalog CSV/JSON, test fixtures or license files as caches. Python bytecode/caches are ignored.
