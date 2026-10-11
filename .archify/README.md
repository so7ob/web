# Archify deliverables

These are reproducible documentation artifacts, not production services. Open the HTML locally after downloading it; GitHub does not execute HTML previews.

| Subject | Final artifact | Evidence |
|---|---|---|
| So7ob architecture | [HTML](architecture-so7ob-20261009-230021/so7ob.html) | [Final receipts](architecture-so7ob-20261009-230021/handoff.json) |
| Service request: creation | [HTML](sequence-so7ob-request-20261009-230021/creation/creation.html) | Same handoff above |
| Service request: processing | [HTML](sequence-so7ob-request-20261009-230021/processing/processing.html) | Same handoff above |
| Service request: follow-up | [HTML](sequence-so7ob-request-20261009-230021/followup/followup.html) | Same handoff above |

The So7ob diagrams inspect develop at e84fe1b3c3f6b2fd9bf2c79c0a08e53458e5dae3. The duplicated agent example outputs were removed in #77; reusable examples and their tests remain in the Archify development tool. No event-stream diagram was delivered.

So7ob candidates, source evidence, canonical captures and receipts remain for provenance. Exact duplicate captures under final-review were removed; the same bytes remain under visual-check. Historical receipt paths describe their original run and need not all be present in the current tree. Only the links above identify final deliverables; earlier failed receipts do not supersede the final receipts. Absolute paths inside historical receipts describe the original workstation. The reports in ../docs/migration describe source coverage, manual visual review and limitations. Viewer axe checks reported heading-order, landmark-one-main, nested-interactive and region violations; accessibility acceptance is not claimed.

Use the bundled ../.agents/skills/archify/SKILL.md workflow for new diagrams. Do not edit generated HTML to fix source semantics: update the candidate and rerun finalize, retaining earlier evidence.

Release normalization and refreshed receipts: [delivery report](../docs/migration/archify-release-38.md). Earlier receipts and captures describe pre-normalization bytes.

See [repository cleanup](../docs/migration/repository-cleanup-77.md) for removed generic outputs and [source provenance](../docs/migration/source-provenance.md) for their former Git tree.
