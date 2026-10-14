# Unified design system — Issue #92

## Scope and provenance

Implementation starts from `a70f7b4ccb804b489e58414a9ea4c3bb76157464` on `develop`, in `feat/92-unified-design-system`. Issue: https://github.com/so7ob/web/issues/92. No stacked dependency, external reference checkout, new UI dependency, API change, database migration or stored appearance-key rename.

The shared design system is documented in [../design-system/README.md](../design-system/README.md). It preserves the existing logo, configurable fonts, bilingual copy, routes and authorization. Theme generation remains in `appearanceTokens`; SSR bootstrap, settings preview and live surfaces use its semantic pairs. Existing `white`/`navy` CMS values mean adaptive Surface/Emphasis, including responsive overrides. Portfolio artwork and print output have three exact, documented color-guard exceptions.

Administration navigation is grouped into Overview, Operations, Content, Platform and Monitoring; empty permission-filtered groups disappear. Identity retains its linked users/roles/permissions/invitations sections. In-place workflow/audit panels use actual Radix tabs. Shared page headings, toolbars, panels, fields, tables, feedback, controls and tokenized states apply across administration, account, authentication, tracking, public pages and the editor.

## Coverage register

`tests/e2e/design-system.spec.ts` records a `coverage.json` and full-page PNGs per Arabic/English × light/dark × desktop 1280/mobile 375 journey. It changes the actual saved primary/secondary colors to magenta/teal, checks computed backgrounds and verifies that the document never expands horizontally. Every recorded view runs axe WCAG 2 A/AA, 2.1 AA and 2.2 AA; script-disabled preview documents are audited independently from their exact `srcdoc`.

| Area | Screens, tabs and major states | Additional functional evidence |
|---|---|---|
| Administration shell | Dashboard, notifications, navigation groups, mobile drawer | Existing administration, command palette, permissions and identity suites |
| Operations | Requests/inquiries lists, filters, empty/populated results, details, reply/internal note; workflows, teams, hours, transfer | Workflow permissions, concurrent mutations, conversations, saved views, transfers and failure retention suites |
| Content | Pages list, media library, header/footer menus | CMS, media, menu and publication suites |
| Editor | Arabic/English drafts, library/layers, content/style properties, versions locales, template sources, preview | Editor operations, properties, layout, clipboard, drag/drop, undo, conflict, scheduling and inline editing suites |
| Platform | Users, user detail, roles, permissions, invitations; identity/contact/appearance/sharing/announcement/tracking settings sections | Identity authorization/negative cases; independent settings drafts, preview, conflict/uncertain write handling |
| Monitoring | Audit events/reports/reviews/alerts/rules/health, diagnostics, outbox | Audit investigation, operations, health and error feedback suites |
| Account | Dashboard, request status tabs/new/detail, inquiry status tabs/detail, profile, security, notifications | Account ownership, mutations and validation suites |
| Authentication | Login, registration, recovery, reset, invitation, verification, missing page | Authentication/hydration tests, actual login/logout and invitation workflows |
| Public website | Home, about, services, works, process, FAQ, contact, tracking | Public parity, form submission, tracking and publication suites |
| Content blocks | Synthetic published examples of every `BLOCK_REGISTRY` type; adaptive white/navy surfaces, 768px overrides in addition to 375/1280 | Contract validation and CMS compatibility tests |
| Preferences | Custom primary/secondary, system changes, denied browser storage, navigation, density, square/soft/round geometry, 44px controls | Existing before-paint/reload/font/preview isolation tests |

The matrix checks runtime errors and hydration failures. Keyboard Home/End/arrow behavior, focus management, dialogs and reduced motion are tested together with the existing interaction suites. Screenshots use synthetic records only; the full matrix is uploaded by CI as `design-system-92-synthetic-interfaces`. They are review baselines, not pixel-difference tests against an older design.

## Discovery and corrections

