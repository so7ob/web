# Announcement audit differences (#111)

On develop `d77418b2378d74e24d6e49df5b6900f2ef344fa2`, an isolated MariaDB regression saved a toggle and both announcement texts successfully but found an empty `settings.updated` changes array. The same regression failed before the fix on the preceding develop `0c904bbc1d7d9ec30c88d43d2dd6048fb69afc33`.

The save now projects only `announcement.enabled`, `announcement.messageAr` and `announcement.messageEn`. These are public announcement fields, explicitly allowlisted for this event. The existing site-settings lock, merged validation, revision checks, settings writes and audit insert remain one transaction. The prior snapshot comes from the rows read under that lock, with the same effective defaults used for validation; it describes the effective public state rather than claiming that an absent database row existed. Enabled values are booleans in the audit only; persisted settings and the API remain unchanged. Existing audit string and payload limits still apply.

Announcement-only saves use the logical resource reference `announcement`, without inventing a row identifier. Mixed saves retain the settings resource and changed-key context. Automatic cache revisions, CTA URLs, contact values, secrets and unrelated settings are excluded from the snapshots. Unchanged public values yield `no_change` only if all submitted effective settings are unchanged. If an excluded field changes alone, the event retains an unknown field difference rather than falsely claiming no change.

The reader accepts exact catalog leaf paths without granting their parent, children or sibling paths. Existing nested-field and secret redaction rules remain in place. Arabic and English labels use the existing audit detail, summary and report rendering. No historical events are rewritten or reconstructed from current settings. Settings, audit, export and workflow ownership permissions are unchanged.

## Validation

- The pre-fix regression failed on current develop with the actual empty change array (one test, 6.13 seconds).
- Focused MariaDB checks: 31 passing across announcement audit, existing site settings and existing audit integration tests (15.75 seconds). Coverage includes single/multiple changes, disabling, empty/default values, genuine no-change, excluded-field changes, oversized/invalid/stale saves, competing writes, actor-scoped audit-insert failure with settings/revision rollback, permissions and historical missing differences.
- Browser and complete checks are recorded below after execution. No timeout, retry, skip, authorization or accessibility rule is weakened.

All fixtures are synthetic and use separate local test databases. Test fault injection is restricted to its random actor and event type; cleanup drops its uniquely named trigger in a `finally` block and independently in teardown. The fixture restores the exact settings and revision rows it owns.

## Rollback and limitations

Revert this issue's application change to stop collecting new announcement differences. Existing historical records remain intact. No schema migration, deployment, data backfill or permission change is required. Only the three confirmed public fields are covered; this does not claim that every settings field has before/after data.
