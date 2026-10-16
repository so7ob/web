# Complete AdminLTE platform adaptation — #180

## Source, scope and workflow

Base: clean `develop` **`e8d0f6cf7367d8732abaa179a1c118010cd86f5e`**, also the observed remote head. #177 was merged on 2026-10-16; no later develop changes existed at inspection. Its scope was administration chrome, selected cards/tables and the appearance sample; its documentation explicitly left public content unchanged and retained the earlier palette and geometry. #180 already covered the missing follow-up and was expanded to the user's complete platform scope, rather than creating a duplicate issue. Branch: `feat/180-adminlte-platform`, rooted in develop. #147 / PR #178 and #179 remain separate test/transport work; no assertion there is represented as fixed by this design change.

Read AGENTS.md, CONTRIBUTING.md, .github issue/PR templates, CI workflow and policy, package/build/browser configuration, design documentation and #176 evidence. Verified both origin URLs and remote repository identity as `https://github.com/so7ob/web.git` before the issue write; repeat this before publication. No Website/Rakim write or production operation. No auth/business API changes or real data fixtures. Appearance DTOs accept six additional validated region settings and a separately namespaced administration appearance contract; an explicit appearance-only baseline migration follows the user’s later authorization to replace previous customizations.

Reference: AdminLTE **v4.10.1**, annotated tag `3f819c27b3b8d9cf6c446281465dd3b05060d7b4`, source **`e13df78a4d0c287e5fa57308e293f63e44e9dd0f`**. A temporary checkout outside the product tree served its committed `dist` locally. Dashboard v1/v2/v3, theme generator, UI, forms, tables and the upstream RTL layout were captured at 375×812 and 1280×900 in light/dark. The reference capture recorded zero failed asset requests. The moving live demo is not the sole reference. [Technical decision, extracted values, compatibility and licenses](../design-system/adminlte.md).

## Mapping and completed implementation

| So7ob element | AdminLTE counterpart | Difference on develop | Change | Verification |
| --- | --- | --- | --- | --- |
| Semantic theme | Bootstrap root/dark variables | Blue/slate palette and larger geometry from earlier system | Extracted neutral surfaces, borders, primary pair, status families and component values | Contract contrast/extreme-palette tests; mode screenshots |
| Type and spacing | Source Sans 3, 16px/1.5, 28px content heading | IBM EN, bold titles, 14px tables and spacious cards | Local Source Sans 3; AR IBM retained; reference heading/control/table scale and 16px card padding | Font/box measurements, bilingual captures |
| Admin shell | app-wrapper / navbar / sidebar | 256px sidebar, 64px header, 1024px boundary | 250px sidebar, measured 57px header, 992px transition, real account dropdown/footer | 991/992 boundary tests, collapse/drawer and focus checks |
| Navigation | sidebar menu / treeview | Flat permission-filtered groups and solid brand active item | Neutral active/hover, real expandable identity subtree; permission filtering retained | Keyboard expansion, actual links, mobile drawer axe |
| Dashboard/account metrics | small-box / info-box | Tall vertical cards, small floating icon, decorative stripes | Four colored headline Small Boxes, secondary horizontal Info Boxes, actual metrics/deep links; account Info Boxes | Geometry assertions, functional metric routes, screenshots |
| Dashboard report | v2 recap / v3 chart and table cards | Separate plain bar/list panels | Real count series in an area chart, accessible data table, status progress, recent request table and activity cards | Actual date/count labels, range links and existing request behavior tests |
| Content/list panels | card / card-header/body/footer | Partial outline adaptation; raw page-specific surfaces | Shared Panel slots/ListWorkspace and application-owned card surfaces; standard shadows | Every route tour, filters/pagination and role cases |
| Buttons/forms | Bootstrap buttons/form controls | Earlier weights/size, inconsistent hover and modal surface | 16px controls, paired states and borders, existing 44px targets; native dates/files preserved | Save/failure/draft/hydration tests and state axe |
| Tables/filters | table / striped / hover / pagination | Prior compact typography and underlines | 16px reference cells, 8px default padding, odd striping/selected/hover, contained scrolling | List geometry and full operational tests |
| Tabs/accordions | nav-tabs / accordion | Underline tabs and a separate public FAQ implementation | Bordered selected tabs and one shared Radix accordion for public FAQ | Arrow/Home/End/RTL tests, actual public FAQ behavior |
| Menus/dialogs/drawers | dropdown / modal / offcanvas | Previous floating palette; iframe portals could escape | Shared palette/geometry with an explicit preview portal owner and owner-document focus recovery | Real iframe dialog open/close/focus, body portal profile tests |
| Badge/feedback/loading | badges / alerts / callout / placeholders | Mixed pill geometry and old palette | Shared semantic status pairs and radius; existing local error/recovery behavior retained | Invalid/disabled/busy examples and functional negative cases |
| Conversations/history | direct-chat / timeline | Rounded inverse bubbles and separate narrow timelines | Shared direct-chat surfaces and logical-direction Timeline primitives | Request/inquiry/account journeys and screenshots |
| Workflow/audit/media/CMS tools | Card + toolbar + form/table/tab composition | Specialized layouts retained earlier surfaces | Apply common card/field/tab/overlay language while keeping their business editors and state | Existing populated workflow, audit, IAM, media and editor suites |
| Public/auth/account/error | Content header/card/callout/form composition | Mostly untouched by #176; large decorative surfaces | Common typography/cards/sections, simpler hero/service/CTA/footer; identity/content hierarchy retained | 104-view tour, 31 published block types, auth/account/tracking checks |
| Draft page preview | Content canvas + toolbar | Negative margins assumed old shell padding; fixed pill bar | Contained canvas and normal-flow toolbar; no covering or page overflow | Desktop/mobile/device-preview tour |
| Appearance | generate/theme.html | Four profiles and a partial sample | 29 presets, both source palettes (14/18), independent sidebar/navbar/footer backgrounds, gradients and modes, actual React sample | Every preset through draft controls, persistence/revert/no-mutation, contrast and existing system/conflict tests |

