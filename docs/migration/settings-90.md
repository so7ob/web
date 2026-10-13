# Settings, identity and appearance — Issue #90

Base: develop `7a2c45f1700cb89cc0a9375c1827e268919e263f` (menus #89). Work is confined to so7ob/web; no reference checkout, production migration or deployment is needed.

## Delivered behavior

Six bilingual deep-linked sections keep independent drafts and revisions: identity, appearance, contact, sharing/search, announcements, and tracking/response. Only the selected section is saved. Section navigation does not refetch the root loader. A confirmed response returns canonical changed values/revisions; the presentation provider applies them without a follow-up read that could discard other drafts. Unsaved navigation/reload prompts, inline errors, a keyboard-linked summary, section revert/defaults, and preserved conflict/uncertain-write snapshots are provided. Default restoration only changes the draft until saved. Uncertain writes are never automatically repeated.

Identity includes Arabic/English names, four optional logos (language × light/dark surface), a PNG favicon and name visibility. Empty names retain the existing fallback. Media selection requires `media.manage`; uploading continues to require `media.upload`; settings changes require `settings.manage`. Existing library raster validation is retained, with PNG required for the favicon. Default images remain available. Used logos/share images participate in media usage counts and deletion protection.

Light/dark/system mode is shared across the public site, accounts and administration. A visitor can choose a browser-local override or return to the site default. The server emits a default mode and allowlisted CSS variables; a small pre-paint bootstrap applies the visitor/device preference before rendering the body. React hydrates the application root, not the modified html attributes. Device preference changes and other-tab changes are observed. Storage failure retains the choice for the current session.

Blue, teal and violet presets and custom primary/supporting colors derive readable palette pairs. Colors are validated as six-digit hex; text/button/link/focus pairs are contrast-checked. Status meanings remain separate from branding. Surface, foreground and permanently dark surface tokens are distinct. Shared controls/cards/table spacing support configured radius and density; pointer controls retain minimum usable sizes. Existing explicitly authored content styling is not rewritten in the database. Printing uses a light palette.

Fonts are selected independently per language: IBM Plex Sans Arabic/Cairo/Tajawal/system, and IBM Plex Sans/Inter/system. Fontsource Cairo, Tajawal and Inter are pinned at 5.3.0, OFL-1.1; the existing IBM packages remain. Files ship locally through Vite and only selected faces are requested. No font CDN, arbitrary CSS/script, external font URL or custom font upload is introduced.

Social links include GitHub, LinkedIn, X, Facebook, Instagram, YouTube, Telegram and WhatsApp; explicitly cleared links are hidden. Site names, icons, descriptions and sharing defaults reach server HTML and client navigation. Published page descriptions and published image references take precedence. Legacy page image references are read only when no published settings snapshot exists; draft settings are never used for public metadata. Existing announcement/tracking features and response-policy acknowledgement remain.

## Persistence and compatibility

No schema migration or data backfill. New settings use SiteSetting and existing AdminRevision records. Existing `/api/admin` and `/api/v1/admin` aliases remain. Checked writes return `{ok, settings, revisions}` additively. Final merged values are validated under the settings transaction, and audit/revisions/settings commit together. Identity references share the CMS media deletion lock; missing/deleted media cannot be committed. Public payloads have an explicit presentation allowlist and exclude tracking/internal settings.

The settings-only role does not acquire media permissions implicitly. A settings manager without media management can edit names/colors and clear an existing asset but cannot attach a library image. Operational workflow calendars remain in workflow administration, linked according to permission; this does not duplicate their policies or recalculate version-pinned timers.

## Verification

All databases and assets used in acceptance are synthetic. Local databases: `so7ob_settings90_unit_test` and `so7ob_settings90_browser_test`, on MariaDB 10.11.18. Both were explicitly migrated before testing. Private fixture configuration and logs are ignored under `.migration/settings/`.

The contracts cover extreme colors, contrast, executable/invalid setting values and safe URL/media references. MariaDB coverage includes independent revisions, conflicting writes, final merged announcement dates, authorization, in-use deletion and deletion-winning races. Browser coverage includes independent drafts, isolated previews, actual local font loading, preserved failed writes, no post-save root fetch, media selection/favicon/sharing precedence, system-mode changes, and Arabic/English 375/1280 keyboard/axe checks across settings and representative public/account/admin surfaces.

An initial full browser run exposed two test-harness assumptions: axe asynchronous frame timers cannot reliably execute inside the script-disabled preview, and a file-cleanup assertion assumed its job was the only queued deletion. The host and the exact preview document are now both audited, with the preview copied to an isolated test page so the production sandbox stays intact. The cleanup test processes the FIFO through its own job and asserts both completion and byte removal. No accessibility rule or deletion assertion was removed.

Delivery gate outcomes and the final SHA/CI run are recorded in the PR. Required commands: lint, typecheck, test, build, test:independence, test:e2e, test:infra, and git diff --check. CI preserves `.migration/settings/*.png` as `settings-90-synthetic-interfaces`.

## Rollback and boundaries

Revert the feature commit(s) and rebuild/restart the application. No down migration is necessary. New keys and existing media files must be retained; returning to this version restores their interpretation. Before reverting while custom identity assets are in use, retain their files and prevent their deletion through the older library UI, whose usage index does not know these settings. Reversion does not restore changed contact/announcement/tracking values automatically; use reviewed prior settings if necessary.

Browser appearance overrides are per browser, not account-synchronized. Global changes become visible on the next server render/navigation; no real-time broadcasting to already-open visitor pages is added. Preview content is synthetic and sandboxed. Custom page colors remain author-controlled. Email branding/infrastructure, integrations, arbitrary typography uploads, publishing, production migration and merge are outside this change.
