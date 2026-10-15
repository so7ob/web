import { expect } from '@playwright/test';
import { test } from './page-copy-fixture';
import { getPortalContent } from '../../apps/web/src/content/portal';
import { documentAudit, VisualReadiness } from './visual-checks';

test.use({ contextOptions: { reducedMotion: 'reduce' } });
for (const locale of ['ar', 'en'] as const) {
  test(`${locale}: duplicates the bilingual draft atomically with keyboard access and keeps the source unchanged`, async ({ page, request, copyFixture: fixture }, info) => {
    const t = getPortalContent(locale).admin.pages, readiness = new VisualReadiness(page), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let release!: () => void, received!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), held = new Promise<void>(resolve => { received = resolve; });
    fixture.releaseOnCleanup(release);
    try {
      for (const prefix of ['/api/admin/pages/', '/api/v1/admin/pages/']) expect((await request.post(prefix + fixture.id + '/duplicate', { data: {} })).status()).toBe(401);
      expect((await page.request.post('/api/admin/pages/' + fixture.id + '/duplicate', { data: {} })).status()).toBe(403);
      const schema = await (await request.get('/api/docs-json')).json();
      for (const prefix of ['/api/admin/pages/', '/api/v1/admin/pages/']) expect(schema.paths[prefix + '{id}/duplicate'].post).toBeTruthy();
      await page.goto(`/${locale}/admin/pages`);
      const actions = page.getByRole('button', { name: t.rowActions.replace('{title}', fixture.title), exact: true });
      await expect(actions).toBeVisible();
      const filtered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/pages' && new URL(response.url()).searchParams.get('q') === fixture.slug);
      await page.getByPlaceholder(t.title, { exact: true }).fill(fixture.slug);
      expect((await filtered).status()).toBe(200);
      await expect(page.getByPlaceholder(t.title, { exact: true })).toHaveValue(fixture.slug);
      await expect(page.locator('tbody tr')).toHaveCount(1);
      await expect(actions).toHaveCount(1);
      let posts = 0;
      await page.route('**/api/admin/pages/' + fixture.id + '/duplicate', async route => { posts++; received(); await gate; await route.continue(); });
      const saved = page.waitForResponse(response => response.url().endsWith('/pages/' + fixture.id + '/duplicate') && response.request().method() === 'POST');
      await actions.focus(); await page.keyboard.press('Enter');
      const copy = page.getByRole('menuitem', { name: t.duplicate, exact: true });
      await copy.focus(); await expect(copy).toBeFocused(); await page.keyboard.press('Enter'); await held;
      await actions.focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('menuitem', { name: t.duplicate, exact: true })).toHaveAttribute('data-disabled', '');
      await page.keyboard.press('Escape'); release();
      const response = await saved; expect(response.status()).toBe(201);
      const result = (await response.json()).page; expect(result.id).not.toBe(fixture.id); expect(result.slug).toBe(fixture.slug + '-copy');
      await expect(page.getByText(t.duplicateSuccess, { exact: true })).toBeVisible();
      await readiness.wait();
      await expect(page.getByPlaceholder(t.title, { exact: true })).toHaveValue(fixture.slug);
      await expect(page.locator('tbody tr')).toHaveCount(2);
      const toast = page.locator('[data-sonner-toast][data-front="true"][data-removed="false"]');
      if (await toast.count()) { await expect(toast).toHaveCSS('opacity', '1'); await toast.hover(); }
      const stored = (await fixture.db.query('SELECT * FROM Page WHERE id=?', [result.id]))[0];
      expect(stored).toMatchObject({ status: 'draft', draftRevision: 0, publishedRevision: null, publishedAt: null, publishedBlocksAr: null, publishedBlocksEn: null, scheduledPublishAt: null, scheduledRevision: null, visibility: 'public', allowedRoles: '[]' });
      for (const field of ['draftBlocksAr', 'draftBlocksEn']) expect(JSON.parse(stored[field])).toEqual(JSON.parse(fixture.before[field] as string));
      expect(JSON.parse(stored.draftSettings)).toMatchObject({ slug: result.slug, titleAr: 'عنوان المسودة', titleEn: 'Draft display title', seoTitleAr: 'بحث اصطناعي', seoTitleEn: null, seoDescEn: 'Draft SEO', visibility: 'public', allowedRoles: [] });
      expect(await fixture.db.query('SELECT id FROM PageVersion WHERE pageId=?', [result.id])).toEqual([]);
      expect(posts).toBe(1);
      expect((await documentAudit(page)).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await info.attach('copied-draft-list', { body: await page.screenshot(), contentType: 'image/png' });
      const copiedRow = page.getByRole('row').filter({ has: page.getByText(result.slug, { exact: true }) });
      await expect(copiedRow).toHaveCount(1);
      await copiedRow.getByRole('button', { name: t.rowActions.replace('{title}', fixture.title), exact: true }).focus();
      await page.keyboard.press('Enter');
      const edit = page.getByRole('menuitem', { name: t.edit, exact: true });
      await edit.focus(); await expect(edit).toBeFocused(); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/${locale}/admin/pages/${result.id}/edit$`));
      await expect(page.locator(`[data-editor-node="draft-${locale}"]`)).toContainText(locale === 'ar' ? 'محتوى المسودة المنسوخة' : 'Copied draft content');
      expect((await fixture.db.query('SELECT * FROM Page WHERE id=?', [fixture.id]))[0]).toEqual(fixture.before);
      expect(errors).toEqual([]);
    } finally { release(); readiness.dispose(); }
  });

  test(`${locale}: copy failure never shows success or creates an empty destination`, async ({ page, copyFixture: fixture }) => {
    const t = getPortalContent(locale).admin.pages;
    await page.goto(`/${locale}/admin/pages`);
    const actions = page.getByRole('button', { name: t.rowActions.replace('{title}', fixture.title), exact: true });
    await expect(actions).toBeVisible();
    const filtered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/pages' && new URL(response.url()).searchParams.get('q') === fixture.slug);
    await page.getByPlaceholder(t.title, { exact: true }).fill(fixture.slug);
    expect((await filtered).status()).toBe(200);
    await expect(page.getByPlaceholder(t.title, { exact: true })).toHaveValue(fixture.slug);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(actions).toHaveCount(1);
    await page.route('**/api/admin/pages/' + fixture.id + '/duplicate', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'unavailable', category: 'temporary' }) }));
    const failed = page.waitForResponse(response => response.url().endsWith('/pages/' + fixture.id + '/duplicate'));
    await actions.focus(); await page.keyboard.press('Enter');
    const copy = page.getByRole('menuitem', { name: t.duplicate, exact: true }); await copy.focus(); await page.keyboard.press('Enter');
    expect((await failed).status()).toBe(503);
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible();
    await expect(page.getByText(t.duplicateSuccess, { exact: true })).toHaveCount(0);
    expect(await fixture.db.query('SELECT id FROM Page WHERE slug LIKE ?', [fixture.slug + '-copy%'])).toEqual([]);
    expect((await fixture.db.query('SELECT * FROM Page WHERE id=?', [fixture.id]))[0]).toEqual(fixture.before);
  });
}