Early exploratory runs were intentionally retained locally and were not treated as passing acceptance. They exposed low-opacity decorative text, a labeled status dot without a semantic role, long reference-code overflow on mobile, and a wrong inquiry owner/assignee in the new synthetic fixture. Corrected those issues, paired hover colors, and removed perpetual decorative hero animation. A matrix selector initially selected both a container and its child; it now focuses the intended container and selects it with Enter. Expanded keyboard checks then exposed missing focus restoration in controlled overlays and 20px layer actions: shared Dialog/Sheet/AlertDialog content now returns focus to the connected opener, and layer and canvas actions wrap with 44px targets. The selected canvas toolbar owns a separate layout row above the content so the larger controls cannot cover editable text. User details use an explicit single-column grid on narrow screens, with the heading before identity navigation and account controls. Dialogs use bounded grid tracks and logical close-button positioning in RTL; empty-table feedback is outside the scrolling table. Visual review also found 404 pages resetting the palette: SSR now reuses the existing public-settings allowlist, and client navigation retains the last public presentation. The 404 API and HTTP status are unchanged. Further review found legacy/root leaves bypassing the shared surface mapping and editor device choices following the surrounding viewport: both now use central style generation, including explicit device selection, readable nested content and breakpoint-bounded sparse overrides. The matrix measures leaf colors in the editor, preview and publication. Opaque nested cards reset their own foreground at utility priority, including inside responsive emphasis sections; the published tablet test measures a real nested table and runs axe at 768px as well.

The full functional browser run exposed two additional regressions beyond the route matrix: content-sized textareas could push a draft-review confirmation off screen, and hover tools changed layer heights during pointer dragging. Shared textareas now honor their row sizing, dialogs are bounded and scrollable, and layer tools stop changing layout during an active drag. The existing uncertain-save and pointer/keyboard move tests remain in place; the menu test additionally asserts the confirmation stays within the viewport. The failed/interrupted exploratory run is not acceptance evidence.

The first unit invocation lacked an isolated database configuration; a subsequent overly broad test environment enabled unrelated outbox behavior. Final unit and browser checks use separate isolated MariaDB databases and appropriately scoped environment values. No existing or production database is used, reset or seeded.

## Administration consistency revision

The user reviewed the local administration at port 3108 and rejected its visual consistency. Their users/settings/outbox examples revealed that shared colors and controls did not enforce page composition: outbox separated its icon from its heading, each page positioned tools differently, settings had nested containers and an overlapping save bar, and identity subpages used unrelated card layouts.

The revised implementation uses mandatory `PageHeading` slots throughout administration (including detail and editor headings), a shared `ListWorkspace`, consistent underline navigation, 14px table headings, and the same pagination for identity lists. Settings navigation is horizontal, preview remains independent, image fields are compact, and save/revert/default actions share the page action area. The shell has a single workspace width and simpler toolbar/profile treatment. Dashboard cards and empty states no longer add decorative stripes, movement or nested dashed boxes. Account profile, security, notifications, request/inquiry lists and details use the same heading slots, removing the same icon/title separation there. Existing handlers, permissions, URL navigation and form/conflict state remain owned by their original features.

`tests/e2e/admin-layout.spec.ts` directly covers the reported defect: users/settings/outbox/dashboard heading and description edges must match across pages in both directions, at 375/1280 and in light/dark. It also checks table typography, overflow and axe and captures 32 synthetic screenshots. The full route matrix still covers the remaining pages, tabs and modes. The initial run of this new test used an incorrect preference key, so its two dark-mode failures were a test setup error; the test now uses the application's existing `so7ob-appearance-mode` key.

The previous `34e1ef1` CI run finished with 278 passing and four failing browser tests. All four were the same stale tree-editor DOM selector after the separate canvas toolbar row was introduced. The selector now targets `data-editor-content`; it still performs the real pointer interaction. That historical CI run and the interrupted local run are not final acceptance.

Populated outbox review additionally revealed that long addresses and retry metadata forced a four-column table to scroll on desktop. Fixed column proportions and wrapping now keep it within the desktop workspace while retaining local mobile scrolling. The composition regression test asserts that desktop fit.

## Validation

Final source revision and exit-code-backed results are recorded below after checks complete. Builds alone do not establish visual or functional acceptance.

## Delivery boundary and rollback

Review-only PR to `develop`. No merge, release, tag, deployment, production migration or repository-protection change. This change modifies presentation, generated theme values and tests; rollback is an ordinary reviewed revert. Existing persisted content/settings remain compatible in either direction. No content rewrite or data restoration is required.
