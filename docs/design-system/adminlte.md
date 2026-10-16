# AdminLTE administration adaptation (#176)

AdminLTE is the user's authoritative administration visual/component reference, replacing the earlier Frappe/Odoo composition reference for this scope. The existing semantic palette, bilingual fonts, 4/8px spacing, 44px targets, density, radius, Radix controls, permission checks and draft recovery remain valuable and are preserved.

## Pinned source and boundary

Selected stable [AdminLTE 4.10.1](https://github.com/ColorlibHQ/AdminLTE/releases/tag/v4.10.1), released 2026-10-08, tag commit `e13df78a4d0c287e5fa57308e293f63e44e9dd0f`. Checked the release, tagged source, documentation and package manifest on 2026-10-16. The [MIT notice](licenses/AdminLTE-MIT.txt) is retained for the adapted conventions.

Read `src/scss/_app-wrapper.scss`, `_app-sidebar.scss`, `_cards.scss`, `_table.scss`, `src/ts/push-menu.ts`, and the layout/RTL documentation under `src/html/pages/docs`. The package declares Bootstrap `^5.3.8` as a peer; `adminlte.scss` imports Bootstrap including root/reboot/forms/buttons/modals/utilities. Its vanilla TypeScript controllers mutate DOM and own sidebar state. Importing those globally would duplicate Tailwind resets and compete with React/Radix state/focus handling. We therefore implement the visual conventions locally using React, logical CSS properties and existing semantic tokens. No AdminLTE/Bootstrap/jQuery dependency or demo plugin is installed. GitHub release availability does not assert npm publication.

## Mapping

| AdminLTE convention | So7ob implementation |
| --- | --- |
| Fixed sidebar, header, content workspace | Sticky 256px administration sidebar, header, muted content surface; mobile Radix Sheet |
| Push-menu | Explicit desktop toggle, `aria-controls`/`aria-expanded`, focus remains on trigger; no persistent preference or remount of page drafts |
| Sidebar navigation | Grouped existing permission-filtered links, solid primary active item and start-edge indicator |
| Content header | Existing PageHeading and real breadcrumb links; original actions remain owned by their feature |
| Outline cards | Primary top edge, semantic surface/shadow; PanelHeader/Body/Footer reusable slots |
| Info boxes | Dashboard's real metrics with substantial icon blocks, no invented trends |
| Tables/forms | Card-contained filter/results/footer, striped rows and hover/focus/selected states; existing input geometry and error/disabled semantics |
| Theme preview | AppearanceSample renders actual shared components to static markup in a sandboxed iframe with the built application stylesheet and draft semantic tokens |

Preview buttons have no submission handlers. Parent settings, storage, pending drafts and server state are untouched. Other settings previews retain their existing identity/sharing/announcement semantics. Saving advertises `aria-busy` while retaining the existing disabled/recovery logic.

## Profiles and limits

This first implementation supplies the adapted administration layout in existing light/dark/system modes and preserves all three saved palette presets (blue, teal, violet), fonts, radius and comfortable/compact density. It does **not** claim to deliver the demo's 17 coordinated skins or 14 optional colors. Independent semi-dark/gradient header/sidebar profiles would require an explicit compatible settings contract, contrast matrix and scoped portal strategy; they are deferred, not simulated by resetting existing keys. #168 import/export is unchanged. No new appearance keys or database migrations.

CSS is scoped through `admin-lte`; portals retain their existing semantic theme owner and Radix behavior. New card slots are opt-in. Public pages and authored editor content retain their current presentation.
