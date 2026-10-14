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

Use `PageHeading`, then section navigation, then the `Toolbar`, content and pagination. A heading must not be nested inside a button or another page header. Keep actions together in the heading action slot.

Use `Panel` for content cards, `FormSection` for a labeled fieldset, `TableScroll` for raw tables, and the existing shared `Table` for composed tables. Scroll dense tables within their container; never hide columns or actions merely to fit the viewport. `NativeSelect` retains native option and keyboard behavior with shared control geometry. `Input`, `Textarea`, `Select`, `Button`, dialogs and feedback share the same tokens. Native checkbox/radio/range/progress accents use the primary token while keeping native semantics.

Use `SectionNav` with real links and `aria-current="page"` for URL navigation. Use `Tabs`, `TabsList`, `TabsTrigger` and `TabsContent` for switching a panel in place; Radix owns arrow/Home/End keyboard navigation and selected/controlled relationships. Labels come from Arabic/English content, with logical start/end spacing.

```tsx
<PageHeading
  title={copy.title}
  description={copy.description}
  actions={<Button onClick={create}>{copy.create}</Button>}
/>
<SectionNav aria-label={copy.sections}>{sectionLinks}</SectionNav>
<ListWorkspace>
  <Toolbar className="ds-list-filters">{filters}</Toolbar>
  <Table>{headAndRows}</Table>
  <AdminPagination {...pagination} />
</ListWorkspace>
```

Administration headings must use `PageHeading`. Its typed slots keep the title and description together, secondary metadata below them, and actions at the opposite edge. Detail screens use the `back` and `metadata` slots. Do not manually arrange a `PageHeader` or `PageTitle` in an administration page; lint rejects that regression. Account pages use the same heading slots. The lower-level title remains available for public/authentication compositions.

Lists use `ListWorkspace` for filters, locally scrolling results, feedback and pagination. Roles and invitations use the same table vocabulary as users and outbox. Diagnostic records retain their expandable details. `Table` already owns scrolling; avoid adding a second decorated container. Use 14px column headings and body cells, with smaller type only for supplementary metadata.

Administration section links and content tabs share an underline treatment. They keep distinct link/tab semantics. Settings use horizontal section navigation, an independent preview beside the form, and save/revert/default actions in the heading. No floating save bar covers form fields. Dashboard metrics use restrained identity accents and real values, without decorative animated stripes or invented trends.

The structure follows the reusable list/form/workspace principle documented by [Frappe Desk](https://docs.frappe.io/framework/user/en/desk). [Odoo's search and filter guidance](https://www.odoo.com/documentation/saas-18.2/applications/essentials/search.html) also informs keeping list tools directly above results. These are adaptations to So7ob's existing React components, permissions, stored theme settings and Arabic/English layouts.

Keep confirmed-only success, preserved form drafts, server authorization and uncertain-write recovery in their existing feature services. Presentation components do not retry writes or clear form state.

## Geometry and movement

Spacing uses a 4/8px rhythm. Body text is 16px; tables and controls use 14px; supporting labels use the secondary text scale. `--space-panel` and `--space-section` support comfortable/compact density. Control targets remain at least 44px; changing density changes padding, not operability. Geometry follows the saved square/soft/round preference. Circular avatars and status dots retain their semantic shape.

Motion uses 150ms for direct interaction, 200ms for tabs/menus and 250ms for dialogs/drawers/entry. Animate named properties, not `all`. `prefers-reduced-motion` removes nonessential movement. The hero illustration is static and adopts the current identity palette.

## Guardrails and evidence

`npm run lint` runs ESLint independently and then `tools/test/design-system.ts`. It rejects literal colors in interface source, including interaction variants, inline CSS and arbitrary Tailwind utilities. Three explicit exceptions: the two portfolio illustration/demo modules retain their represented identity, and print output uses a light paper palette. Exceptions do not waive accessibility checks.

Tests cover semantic contrast including extreme palettes, responsive CMS compatibility, every route family and administration workspace, custom palettes, native controls, storage failure, system preference, RTL/LTR and responsive screenshots. New features must reuse the primitives and extend route/tab coverage when adding a screen.

References: [shadcn theming](https://ui.shadcn.com/docs/theming), [beUI](https://beui.dev/), [Rare UI](https://www.rareui.com/) and [Transitions](https://transitions.dev/). These informed composition and interaction; no external component package or paid template was imported.