The user subsequently also required a separate administration theme tab and visitor theme tab. Their settings, fonts, modes, drafts, saves, previews, SSR resolution and personal storage keys are independent; account/auth/CMS screens use the visitor theme. The additive split migration initializes only missing administration values from the frozen AdminLTE baseline and is repeat-safe.

The initial preservation policy for appearance customizations was superseded by the user’s explicit instruction to adopt AdminLTE regardless of prior customizations. The `AdminlteAppearance1792195200000` migration transactionally archives existing appearance rows and installs the pinned baseline once; it touches only known appearance values and their conflict revisions. Empty installations resolve the same contract defaults without stored rows. Other settings, identity and all business data stay intact. Existing enum values remain supported for later explicit choices. Personal color-mode priority remains supported. See the design-system document for the exact 29-preset and 14/18-color catalog and six regional setting keys.

Specialized business pages have no identical AdminLTE module. They intentionally compose its cards, tables, forms, toolbars, tabs, direct-chat and timeline patterns instead of copying demo sales/maps/mailbox data. CMS stored style JSON and responsive/explicit-device overrides are untouched. Application classes/slots are scoped, with no Bootstrap reboot or generic authored-HTML reset.

## Route and screen coverage

Every path below exists in `apps/web/src/app.tsx`; `:locale` is both AR/RTL and EN/LTR. The frozen design tour has **105 views** (all 104 original labels plus the independent administration-appearance screen) and **31 block types**, repeated for light/dark at 375/1280. Additional existing functional suites exercise populated specialized screens and failure/permission/concurrent states. New default-profile cases add measured geometry, 991/992, nested menu keyboard behavior, iframe dialog containment/focus and preview save/cancel without a network mutation. Final results are recorded below rather than inferred from shared-component changes.

