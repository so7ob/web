import { expect } from '@playwright/test';
import { test } from './quota-fixture';
import { readFileSync, mkdirSync } from 'node:fs';
import { documentAudit, VisualReadiness } from './visual-checks';

for (const locale of ['ar', 'en'] as const) for (const mode of ['light', 'dark'] as const) {
  test(`AdminLTE ${locale}/${mode}: shell, tables and real component preview`, async ({ page }, info) => {
    test.setTimeout(120000);
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    await page.addInitScript(value => localStorage.setItem('so7ob-appearance-mode', value), mode);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const ready = new VisualReadiness(page);
    const folder = `.migration/adminlte-176/after/${locale}-${mode}-${info.project.name}`;
    mkdirSync(folder, { recursive: true });
    for (const route of ['admin', 'admin/users', 'admin/settings?section=appearance']) {
      await page.goto(`/${locale}/${route}`);
      await ready.wait();
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('html')).toHaveAttribute('data-color-mode', mode);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await documentAudit(page, true)).violations).toEqual([]);
      await page.screenshot({ path: `${folder}/${route.replaceAll('/', '-').replace('?', '-')}.png`, fullPage: true });
    }
    const preview = page.frameLocator('iframe');
    await expect(preview.locator('[data-slot="panel-header"]')).toBeVisible();
    await expect(preview.locator('[data-slot="input"]')).toHaveCount(2);
    await expect(preview.locator('[data-slot="button"][aria-busy="true"]')).toBeDisabled();
    // Draft-only density changes update real controls, without a settings write.
    await page.locator('#appearance-density').selectOption('compact');
    await expect(preview.locator('[data-slot="input"]').first()).toHaveCSS('padding-top', '6px');
    expect((await preview.locator('[data-slot="input"]').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const isolated = await page.context().newPage();
    await isolated.goto(new URL('/api/health/ready', page.url()).href);
    await isolated.setContent((await page.locator('iframe').getAttribute('srcdoc'))!);
    await isolated.evaluate(() => document.fonts.ready);
    expect((await documentAudit(isolated)).violations).toEqual([]);
    await isolated.close();
    await page.screenshot({path: `${folder}/appearance-compact-draft.png`, fullPage:true});
    const title = page.getByRole('button', { name: locale === 'ar' ? 'تبديل الشريط الجانبي' : 'Toggle sidebar' });
    if (info.project.name === 'desktop') {
      await title.focus();
      await page.keyboard.press('Enter');
      await expect(title).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#admin-desktop-sidebar')).toBeHidden();
      await expect(title).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#admin-desktop-sidebar')).toBeVisible();
    } else {
      const toggle = page.locator('header [data-slot="sheet-trigger"]');
      await toggle.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(toggle).toBeFocused();
    }
    expect(errors).toEqual([]);
  });
}
