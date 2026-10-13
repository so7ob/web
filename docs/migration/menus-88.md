# Admin menu editor — #88

Source: `develop` at `25a3ea2421196145229f1752025bf897e3580960`.
Issue: https://github.com/so7ob/web/issues/88. Branch: `feat/88-menu-editor`.
No stacked dependency; PR base is `develop`.

## Behavior

The header/footer editor now presents compact, expandable links, visible/hidden
badges, contextual move/remove controls, bilingual draft previews and explicit
unsaved states. Move controls work with pointer and keyboard; their result is
announced without moving focus to a different record. Removal requires confirmation
and is published only when the selected menu is saved. The first item opens on load;
new items open and focus the Arabic label. Mobile layouts wrap without horizontal
scrolling. Existing colors, fonts and Radix components remain in use.

A save refreshes only the selected location and its revision. The other location's
unsaved edits and original concurrency revision remain intact. Incomplete links
are no longer silently filtered out on save: validation opens and focuses the
relevant error. Failed writes retain inputs. Uncertain writes and failed post-save
refreshes block further saves until the user reviews/reloads the saved version;
the current draft can be copied before that explicit reload. There is no automatic
write retry. Inputs and location switching are disabled while saving/refreshing.
Existing conflict review continues to preserve drafts in session storage.

The preview describes labels/order, not the entire public header/footer design.
It excludes hidden links and warns about missing labels in the selected language.
When all links are hidden, it shows the same six default links used by the public
site. Summary labels may use the alternate language for identification; the preview
never falsely claims that a missing public translation falls back automatically.

## Compatibility and boundaries

No schema migration, permission change or public rendering change. Existing API
routes, `menus.manage`, checked revisions, twelve-link limit, home-page slug,
custom URLs and server-side auditing remain unchanged. The backend still requires
at least one menu record; disabling all records uses the existing public fallback.
Drafts are per-location in memory, not automatic published changes. Browser reload/
close prompts about unsaved drafts; ordinary SPA navigation behavior is unchanged.
Nested menus, extra placement locations and drag-and-drop are outside this change.

## Acceptance evidence

- Isolated MariaDB 10.11.18 databases: `so7ob_menus88_unit_test` and
  `so7ob_menus88_browser_test`; fresh migrations, synthetic users/content only.
- Local unit/integration suite: 52 files, 926 tests passed, exit 0.
- Full local browser suite at `4b86cda`: 260 passed in 18.4 minutes, exit 0.
  A subsequent positioning-only correction moves the sticky preview below the
  64px admin header; its final focused results and full exact-head CI are linked
  in the PR rather than inferred from that earlier full run.
- Focused browser run: 16 cases passed, exit 0, including the existing public
  HTML/audit save and concurrent-editor conflict journeys.
- New `tests/e2e/menus-editor.spec.ts`: independent header/footer drafts, real
  checked saves, reorder by keyboard, page/home links, visibility preview,
  incomplete-item validation, cancel/confirm removal, retained failed drafts,
  blocked uncertain retries, loading failure recovery, long-label overflow and
  keeping the desktop preview below the sticky admin header during scrolling.
- AR/EN, RTL/LTR, 375/1280, keyboard and axe WCAG 2 A/AA, 2.1 AA and 2.2 AA.
- Required delivery gates: lint, typecheck, test, build, independence, full E2E,
  infra and `git diff --check`. Final full-suite results and exact tested SHA are
  recorded in the linked PR and its CI checks; this document does not assert
  completion of a pending CI run.
- Screenshots: `.migration/menus/{ar,en}-{desktop,mobile}.png`, synthetic only.
  CI uploads `menus-88-synthetic-interfaces`; no `.env` files or database dumps
  are committed or uploaded.

Local logs live under ignored `.migration/menus/`. The first focused invocation
was intentionally interrupted to rebuild the latest uncertain-write handling;
its exit 130 is not a passing run. A subsequent complete run passed. Initial reuse
of a previous scoped test account correctly refused database creation; a separate
synthetic account was created with access to these two new test databases only.

No deployment, user-database migration or security-dependency upgrade is included.
Rollback: revert the PR and rebuild. Saved menu data and URLs remain in place;
there is no database rollback or destructive reset.
