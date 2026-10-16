import { expect } from '@playwright/test';
import { test } from './quota-fixture';
import { readFileSync, mkdirSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
import { getPortalContent } from '../../apps/web/src/content/portal';
import { documentAudit, VisualReadiness } from './visual-checks';
import { APPEARANCE_DEFAULTS } from '@so7ob/contracts';

// A reference/default profile must be measurable, while the saved legacy
// geometry remains an explicit supported customization rather than a DB reset.
for (const locale of ['ar', 'en'] as const) for (const mode of ['light', 'dark'] as const) {
  test(`${locale}/${mode}: pinned AdminLTE geometry, preview portals and navigation`, async ({ page }, info) => {
    test.setTimeout(90000);
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    await page.addInitScript(value => localStorage.setItem('so7ob-appearance-mode', value), mode);
    const db = await createDataSource().initialize();
    const saved = await db.query("SELECT * FROM SiteSetting WHERE `key` LIKE 'appearance.%'");
    const folder = `.migration/design-system/screenshots/adminlte-180/${locale}-${mode}-${info.project.name}`;
    mkdirSync(folder, { recursive: true });
    const mutations: string[] = [];
    try {
      expect((await page.request.patch('/api/admin/settings', { headers: { 'x-csrf-token': csrfToken }, data: APPEARANCE_DEFAULTS })).status()).toBe(200);
      await page.goto(`/${locale}/admin`);
      const ready = new VisualReadiness(page);
      await ready.wait();
      if (info.project.name === 'desktop') {
        await expect(page.locator('#admin-desktop-sidebar')).toHaveCSS('width', '250px');
        const tree = page.getByRole('button', { name: locale === 'ar' ? 'أقسام الهوية' : 'Identity sections' });
        await tree.focus(); await page.keyboard.press('Enter');
        await expect(tree).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#desktop-identity-tree')).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(page.locator('#desktop-identity-tree')).toBeHidden();
      }
      await expect(page.locator('.admin-topbar')).toHaveCSS('height', '57px');
      await expect(page.locator('.ds-info-icon').first()).toHaveCSS('width', '70px');
      expect((await documentAudit(page, true)).violations).toEqual([]);
      await page.screenshot({ path: `${folder}/dashboard.png`, fullPage: true });
      await page.goto(`/${locale}/admin/settings?section=appearance`);
      await ready.wait();
      const preview = page.frameLocator('iframe');
      await expect(preview.locator('[data-slot="panel"]').first()).toHaveCSS('border-radius', '6px');
      page.on('request', request => { if (['POST','PATCH','DELETE'].includes(request.method())) mutations.push(new URL(request.url()).pathname); });
      const search = preview.getByRole('button', { name: locale === 'ar' ? 'بحث' : 'Search', exact: true });
      await search.click();
      const dialog = preview.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(dialog).toHaveCSS('background-color', mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(33, 37, 41)');
      await preview.locator('[data-slot="dialog-close"]').click();
      await expect(dialog).toBeHidden();
      await expect(search).toBeFocused();
      await preview.getByRole('button', { name: locale === 'ar' ? 'حفظ' : 'Save', exact: true }).click();
      await expect(preview.getByRole('status')).toBeVisible();
      await preview.getByRole('button', { name: locale === 'ar' ? 'إلغاء' : 'Cancel', exact: true }).click();
      await expect(preview.getByRole('status')).toHaveCount(0);
      await page.locator('#appearance-radius').selectOption('soft');
      await expect(preview.locator('[data-slot="panel"]').first()).toHaveCSS('border-radius', '12px');
      expect(mutations).toEqual([]);
      await page.screenshot({ path: `${folder}/appearance.png`, fullPage: true });
      // The exact sidebar transition is 992px in the pinned source.
      for (const width of [991, 992]) {
        await page.setViewportSize({ width, height: 900 });
        if (width === 991) await expect(page.locator('#admin-desktop-sidebar')).toBeHidden();
        else await expect(page.locator('#admin-desktop-sidebar')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      ready.dispose();
    } finally {
      await db.query("DELETE FROM SiteSetting WHERE `key` LIKE 'appearance.%'");
      for (const row of saved) await db.query('INSERT INTO SiteSetting (`key`,value,revision,updatedAt) VALUES(?,?,?,?)', [row.key,row.value,row.revision,row.updatedAt]);
      await db.destroy();
    }
  });
}

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
    await isolated.setContent(await page.locator('iframe').evaluate((element: HTMLIFrameElement) => element.contentDocument!.documentElement.outerHTML));
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
      await expect(title).not.toHaveCSS('box-shadow', 'none');
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
    await expect(page.locator('#appearance-density')).toHaveValue('compact');
    expect(errors).toEqual([]);
  });
}

for (const locale of ['ar', 'en'] as const) for (const mode of ['light', 'dark'] as const) {
  test(`${locale}/${mode}: AdminLTE coordinated profiles persist without resetting appearance`, async ({ page }, info) => {
    test.setTimeout(120000);
    const {prefix,password} = JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
    const {csrfToken} = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
    await page.addInitScript(value => localStorage.setItem('so7ob-appearance-mode',value),mode);
    const db = await createDataSource().initialize();
    const key = 'appearance.adminStyle';
    const saved = await db.query("SELECT * FROM SiteSetting WHERE `key` LIKE 'appearance.%'");
    const folder = `.migration/adminlte-176/profiles/${locale}-${mode}-${info.project.name}`;
    mkdirSync(folder,{recursive:true});
    try {
      for (const profile of ['light','semi-dark','dark','colored']) {
        expect((await page.request.patch('/api/admin/settings',{headers:{'x-csrf-token':csrfToken},data:{[key]:profile}})).status()).toBe(200);
        await page.goto(`/${locale}/admin/settings?section=appearance`);
        await new VisualReadiness(page).wait();
        await expect(page.locator('#admin-shell')).toHaveAttribute('data-admin-style',profile);
        await expect(page.locator('#appearance-admin-style')).toHaveValue(profile);
        await expect(page.locator('html')).toHaveAttribute('data-color-mode',mode);
        expect(await page.evaluate(() => localStorage.getItem('so7ob-appearance-mode'))).toBe(mode);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await documentAudit(page,true)).violations).toEqual([]);
        if (profile === 'colored') {
          // Exercise actual topbar interaction states, including nested search text/icons.
          const search = page.locator('.admin-topbar button[aria-keyshortcuts]:visible');
          await page.keyboard.press('Shift');
          await search.focus();
          await expect(search).toBeFocused();
          expect(await search.evaluate(button => button.matches(':focus-visible'))).toBe(true);
          await expect(search).not.toHaveCSS('box-shadow', 'none');
          expect((await documentAudit(page,true)).violations).toEqual([]);
          await search.hover();
          await expect.poll(() => search.evaluate(button => {
            const foreground = getComputedStyle(button).color;
            return [...button.querySelectorAll('svg, span:not([aria-hidden])')]
              .every(child => getComputedStyle(child).color === foreground);
          })).toBe(true);
          expect((await documentAudit(page,true)).violations).toEqual([]);
          await page.screenshot({path:`${folder}/colored-search-hover-focus.png`,fullPage:false});
          for (const control of await page.locator('.admin-topbar [data-slot="button"]:visible').all()) {
            await control.hover();
            await control.evaluate(async element => {
              await Promise.all(element.getAnimations().map(animation => animation.finished));
            });
            expect((await documentAudit(page,true)).violations).toEqual([]);
          }
          await page.mouse.move(0,0);
          await search.blur();
        }
        if (info.project.name === 'mobile') {
          await page.locator('header [data-slot="sheet-trigger"]').click();
          expect((await documentAudit(page,true)).violations).toEqual([]);
          await page.screenshot({path:`${folder}/${profile}-navigation.png`,fullPage:false});
          await page.keyboard.press('Escape');
        }
        await page.locator('#appearance-admin-style').selectOption(profile === 'dark' ? 'light' : 'dark');
        await page.locator('#appearance-admin-style').selectOption(profile);
        const expectedMode = profile === 'dark' ? 'dark' : 'light';
        await expect(page.locator('#appearance-mode')).toHaveValue(expectedMode);
        const sample = page.frameLocator('iframe');
        await expect(sample.locator('.admin-lte')).toHaveAttribute('data-admin-style',profile);
        await expect(sample.locator('html')).toHaveAttribute('data-color-mode',expectedMode);
        const isolated = await page.context().newPage();
        await isolated.goto(new URL('/api/health/ready',page.url()).href);
        await isolated.setContent(await page.locator('iframe').evaluate((element:HTMLIFrameElement)=>element.contentDocument!.documentElement.outerHTML));
        expect((await documentAudit(isolated)).violations).toEqual([]);
        await isolated.close();
        await page.screenshot({path:`${folder}/${profile}.png`,fullPage:true});
        const save = page.getByRole('button',{name:getPortalContent(locale).admin.settings.save,exact:true});
        if (await save.isEnabled()) {
          const response = page.waitForResponse(response=>response.request().method()==='PATCH' && response.url().endsWith('/settings/checked'));
          await save.click();
          expect((await response).status()).toBe(200);
          await expect(save).toBeDisabled();
        }
        await page.reload();
        await expect(page.locator('#appearance-admin-style')).toHaveValue(profile);
        await expect(page.locator('#appearance-mode')).toHaveValue(expectedMode);
        await expect(page.locator('html')).toHaveAttribute('data-color-mode',mode);
      }
    } finally {
      await db.query("DELETE FROM SiteSetting WHERE `key` LIKE 'appearance.%'");
      for (const row of saved) {
        const keys = Object.keys(row);
        await db.query('INSERT INTO SiteSetting ('+keys.map(k=>'`'+k+'`').join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',keys.map(k=>row[k]));
      }
      await db.destroy();
    }
  });
}
