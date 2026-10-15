# Stable workflow publication identity (#121)

Base: fetched develop `3303497d0a81c8bf6e8330058bf88d528074e897` on 2026-10-15. No duplicate #121 branch or PR was found. The open-issue review found no new critical functional report; older P1 reports #107/#102 have merged fixes #122/#129, and both merge commits are ancestors of this base. No other issue was started.

## Current-base evidence

[Issue #121](https://github.com/so7ob/web/issues/121) identified an option ordinal mistaken for a publication number. On this base the overview still returns versions by `createdAt DESC`, and the workspace still displays the filtered array index plus one. The overview already includes publication IDs, workflow IDs, frozen definitions and `createdAt`.

A controlled real-browser probe created an isolated calendar/workflow and published its first version, then published a newer version and another identically named workflow in the same scope. The old publication's ID, definition and timestamp remained byte-for-byte unchanged in MariaDB, while its visible label changed from `· 1` to `· 3`. The probe asserted this broken behavior and passed in 4.4s. Its synthetic evidence is retained locally:

```json
{
  "versionId": "c3079969af64746a454f1df39ae829e",
  "before": "Synthetic version workflow 3ede0e7128ab · 1",
  "after": "Synthetic version workflow 3ede0e7128ab · 3",
  "immutableVersionUnchanged": true
}
```

Evidence JSON SHA-256: `c6925c351f4a549ca61a73d9dccd04f2a7fa17d902af714be860ad2491bb8de8`. The permanent unit regression also failed in both languages before the fix: expected the actual publication ID, received `Similar workflow · 1` / `مسار متشابه · 1`.

## Narrow correction

A shared label uses the immutable publication's full ID, frozen workflow name and exact UTC publication timestamp. No stored ordinal is invented. Full IDs deliberately avoid ambiguity even when shortened IDs collide or names/timestamps are identical. Missing date metadata is named explicitly rather than converted to an invented date. The existing API, IDs, definitions and ordering are unchanged.

The selector and wrapping selected-version note use the same label. Technical IDs/timestamps use explicit LTR direction within Arabic content so ISO dates keep their intended visual order. A preview captures the selected publication before its request, displays that snapshot, and associates the confirmation button with it using `aria-describedby`. Preview stage names also use the captured definition. The successful result uses the same snapshot only after confirmation succeeds. The row's existing `versionId` remains the source version used by server conflict checks; it is not mistaken for the destination.

No server, schema, permission, publication, transfer, job or historical event implementation changes are included. Preview/confirm request payloads remain unchanged. The existing transfer permission checks remain, and only a valid nonlegacy publication in the selected scope can become the UI destination. Existing draft/navigation guards and all their assertions remain intact.

## Validation and limits

Focused unit validation passed **42/42**: the 32 existing workspace cases and ten new Arabic/English cases. New cases cover a single publication; insertion/reordering/filtering; multiple workflows with equal names/dates and colliding ID prefixes; consistent selection/preview/confirmation/result; stale-confirmation rejection; view-only permissions; and missing date metadata.

Real-browser acceptance publishes synthetic versions through the existing API, exercises keyboard controls and actual preview/confirmation, checks HTTP payloads and source/destination IDs, and compares immutable version rows and historical events before/after transfer. It covers Arabic/English at 375/1280 widths, axe, overflow and screenshots, with timeline evidence attached. The new spec is registered in mandatory workflow smoke. Existing backend stale-preview, version-pinning, stage-mapping and permission tests remain unchanged and required.

The gate's synthetic catalog fixture includes the added mandatory spec, and explicitly verifies that omitting it fails even when reports match the reduced catalog. The actual gate implementation and its other negative assertions are unchanged.

The initial browser matrix passed the four stability cases but failed all four transfer cases at the full accessible-description assertion. Chromium used the referenced note's generic `aria-label` instead of its identity text, a difference not caught by jsdom. The reference was moved to the inner plain-text identity, preserving the full assertion and adding the same real-browser check for the selector. Original reports/traces are retained locally; the correction is revalidated before final results are claimed.

The final source-tree focused matrix passed **8/8 browser cases in 2.2 minutes**, after the description and RTL corrections, with no retries. Focused units passed **42/42** again. Arabic mobile screenshots were inspected for full identity wrapping and the UTC date's visual order. Lint, TypeScript, production build, CI policy (13/13), independence (3/3), documentation, infrastructure and diff checks passed. Complete unit/integration and canonical CI results remain separately reported in the PR.

Final source-tree local checks and exact-head CI results are recorded in the PR validation section. Pending checks are not represented as passed. Local databases are new isolated `so7ob_issue121_browser_test` and `so7ob_issue121_unit_test`; all accounts, records, publications and transfers are synthetic and loopback-only. Independent fixture cleanup removes only these owned records, versions, bindings and calendar, without changing existing bindings or role definitions.

Local pinned Chromium 151 download is blocked by HTTP 403, so local browser checks use installed Chromium 154.0.8037.57; canonical CI supplies pinned-browser proof. Local infrastructure uses the existing extracted Nginx wrapper that moves compiled temporary paths into the check's disposable directory. A complete local serial browser run is not claimed in place of complete CI coverage.

The full ID makes labels longer; selected/preview/result text wraps, and native selection retains its existing semantics. SLA time display and broader transfer comparison (#100/#128) are outside this issue. Rollback is a revert of this issue commit. No PR merge, deployment, production record transfer or permission change is performed.
