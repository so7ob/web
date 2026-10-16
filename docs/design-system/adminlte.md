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
| Theme preview | AppearanceSample portals actual shared React components into a sandboxed iframe with the built application stylesheet and draft semantic tokens |

Preview buttons have no submission handlers. React portals avoid bundling react-dom/server into the settings route; preview accessibility checks inspect the rendered frame DOM, including those actual components. Preview rendering never writes parent settings, storage, pending drafts or server state. Other settings previews retain their existing identity/sharing/announcement semantics. Saving advertises `aria-busy` while retaining the existing disabled/recovery logic.

## Profiles and limits

Four coordinated administration profiles are implemented with the optional `appearance.adminStyle` key:

| Profile | Header | Sidebar | Default mode proposed when selected |
| --- | --- | --- | --- |
| Light | Card surface | Card surface | Light |
| Semi-dark | Card surface | Dark emphasis surface with light active item | Light |
| Full dark | Dark card surface | Dark card surface | Dark |
| Colored | Primary surface with its contrast-paired foreground | Dark emphasis surface | Light |

Selecting a profile changes only this new key and `appearance.mode` in the **unsaved** appearance draft and sets the independent preview mode. It retains palette colors, typography, radius and density. Save/revert/conflict handling remains the existing checked settings flow. Personal light/dark/system preference still takes precedence over the site's proposed default; choosing full dark does not erase a visitor's explicit light preference. All four chrome profiles also have contrast-tested light/dark variants for this reason. The explicit preview mode can inspect either variant.

Missing `appearance.adminStyle` defaults to `light` (adaptive existing surfaces), so existing installations keep their current light/dark defaults and all nine earlier values. Generic settings persistence/revisions store the optional enum without a schema migration. Invalid values are rejected. Public content uses the existing palette and mode; chrome tokens are applied only inside administration and its mobile drawer. The four profiles work with all three existing palette presets and custom validated colors; the 17 demo skins and 14 demo palette colors are not claimed. #168 transport remains a separate issue and will need to account for this additive key when implemented.

CSS is scoped through `admin-lte`; portals retain their existing semantic theme owner and Radix behavior. New card slots are opt-in. Public pages and authored editor content retain their current presentation.
