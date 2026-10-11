# Portal accessibility defects — #45

Before changing code, a live browser reproduction at `3b5a8f2` found
aria-valid-attr-value on requests/inquiries and color-contrast on requests/new in
all twelve locale/width/route combinations. See the synthetic `before.json` under
`evidence/portal-accessibility-45/`; this is current target evidence, separate from
`tests/e2e/fixtures/account-axe-baseline.json`, which remains a historical source
record with its original SHA.

The active Radix tab now owns its visible content panel, including search and
results, with explicit RTL/LTR direction. Existing filter/data behavior remains.
Request hints, optional labels and placeholders use the existing readable muted
foreground token. No identity, content, authorization or flow was removed.

Target portal journeys now require zero axe violations instead of permitting the
historical exceptions. Additional keyboard tests exercise arrow/Home selection,
focus and both ARIA links at 375/1280 in Arabic/English. No axe exclusions or
hidden-element workaround. Passing these checks is not comprehensive accessibility
certification. Actual post-change results/SHA are recorded in the PR.

Independent develop branch; no data/schema change. Rollback is a reviewed revert;
keep historical evidence intact.