| Routes / screen states | Composition and evidence family | Status |
| --- | --- | --- |
| `/:locale/admin` | Dashboard colored Small Boxes, Info Boxes/report/real chart/table; admin-dashboard | Implemented; final matrix pending |
| `/admin/users`, `/users/:id`, `/roles`, `/permissions`, `/invitations` | Lists, account detail, role editors and IAM dialogs | Implemented; final matrix pending |
| `/admin/requests`, `/requests/:id` | Filters, sort, pagination, metadata, workflow, messages, notes, timeline | Implemented; final matrix pending |
| `/admin/inquiries`, `/inquiries/:id` | Same shared vocabulary, both conversation tabs | Implemented; final matrix pending |
| `/admin/notifications`, `/outbox` | List/empty/denied/status/export behaviors | Implemented; final matrix pending |
| `/admin/audit` | Events/reports/reviews/alerts/rules/health and detail overlay | Implemented; final matrix pending |
| `/admin/diagnostics` | Groups, filters, event details, safe failure feedback | Implemented; final matrix pending |
| `/admin/workflows` | Workflows, graph, team editor, business hours, transfers, simulation | Implemented; final matrix pending |
| `/admin/pages`, `/pages/:id/edit`, `/pages/:id/preview` | Library, properties, versions, templates, device and language states | Implemented; final matrix pending |
| `/admin/media`, `/admin/menus` | Real upload/media selection and menu editor/preview tabs | Implemented; final matrix pending |
| `/admin/settings?section=identity|appearance|adminAppearance|contact|sharing|announcement|tracking` | All seven independent sections, actual isolated appearance sample | Implemented; final matrix pending |
| `/:locale/account`, `/requests`, `/requests/new`, `/requests/:id` | Info boxes, 9 list tabs, submission, conversation/history/actions | Implemented; final matrix pending |
| `/account/inquiries`, `/inquiries/:id`, `/notifications` | 7 tabs, dialogs, conversation, read states | Implemented; final matrix pending |
| `/account/profile`, `/security` | Profile, verification, credentials and pending/invalid/disabled states | Implemented; final matrix pending |
| `/:locale/auth/:screen` | Login/register/forgot/reset/invite/verified and password/logout journeys | Implemented; final matrix pending |
| `/:locale/track` | Lookup, access/eligibility/error/conversation views | Implemented; final matrix pending |
| Public home/about/services/works/process/faq/contact | Content headers/cards/callouts/FAQ/forms; same content and URLs | Implemented; final matrix pending |
| Published CMS, 31 block types, nested surfaces and explicit device previews | Shared components plus protected authored styles | Implemented; final matrix pending |
| 404, client navigation, denied access and route failures | Common Panel/PageHeading/ErrorFeedback | Implemented; final matrix pending |

## Validation record

Initial baseline: the unchanged develop build completed a 104-view AR/light/1280 platform tour with axe/keyboard/device checks. PNGs were captured before source edits. A subsequent exploratory mobile baseline used the same old compiled application but was interrupted by a source-token expectation mismatch as work progressed; it is screenshot evidence only, not a passed baseline suite. Final acceptance must use the matching rebuilt application and source.

During implementation:

- Exploratory full unit/integration run: 1150 tests passed in 71 files, isolated MariaDB 10.11.18.
- Shared preview/contracts unit follow-up: 13 tests passed in 3 files.
- The iframe close-focus assertion reproduced the original parent-document recovery bug; `useOverlayFocus` now resolves the owner document. The new iframe dialog/geometry case then passed.
- Full tour exposed the preview shell's obsolete negative margins after the shell padding changed; fixed the composition instead of hiding overflow.
- First complete-browser attempt at `9eb15c7`: interrupted after 25 passes, three contrast failures (account link and menu badges), one interrupted and 533 unrun. The link was 4.36:1 on a striped row; the menu badge was 4.03:1 on a layered translucent background. Resolve primary/accent against the neutral surface and use explicit accent/foreground pairs for these badges. A focused four-case run then passed account, both stale-write/conflict journeys and the iframe geometry/Tab/Shift+Tab/Escape/close-focus case. No assertion was removed or retried.
- The previous white-sidebar assertion was updated to the explicit administration profile token because the new missing-key default is semi-dark. The same test continues to assert the actual computed color.
- ESLint/token guard, TypeScript, client+SSR build, independence, 14 CI-policy/gate tests and real Nginx/systemd syntax checks passed during implementation. These exploratory checks do not substitute for final-source evidence.

Additional observed verification and fixes before the final candidate:

