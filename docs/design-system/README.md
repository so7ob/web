# So7ob design system

The public website, account, authentication, tracking, administration and editor share one visual language: restrained surfaces, readable bilingual typography, purposeful identity accents and short interactions. Layout follows the task; component styling follows this system.

## Sources of truth

- `packages/contracts/src/site-settings.ts`: `appearanceTokens(settings, mode)` supplies the complete semantic palette, geometry, density and motion timings. `APPEARANCE_MOTION` is also available to React animations. Raw palette values belong here.
- `apps/web/src/lib/appearance.ts`: the same tokens generate SSR CSS, live settings and sandboxed previews. Existing storage keys, public settings and light/dark/system precedence remain compatible.
- `apps/web/src/styles.css`: Tailwind aliases and shared component/layout styles. Do not create another theme provider or a page-specific palette.
- `apps/web/src/components/ui`: Radix primitives plus workspace compositions. Existing feature modules own fetching, permissions, writes and failure recovery.

## Color roles

| Purpose | Surface | Content |
|---|---|---|
| Page | `background` | `foreground` |
| Panel | `card` | `card-foreground` |
| Floating content | `popover` | `popover-foreground` |
| Primary action | `primary` | `primary-foreground` |
| Primary hover | `primary-hover` | `primary-hover-foreground` |
| Subtle interaction | `accent` | `accent-foreground` |
| Emphasized content | `emphasis` | `emphasis-foreground` / `emphasis-muted` |
| Action on emphasis | `emphasis-action` | `emphasis-action-foreground` |
| Status | `{success,warning,info,danger,highlight}-soft` | matching `-foreground` |
| Solid status | `{success,warning,info,danger,highlight}` | matching `on-*` |
| Navigation | `sidebar` | `sidebar-foreground`; active `sidebar-accent` / `sidebar-primary` |

Primary and highlight colors derive from saved identity settings. Semantic status colors preserve their meaning independently, with different light/dark values. Never reduce text contrast with opacity. Pair a filled button with its own foreground, not a literal white text class.

`inverse`, `brand`, `navy`, `digital` and `skydrop` remain compatibility aliases for existing components. New code should use purpose-based names. `navy` is a foreground alias, not a background surface.

CMS stored values are unchanged: `white` now means Surface (`bg-card surface-card`), `navy` means Emphasis (`bg-emphasis surface-emphasis`). Compound classes receive their own responsive prefix. Editor swatches, editor canvas, preview and published renderers share this mapping. Surface context supplies readable descendants; nested cards restore normal foregrounds. Explicit preview devices resolve the selected slot independently of the surrounding browser window. Sparse overrides are bounded to their device breakpoint and cannot leak into a different device. Both legacy/root leaves and nested containers use the central mapping. User content and saved style data are not rewritten.

## Composition

Use `PageHeader` + `PageTitle`, then section navigation, then the `Toolbar`, content and pagination. A heading must not be nested inside a button or another page header. Keep actions together at the logical end of the header.

Use `Panel` for content cards, `FormSection` for a labeled fieldset, `TableScroll` for raw tables, and the existing shared `Table` for composed tables. Scroll dense tables within their container; never hide columns or actions merely to fit the viewport. `NativeSelect` retains native option and keyboard behavior with shared control geometry. `Input`, `Textarea`, `Select`, `Button`, dialogs and feedback share the same tokens.

Use `SectionNav` with real links and `aria-current="page"` for URL navigation. Use `Tabs`, `TabsList`, `TabsTrigger` and `TabsContent` for switching a panel in place; Radix owns arrow/Home/End keyboard navigation and selected/controlled relationships. Labels come from Arabic/English content, with logical start/end spacing.

```tsx
<PageHeader>
  <div><PageTitle>{copy.title}</PageTitle><p className="ds-page-description">{copy.description}</p></div>
  <Toolbar><Button onClick={create}>{copy.create}</Button></Toolbar>
</PageHeader>
<Panel><FormSection title={copy.details}>{fields}</FormSection></Panel>
```

Keep confirmed-only success, preserved form drafts, server authorization and uncertain-write recovery in their existing feature services. Presentation components do not retry writes or clear form state.

## Geometry and movement

Spacing uses a 4/8px rhythm. Body text is 16px; tables and controls use 14px; supporting labels use the secondary text scale. `--space-panel` and `--space-section` support comfortable/compact density. Control targets remain at least 44px; changing density changes padding, not operability. Geometry follows the saved square/soft/round preference. Circular avatars and status dots retain their semantic shape.

Motion uses 150ms for direct interaction, 200ms for tabs/menus and 250ms for dialogs/drawers/entry. Animate named properties, not `all`. `prefers-reduced-motion` removes nonessential movement. The hero illustration is static and adopts the current identity palette.

## Guardrails and evidence

`npm run lint` runs ESLint independently and then `tools/test/design-system.ts`. It rejects literal colors in interface source, including interaction variants, inline CSS and arbitrary Tailwind utilities. Three explicit exceptions: the two portfolio illustration/demo modules retain their represented identity, and print output uses a light paper palette. Exceptions do not waive accessibility checks.

Tests cover semantic contrast including extreme palettes, responsive CMS compatibility, every route family and administration workspace, custom palettes, native controls, storage failure, system preference, RTL/LTR and responsive screenshots. New features must reuse the primitives and extend route/tab coverage when adding a screen.

References: [shadcn theming](https://ui.shadcn.com/docs/theming), [beUI](https://beui.dev/), [Rare UI](https://www.rareui.com/) and [Transitions](https://transitions.dev/). These informed composition and interaction; no external component package or paid template was imported.
