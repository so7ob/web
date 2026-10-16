# AdminLTE design system — #180

AdminLTE is the authoritative visual reference for So7ob. This completes the administration-only adaptation in #176 / PR #177, merged as `e8d0f6cf7367d8732abaa179a1c118010cd86f5e`. The historical [#176 report](../migration/adminlte-176.md) describes that earlier scope, not current platform acceptance.

## Pinned reference and integration

[AdminLTE v4.10.1](https://github.com/ColorlibHQ/AdminLTE/releases/tag/v4.10.1): annotated tag `3f819c27b3b8d9cf6c446281465dd3b05060d7b4`, peeled commit **`e13df78a4d0c287e5fa57308e293f63e44e9dd0f`**. Both were verified with `git ls-remote` on 2026-10-16. The temporary external checkout's HEAD and package version match. Captures use its committed `dist` and local HTTP server, including its own RTL example, rather than the moving live website. [Evidence and route coverage](../migration/adminlte-180.md).

Read: `src/scss/_variables.scss`, `_root.scss`, `_app-wrapper.scss`, `_app-header.scss`, `_app-sidebar.scss`, `_app-main.scss`, `_cards.scss`, `_info-box.scss`, `_small-box.scss`, `_table.scss`, `_direct-chat.scss`, `_timeline.scss`, `src/ts/push-menu.ts`, layout/RTL/theme examples and the compiled Bootstrap styles in `dist/css/adminlte.css`. These sources determine the values below.

Continue the local React adaptation. AdminLTE's manifest exports CSS/Sass and DOM controllers, with Bootstrap `^5.3.8` as a peer; it does not supply the existing React Router/Radix application. Its global stylesheet includes Bootstrap reboot/forms/buttons/modals/utilities, and its controllers mutate the DOM. Importing these alongside Tailwind and React/Radix would introduce a second reset and competing state/focus ownership. No AdminLTE, Bootstrap, jQuery, demo plugin or `@adminlte/react` package is added. A similarly named React package is not evidence of compatibility. The one added runtime dependency is the actually used, pinned `@fontsource/source-sans-3@5.3.0` font; it has no controllers or CSS reset.

The application, its tests, maintenance and build have no reference-checkout dependency. Only extracted primitives, adapted React compositions, license notices and selected evidence are retained. There is no reference archive in the repository.

## Token architecture and measurable defaults

Primitive source: `packages/contracts/src/adminlte-tokens.ts`. Semantic and component aliases: `appearanceTokens` in `site-settings.ts`. `themeStyles` emits the same tokens for SSR, live settings, body portals and preview documents. Shared components and built-in page compositions consume them; database records are never rewritten by this styling layer.

| Property | Pinned reference | So7ob default / intentional difference |
| --- | --- | --- |
| Canvas | light `#f8f9fa`; dark `#2b3035` | Same tertiary surfaces |
| Card / floating surface | light `#fff`; dark `#212529` | Same, including dialogs in portals |
| Main text | light `#212529`; dark `#dee2e6` | Same |
| Primary | `#0d6efd`; dark emphasis `#6ea8fe` | Saved raw defaults match; computed link/action color is minimally adjusted to meet 4.5:1 on the canvas and paired with a readable foreground |
| Border | light `#dee2e6`; dark `#495057` | Same; input outlines use stronger neutral values for visibility |
| Typography | Source Sans 3; 16px / 1.5; 28px page heading | Source Sans 3 locally for EN; IBM Plex Sans Arabic for AR; 16px tables/controls; 28px normal-weight page titles |
| Radius | 6px | 6px for new defaults; stored square/soft/round keep their previous values |
| Cards | 16px body; 8px × 16px header; two subtle shadows | Same defaults / composed headers, body, footer |
| Info Box | min 80px; 8px padding; 70px icon block | Same structure; real metrics and existing deep links |
| Table cells | 8px vertical/horizontal; stripe / hover / selected | Same defaults, with existing contained scrolling and semantic badges |
| Sidebar | 250px, transition at 992px; 8px wrapper padding | Same; logical start/end and Radix drawer for small screens |
| Header | measured 57px including its border | Same measured height; controls retain 44px targets |
| Active navigation | neutral emphasis in pinned default | Neutral active/hover pairs; identity remains in the logo and primary actions |
| Layers | header below sidebar/backdrop/modal | Existing application layer scale 30/40/50/100; preserves editor and Radix stacking rather than importing Bootstrap's competing 1000+ scale |
| Motion | `.3s ease-in-out` sidebar; Bootstrap `.15s` controls | Existing short 150/200/250ms React/Radix transitions; nonessential motion disabled for reduced motion |

Muted text uses opaque accessible neutral pairs. Success/warning/info/danger derive from Bootstrap's families, with mode-specific accessible text/subtle pairs. Primary hover, emphasis, selected and focus have their own paired tokens. Native date/file controls keep their browser behavior and the common form geometry; media/rich-text/workflow controls use the same card/toolbar/button/field compositions.

## Defaults and saved customization

New defaults use `adminStyle=semi-dark`, `fontEn=source`, `radius=adminlte`, `density=adminlte`, and the pinned blue pair. Missing settings use these design defaults. Explicit previously stored values remain authoritative: `light` chrome, all prior fonts/palettes, `soft` (12px controls / 16px panels), `round`, `square`, `comfortable` (24px panels / 14px table padding) and `compact` are still accepted. Tests exercise the old geometry and confirm token resolution does not mutate the supplied settings.

The existing **Restore defaults** action proposes the new defaults only in the appearance draft. Saving uses the existing permission, revision/conflict and independent-section pipeline. Choosing a color preset changes only colors; choosing a chrome profile changes only style + proposed default mode. Other settings drafts, identity assets and saved custom colors are retained. No migration or silent setting reset is introduced.

| Chrome profile | Header | Sidebar | Proposed site mode |
| --- | --- | --- | --- |
| Light | Current card | Current card | Light |
| Semi-dark | Current card | `#343a40` | Light |
| Dark | Current card in effective mode | Current card in effective mode | Dark |
| Colored | Paired primary | `#343a40` | Light |

Personal light/dark/system still takes precedence over the site's proposal. All four profiles work in both effective modes. This is four coordinated profiles, not a claim to implement all demo skins or palette options.

## Components, state and isolation

`Panel`, `PanelHeader/Body/Footer`, `ListWorkspace`, `PageHeading`, `InfoBoxContent`, `Timeline` and `TimelineItem` define the card, list, metric and activity compositions. Shared Buttons, fields, native and Radix selects, choices, tabs, accordion, menus, tooltips, dialogs, sheets, tables, badges and feedback use the same tokens. Administration groups retain permission filtering; identity has a real expandable nested navigation list. The user dropdown contains real account/site/logout destinations. Search and notification controls retain their real features.

React owns navigation/collapse and feature state. Radix owns disclosure, keyboard interaction, focus and dismissal. No Bootstrap/AdminLTE controller is attached. `PortalContainerProvider` defaults to the normal document; the appearance preview supplies its own body, so shared floating controls stay inside its theme/document. Focus recovery uses the overlay's owner document. The preview renders actual components, has local example save/cancel feedback and supports a real dialog, tabs and choices; it never posts settings or business data. Busy/invalid/disabled examples are explicit.

Public pages, auth, account and tracking share the same fields/cards/typography. Public headers, sections, service cards and CTAs use the component language while retaining So7ob's content order, logo and cloud illustration. Specialized workflow/editor/audit/media compositions are built from these primitives; AdminLTE has no identical business editor. The draft preview toolbar stays in normal flow, and its canvas keeps contained width. Only application-owned slots/composition classes are styled: no generic `h1`, `button` or `table` reset is applied to CMS-authored HTML. Serialized CMS styles and responsive device overrides remain unchanged and are exercised in publication/editor tests.

## Attribution and licenses

- Adapted layout/component conventions and extracted design values: [AdminLTE MIT notice](licenses/AdminLTE-MIT.txt), ColorlibHQ source pinned above.
- New English font: Source Sans 3, Fontsource 5.3.0, [SIL Open Font License](licenses/Source-Sans-3-OFL.txt). Arabic IBM Plex Sans Arabic, optional IBM Plex Sans/Cairo/Tajawal/Inter remain local Fontsource assets under their package OFL notices.
- Existing Lucide SVG icon system retained for consistent React rendering and RTL treatment: [ISC notice including Feather attribution](licenses/Lucide-ISC.txt). Reference demo Bootstrap Icons are used only in reference screenshots, not copied into the application.
- Reference photographs, demo data, maps and plugins are not product assets. Application evidence contains synthetic fixtures only.

See [implementation evidence](../migration/adminlte-180.md) for actual check status, bundle measurements, route coverage and remaining limits. Passing earlier #177 CI is not evidence for this change.
