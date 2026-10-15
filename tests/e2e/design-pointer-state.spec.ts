import { expect, type Page, type TestInfo } from '@playwright/test';
import { test as base } from './quota-fixture';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createDataSource } from '@so7ob/server';
import { appearanceTokens, defaultNode, validateContent } from '@so7ob/contracts';
import { documentAudit, VisualReadiness } from './visual-checks';
import { movePointerOutside } from './pointer-state';

const palette = {
  'appearance.primaryLight': '#9d174d', 'appearance.accentLight': '#0f766e',
  'appearance.primaryDark': '#f9a8d4', 'appearance.accentDark': '#5eead4',
};
const rgb = (hex: string) => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
const test = base.extend<{ pointerSite: { slug: string; missing: string } }>({
  pointerSite: [async ({ playwright, baseURL }, use) => {
    // Own the synthetic page/palette independently of the browser body's deadline.
    const request = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const db = await createDataSource().initialize(), keys = Object.keys(palette);
    const saved = await db.query('SELECT * FROM SiteSetting WHERE `key` IN (?,?,?,?) ORDER BY `key`', keys);
    let pageId = '';
    try {
      const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
      const { csrfToken } = await (await request.get('/api/auth/csrf')).json();
      expect((await request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
      const headers = { 'x-csrf-token': csrfToken }, slug = prefix + 'pointer' + randomBytes(4).toString('hex'), missing = slug + '-missing';
      expect((await request.patch('/api/admin/settings', { headers, data: palette })).status()).toBe(200);
      const created = await request.post('/api/admin/pages', { headers, data: { slug, titleAr: 'اختبار المؤشر الاصطناعي', titleEn: 'Synthetic pointer test' } });
      expect(created.status()).toBe(201); pageId = (await created.json()).page.id;
      const blocks = (locale: 'ar' | 'en') => {
        const link = defaultNode('buttonLink', new Set());
        link.props = { ...link.props, label: locale === 'ar' ? 'افتح صفحة غير موجودة' : 'Open missing page', href: `/${locale}/${missing}` };
        const content = JSON.stringify({ schemaVersion: 1, blocks: [link] });
        expect(validateContent(content).ok).toBe(true);
        return content;
      };
      expect((await request.patch('/api/admin/pages/' + pageId, { headers, data: { baseRevision: 0, draftBlocksAr: blocks('ar'), draftBlocksEn: blocks('en') } })).status()).toBe(200);
      const detail = (await (await request.get('/api/admin/pages/' + pageId)).json()).page;
      expect((await request.post('/api/admin/pages/' + pageId + '/publish', { headers, data: { baseRevision: detail.draftRevision } })).status()).toBe(200);
      await use({ slug, missing });
    } finally {
      try {
        if (pageId) {
          await db.query('DELETE FROM PageVersion WHERE pageId=?', [pageId]);
          await db.query('DELETE FROM Page WHERE id=?', [pageId]);
          await db.query('DELETE FROM AuditLog WHERE entityId=?', [pageId]);
        }
      } finally {
        try {
          await db.transaction(async manager => {
            for (const key of keys) await manager.query('DELETE FROM SiteSetting WHERE `key`=?', [key]);
            for (const row of saved) {
              const columns = Object.keys(row);
              await manager.query('INSERT INTO SiteSetting (' + columns.map(key => '`' + key + '`').join(',') + ') VALUES (' + columns.map(() => '?').join(',') + ')', columns.map(key => row[key]));
            }
          });
          expect(await db.query('SELECT * FROM SiteSetting WHERE `key` IN (?,?,?,?) ORDER BY `key`', keys)).toEqual(saved);
        } finally { try { await request.dispose(); } finally { await db.destroy(); } }
      }
    }
  }, { timeout: 30000 }],
});
test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function screenshot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}

for (const locale of ['ar', 'en'] as const) for (const mode of ['light', 'dark'] as const) {
  test(`${locale}/${mode}: 404 pointer base, hover and leave after direct and client navigation`, async ({ page, pointerSite }, info) => {
    const tokens = appearanceTokens(palette, mode), readiness = new VisualReadiness(page);
    const missingPath = `/${locale}/${pointerSite.missing}`;
    const heading = page.getByRole('heading', { name: locale === 'ar' ? 'الصفحة غير موجودة' : 'Page not found', exact: true });
    const primary = page.locator('a.bg-primary');
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mode => localStorage.setItem('so7ob-appearance-mode', mode), mode);
    async function states(route: string) {
      await expect(heading).toBeVisible(); await readiness.wait();
      await expect(page.locator('html')).toHaveAttribute('data-color-mode', mode);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(true);
      // Deliberately recreate the contaminated state before invoking the shared fix.
      await primary.hover();
      await expect.poll(() => primary.evaluate(element => element.matches(':hover'))).toBe(true);
      await expect(primary).toHaveCSS('background-color', rgb(tokens['primary-hover']));
      await movePointerOutside(page, primary);
      await expect(primary).toHaveCSS('background-color', rgb(tokens.primary));
      await expect(primary).toHaveCSS('color', rgb(tokens['primary-foreground']));
      await screenshot(page, info, route + '-base');
      await primary.hover();
      await expect.poll(() => primary.evaluate(element => element.matches(':hover'))).toBe(true);
      await expect(primary).toHaveCSS('background-color', rgb(tokens['primary-hover']));
      await expect(primary).toHaveCSS('color', rgb(tokens['primary-hover-foreground']));
      await screenshot(page, info, route + '-hover');
      await movePointerOutside(page, primary);
      await expect(primary).toHaveCSS('background-color', rgb(tokens.primary));
      await expect(primary).toHaveCSS('color', rgb(tokens['primary-foreground']));
      await screenshot(page, info, route + '-leave');
      expect((await documentAudit(page)).violations).toEqual([]);
      await expect(page).toHaveURL(new URL(missingPath, page.url()).href);
    }
    try {
      expect((await page.goto(missingPath))?.status()).toBe(404);
      await states('direct');
      await page.goto(`/${locale}/${pointerSite.slug}`); await readiness.wait();
      await page.evaluate(() => { document.documentElement.dataset.pointerDocument = 'synthetic-client-navigation'; });
      const link = page.locator(`a[href="${missingPath}"]`);
      await link.focus(); await expect(link).toBeFocused(); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new URL(missingPath, page.url()).href);
      await expect(page.locator('html')).toHaveAttribute('data-pointer-document', 'synthetic-client-navigation');
      await states('client');
      expect(errors).toEqual([]);
    } finally { readiness.dispose(); }
  });
}
