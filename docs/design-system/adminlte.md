# AdminLTE design system — #180

AdminLTE is the authoritative visual reference for So7ob. This completes the administration-only adaptation in #176 / PR #177, merged as `e8d0f6cf7367d8732abaa179a1c118010cd86f5e`. The historical [#176 report](../migration/adminlte-176.md) describes that earlier scope, not current platform acceptance.

## Pinned reference and integration

[AdminLTE v4.10.1](https://github.com/ColorlibHQ/AdminLTE/releases/tag/v4.10.1): annotated tag `3f819c27b3b8d9cf6c446281465dd3b05060d7b4`, peeled commit **`e13df78a4d0c287e5fa57308e293f63e44e9dd0f`**. Both were verified with `git ls-remote` on 2026-10-16. The temporary external checkout's HEAD and package version match. Captures use its committed `dist` and local HTTP server, including its own RTL example, rather than the moving live website. [Evidence and route coverage](../migration/adminlte-180.md).

Read: `dist/generate/theme.html`, `dist/css/adminlte-colors.css`, `dist/css/adminlte-colors-v3.css`, `src/scss/_variables.scss`, `_root.scss`, `_app-wrapper.scss`, `_app-header.scss`, `_app-sidebar.scss`, `_app-main.scss`, `_cards.scss`, `_info-box.scss`, `_small-box.scss`, `_table.scss`, `_direct-chat.scss`, `_timeline.scss`, `src/ts/push-menu.ts`, layout/RTL/theme examples and the compiled Bootstrap styles in `dist/css/adminlte.css`. These sources determine the values below.

Continue the local React adaptation. AdminLTE's manifest exports CSS/Sass and DOM controllers, with Bootstrap `^5.3.8` as a peer; it does not supply the existing React Router/Radix application. Its global stylesheet includes Bootstrap reboot/forms/buttons/modals/utilities, and its controllers mutate the DOM. Importing these alongside Tailwind and React/Radix would introduce a second reset and competing state/focus ownership. No AdminLTE, Bootstrap, jQuery, demo plugin or `@adminlte/react` package is added. A similarly named React package is not evidence of compatibility. The one added runtime dependency is the actually used, pinned `@fontsource/source-sans-3@5.3.0` font; it has no controllers or CSS reset.

The application, its tests, maintenance and build have no reference-checkout dependency. Only extracted primitives, adapted React compositions, license notices and selected evidence are retained. There is no reference archive in the repository.

## Token architecture and measurable defaults

Primitive source: `packages/contracts/src/adminlte-tokens.ts`. Semantic and component aliases: `appearanceTokens` in `site-settings.ts`. `themeStyles` emits the same tokens for SSR, live settings, body portals and preview documents. Shared components and built-in page compositions consume them; database records are never rewritten by this styling layer.

| Property | Pinned reference | So7ob default / intentional difference |
| --- | --- | --- |
| Canvas | light `#f8f9fa`; dark `#2b3035` | Same tertiary surfaces |
| Card / floating surface | light `#fff`; dark `#212529` | Same, including dialogs in portals |
| Main text | light `#212529`; dark `#dee2e6` | Same |
| Primary | `#0d6efd`; dark emphasis `#6ea8fe` | Saved raw defaults match; computed link/action color is minimally adjusted to meet 4.5:1 on all neutral surfaces, including striped rows and paired with a readable foreground |
| Border | light `#dee2e6`; dark `#495057` | Same; input outlines use stronger neutral values for visibility |
| Typography | Source Sans 3; 16px / 1.5; 28px page heading | Source Sans 3 locally for EN; IBM Plex Sans Arabic for AR; 16px tables/controls; 28px normal-weight page titles |
| Radius | 6px | 6px baseline; square/soft/round remain optional choices |
| Cards | 16px body; 8px × 16px header; two subtle shadows | Same defaults / composed headers, body, footer |
| Small Box | primary/success/warning/danger fills; 2.2rem value, subdued large icon, footer | Same composition; solid primary uses the chosen primaryLight in both modes, independently from readable dark-surface emphasis; four real permission-filtered headline metrics, two columns at 375px and four at 1280px |
| Info Box | min 80px; 8px padding; 70px icon block | Same structure; real metrics and existing deep links |
| Table cells | 8px vertical/horizontal; stripe / hover / selected | Same defaults, with existing contained scrolling and semantic badges |
| Sidebar | 250px, transition at 992px; 8px wrapper padding | Same; logical start/end and Radix drawer for small screens |
| Header | measured 57px including its border | Same measured height; controls retain 44px targets |
| Active navigation | neutral emphasis in pinned default | Neutral active/hover pairs; identity remains in the logo and primary actions |
| Tooltip | emphasis/body-bg inverse pair; 14px; 4px × 8px; max 200px; 6px radius | Same neutral pair, dimensions and triangular arrow; opaque for predictable contrast |
| Layers | header below sidebar/backdrop/modal | Existing application layer scale 30/40/50/100; preserves editor and Radix stacking rather than importing Bootstrap's competing 1000+ scale |
| Motion | `.3s ease-in-out` sidebar; Bootstrap `.15s` controls | Existing short 150/200/250ms React/Radix transitions; nonessential motion disabled for reduced motion |

Muted text uses opaque accessible neutral pairs. Success/warning/info/danger derive from Bootstrap's families, with mode-specific accessible text/subtle pairs. Primary hover, emphasis, selected and focus have their own paired tokens. Native date/file controls keep their browser behavior and the common form geometry; media/rich-text/workflow controls use the same card/toolbar/button/field compositions.

## Defaults and saved customization

The accepted baseline is `adminStyle=semi-dark`, `fontEn=source`, `radius=adminlte`, `density=adminlte`, with the pinned blue pair. The user's later explicit instruction in #180 supersedes the initial preservation policy for earlier appearance customizations: adopt AdminLTE itself. The explicit `AdminlteAppearance1792195200000` migration archives prior `appearance.*` rows into `migration.adminlte180.appearanceBackup`, then replaces only the 16 known appearance values with the frozen baseline and advances their conflict revisions. It leaves identity, contact, business policy, user content, accounts, files and all records unchanged. Empty installations need no stored defaults. It is transactional, repeat-safe, and never reapplies over subsequent saved choices. A real MariaDB test verifies reset scope, archive and idempotence. This migration was tested in isolated synthetic databases and later applied to the local development preview when the user reported its stale-server save error; production execution remains a separate operation.

All previous enum values remain accepted for deliberate future customization. Token resolution itself never mutates settings. **Restore defaults** proposes the baseline inside the current draft; **Revert** restores that section's saved values. The existing permission, checked-revision/conflict and independent-section save pipeline persists new regional settings as well.

The user also explicitly required independent visitor and administration themes. **Site appearance** (`appearance.*`) owns public pages, auth, tracking, published CMS and account screens. **Administration appearance** (`adminAppearance.*`) owns all administration routes, including the settings editor itself. Each has its own default mode, colors, fonts, geometry, density, draft, save/revert and real React preview. Administration has the complete region/preset generator; these settings never rewrite visitor appearance. SSR metadata/font CSS and the pre-paint bootstrap resolve the active route scope. Personal preferences use distinct `so7ob-appearance-mode` and `so7ob-admin-appearance-mode` keys, with independently scoped memory fallback when storage is unavailable. Choosing system mode follows the device only for that scope.

The additive `IndependentAdminAppearance1792195201000` migration initializes missing administration keys with the frozen pinned baseline for existing configured installations, leaves later choices intact, and never synchronizes either direction. Neither migration has been executed in production.

The theme generator follows the pinned upstream generator rather than limiting appearance to four profiles: **29 presets**, the **14 designed colors**, the **18 original v3 colors**, their gradients, Bootstrap backgrounds/subtle backgrounds and neutral surfaces. Sidebar, navbar and footer each have independent background and light/dark neutral-surface controls, including an unset background with an explicit region mode. Transparent backgrounds resolve the underlying page surface to keep sticky chrome readable. Palette identifiers are namespaced, so overlapping original/designed names keep their actual source values. Choosing a preset changes sidebar/navbar and the primary pair; the footer retains its independent settings, as in the source generator. Other drafts and content mode remain independent. Choosing a basic profile clears regional overrides and proposes its existing light/dark default. Primary selectors update actual component tokens, including choices, progress, buttons, borders and focus. Region text, hover and active pairs are always AA; the white gradient highlight is minimally reduced if the literal 15% highlight would violate 4.5:1. The sidebar logo follows its own surface rather than the content mode. Navbar account menus are ordinary nonmodal dropdowns, retain keyboard dismissal/focus recovery, and retain an explicit navbar light/dark palette when portalled to body; an unset region mode inherits the active content theme. AA text is always enforced rather than offering the source generator’s switch to disable that protection.

| Chrome profile | Header | Sidebar | Proposed site mode |
| --- | --- | --- | --- |
| Light | Current card | Current card | Light |
| Semi-dark | Current card | `#343a40` | Light |
| Dark | Current card in effective mode | Current card in effective mode | Dark |
| Colored | Paired primary | `#343a40` | Light |

Personal light/dark/system still takes precedence over the site's proposal. All four profiles work in both effective modes. These four profiles remain quick choices alongside the 29 enumerated generator presets. The documented catalog is the implemented scope; it does not imply every possible AdminLTE plugin, layout option or arbitrary custom CSS.

## Components, state and isolation

`Panel`, `PanelHeader/Body/Footer`, `ListWorkspace`, `PageHeading`, `SmallBoxContent`, `InfoBoxContent`, `Timeline` and `TimelineItem` define the card, list, metric and activity compositions. Shared Buttons, fields, native and Radix selects, choices, tabs, accordion, menus, tooltips, dialogs, sheets, tables, badges and feedback use the same tokens. Administration groups retain permission filtering; identity has a real expandable nested navigation list, and the sidebar filter searches only permitted destinations. Breadcrumbs sit alongside content headings. The dashboard combines v1 small boxes, v2 report/status progress and v3 table/card compositions using actual API counts and a single-series SVG area chart; its accessible data table lists the same values. There are no invented sales, map, prior-period series or demo links. The user dropdown contains real account/site/logout destinations. Search and notification controls retain their real features.

Shared button identity uses a stable class because Radix asChild can replace data-slot on a trigger; the configured type, geometry, targets and hover styles therefore apply to actual dialog/menu/tooltip triggers too.

React owns navigation/collapse and feature state. Radix owns disclosure, keyboard interaction, focus and dismissal. No Bootstrap/AdminLTE controller is attached. `PortalContainerProvider` defaults to the normal document; the appearance preview supplies its own body, so shared floating controls stay inside its theme/document. Focus recovery uses the overlay's owner document; iframe Tab edges are handled against that same document because Radix FocusScope checks the module-global document. Caller-prevented events and ordinary document dialogs retain their normal Radix handling. The preview renders actual components, has local example save/cancel feedback and supports a real dialog, tabs and choices; it never posts settings or business data. Busy/invalid/disabled examples are explicit.

Public pages, auth, account and tracking share the same fields/cards/typography. Public headers, sections, service cards and CTAs use the component language while retaining So7ob's content order, logo and cloud illustration. Specialized workflow/editor/audit/media compositions are built from these primitives; AdminLTE has no identical business editor. The draft preview toolbar stays in normal flow, and its canvas keeps contained width. Only application-owned slots/composition classes are styled: no generic `h1`, `button` or `table` reset is applied to CMS-authored HTML. Serialized CMS styles and responsive device overrides remain unchanged and are exercised in publication/editor tests.

## Attribution and licenses

- Adapted layout/component conventions and extracted design values: [AdminLTE MIT notice](licenses/AdminLTE-MIT.txt), ColorlibHQ source pinned above.
- New English font: Source Sans 3, Fontsource 5.3.0, [SIL Open Font License](licenses/Source-Sans-3-OFL.txt). Arabic IBM Plex Sans Arabic, optional IBM Plex Sans/Cairo/Tajawal/Inter remain local Fontsource assets under their package OFL notices.
- Existing Lucide SVG icon system retained for consistent React rendering and RTL treatment: [ISC notice including Feather attribution](licenses/Lucide-ISC.txt). Reference demo Bootstrap Icons are used only in reference screenshots, not copied into the application.
- Reference photographs, demo data, maps and plugins are not product assets. Application evidence contains synthetic fixtures only.

See [implementation evidence](../migration/adminlte-180.md) for actual check status, bundle measurements, route coverage and remaining limits. Passing earlier #177 CI is not evidence for this change.