- Candidate `6ef4dc219947fcbb0044c0ae0fcfd41a49601e27`: lint/typecheck/build/independence/infra/CI policy passed, 1152 tests in 71 files passed on isolated MariaDB; 120 interleaved baseline/candidate load samples completed. Its full 570-case local browser run was intentionally stopped after the new independent-theme requirement: 27 passed, one interrupted, 542 unrun. It is not full-suite acceptance. Its benchmark/screenshots remain intermediate evidence until the split-theme candidate is remeasured.

- The 24-case AR/EN × light/dark × 375/1280 profile/geometry/iframe matrix passed at `b9b60b8` locally (7.7m).
- CI run `38922807129` at that same source found mobile editor sheet overflow from `width:100%` plus horizontal tab margins, warning text at 4.48:1 on a neutral conversation surface, a partially obscured account mobile menu, an undersized auth footer link, and custom-brand header overflow. Correct the owning width, neutral semantic pairs, sticky mobile toolbar, actual link target and shrinkable brand; no checks removed.
- The corrected mobile 104-view EN/light tour and pinned geometry case passed. Focused AR account, AR footer, EN reply-draft and EN independent-settings regressions passed after those fixes.
- New generator verification first proved all 29 draft previews, then exposed the missing six DTO allowlist fields on save. Add the DTO fields and assert the response contains the actual saved regional value before reload; a successful status alone is insufficient.
- Exhaustive contract checks cover every enumerated region background and every preset in both content modes. MariaDB schema tests (8 cases) verify the appearance migration and retained schema behavior.

- The split-theme candidate passed 18 focused contract/MariaDB/preview tests, an EN/mobile four-case persistence/draft/preference/geometry regression set, and an AR/dark/mobile four-case set including all 29 presets and the full **105-view** tour. Header light/dark palettes are additionally checked inside actual account-menu body portals.
- Source `6ef4dc2` CI passed all eight design-tour cells but exposed small breadcrumb targets, a dashboard-only obsolete subtitle assertion, sticky-header occlusion of an inquiry action, and out-of-order migration setup in the worker crash rehearsal after appending newer migrations. Fix the actual breadcrumb targets, use the source’s normal-flow navbar, explicitly assert the reference’s subtitle-free dashboard while retaining all other description alignment assertions, and stage the historical migration prefix in original order. Focused desktop layout/media/outbox/reply-draft cases and the killed-worker/restart rehearsal passed; no production migration ran.

- The first full split-theme unit run at `551b17f` reported 1153 passed and one genuine compatibility-validation failure: an old presentation key remained accepted by the API but its validation error was filtered after its UI control moved sections. Include submitted keys themselves in the validated error set as well as related-section keys. The unchanged five-case settings integration suite then passed, including the invalid-value and permission negative cases. No validation assertion was weakened.

Final source SHA, full checks, CI and reviewed visual/bundle results: **pending candidate verification/publication**. No pending result is claimed as passed. [Evidence index](evidence/adminlte-180/README.md).

## Limits, risks and rollback

Accessibility departures from literal demo defaults: retain 44px application control targets, strong input outlines/focus, opaque contrast-tested text, minimal primary adjustment and short reduced-motion-aware transitions. Arabic uses the installed Arabic font and logical-direction layout. Public identity illustration/content and existing Lucide icons intentionally differ from demo data/assets. No pixel-identity percentage is claimed for different business pages/text.

The dependency install reported 12 high-severity advisory findings in the existing dependency graph. No automatic dependency remediation or unrelated framework upgrade was performed; final dependency review is recorded with the evidence. This is not represented as a clean security audit.

Rollback is a reviewed revert of presentation/contracts/font, followed by a reviewed appearance-only forward restore from `migration.adminlte180.appearanceBackup` if that migration has run. Restore archived key/value pairs through the checked settings API or an explicitly reviewed maintenance transaction, advance affected revisions, and leave unrelated settings and all business records intact. Do not restore a whole database to undo appearance. The archive is kept unchanged for review; automatic down migrations remain disabled. All earlier explicit settings enums remain supported. Merging, release, deployment, protection changes and production migration remain outside this authorization.
