import { expect } from '@playwright/test';
import { test } from './quota-fixture';
import { readFileSync, mkdirSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
import { getPortalContent } from '../../apps/web/src/content/portal';
import { documentAudit, VisualReadiness } from './visual-checks';
import { ADMIN_APPEARANCE_DEFAULTS, appearanceForScope, ADMINLTE_THEME_PRESETS, adminltePresetSettings, appearanceTokens } from '@so7ob/contracts';

// A reference/default profile must be measurable, while the saved legacy
// geometry remains an explicit supported customization rather than a DB reset.
for (const locale of ['ar', 'en'] as const) for (const mode of ['light', 'dark'] as const) {
  test(`${locale}/${mode}: pinned AdminLTE geometry, preview portals and navigation`, async ({ page }, info) => {
    test.setTimeout(90000);
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    await page.addInitScript(value => localStorage.setItem('so7ob-admin-appearance-mode', value), mode);
    const db = await createDataSource().initialize();
    const saved = await db.query("SELECT * FROM SiteSetting WHERE `key` LIKE 'adminAppearance.%'");
    const folder = `.migration/design-system/screenshots/adminlte-180/${locale}-${mode}-${info.project.name}`;
    mkdirSync(folder, { recursive: true });
    const mutations: string[] = [];
    try {
      expect((await page.request.patch('/api/admin/settings', { headers: { 'x-csrf-token': csrfToken }, data: ADMIN_APPEARANCE_DEFAULTS })).status()).toBe(200);
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
      await expect(page.locator('.ds-small-box[data-tone="primary"]')).toHaveCSS('background-color', 'rgb(13, 110, 253)');
      await expect(page.locator('.ds-small-box[data-tone="primary"]')).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(page.locator('.ds-info-icon').first()).toHaveCSS('width', '70px');
      expect((await documentAudit(page, true)).violations).toEqual([]);
      await page.screenshot({ path: `${folder}/dashboard.png`, fullPage: true });
      await page.goto(`/${locale}/admin/settings?section=adminAppearance`);
      await ready.wait();
      const preview = page.frameLocator('iframe');
      await page.getByRole('combobox', { name: locale === 'ar' ? 'وضع المعاينة' : 'Preview color mode', exact: true }).selectOption(mode);
      await expect(preview.locator('html')).toHaveAttribute('data-color-mode', mode);
      await expect(preview.locator('[data-slot="panel"]').first()).toHaveCSS('border-radius', '6px');
      page.on('request', request => { if (['POST','PATCH','DELETE'].includes(request.method())) mutations.push(new URL(request.url()).pathname); });
      const search = preview.getByRole('button', { name: locale === 'ar' ? 'بحث' : 'Search', exact: true });
      await expect(search).toHaveCSS('font-size', '16px');
      await expect(search).toHaveCSS('border-radius', '6px');
      await search.hover();
      const tooltip = preview.locator('[data-slot="tooltip-content"]');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveCSS('background-color', mode === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
      await expect(tooltip).toHaveCSS('color', mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(33, 37, 41)');
      await expect(tooltip).toHaveCSS('font-size', '14px');
      await expect(tooltip).toHaveCSS('border-radius', '6px');
      await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0);
      await page.mouse.move(0, 0);
      await expect(tooltip).toBeHidden();
      await search.click();
      const dialog = preview.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(dialog).toHaveCSS('background-color', mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(33, 37, 41)');
      const close = preview.locator('[data-slot="dialog-close"]');
      await close.focus();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(search).toBeFocused();
      await search.click();
      await preview.locator('[data-slot="dialog-close"]').click();
      await expect(dialog).toBeHidden();
      await expect(search).toBeFocused();
      await preview.getByRole('button', { name: locale === 'ar' ? 'حفظ' : 'Save', exact: true }).click();
      await expect(preview.getByRole('status')).toBeVisible();
      await preview.getByRole('button', { name: locale === 'ar' ? 'إلغاء' : 'Cancel', exact: true }).click();
      await expect(preview.getByRole('status')).toHaveCount(0);
      await page.locator('#admin-appearance-radius').selectOption('soft');
      await expect(preview.locator('[data-slot="panel"]').first()).toHaveCSS('border-radius', '12px');
      await expect(search).toHaveCSS('border-radius', '12px');
      expect(mutations).toEqual([]);
      await page.screenshot({ path: `${folder}/adminAppearance.png`, fullPage: true });
      // The exact sidebar transition is 992px in the pinned source.
      for (const width of [991, 992]) {
        await page.setViewportSize({ width, height: 900 });
        if (width === 991) await expect(page.locator('#admin-desktop-sidebar')).toBeHidden();
        else await expect(page.locator('#admin-desktop-sidebar')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      ready.dispose();
    } finally {
      await db.query("DELETE FROM SiteSetting WHERE `key` LIKE 'adminAppearance.%'");
      for (const row of saved) await db.query('INSERT INTO SiteSetting (`key`,value,updatedById,updatedAt) VALUES(?,?,?,?)', [row.key,row.value,row.updatedById,row.updatedAt]);
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
    await page.addInitScript(value => localStorage.setItem('so7ob-admin-appearance-mode', value), mode);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const ready = new VisualReadiness(page);
    const folder = `.migration/adminlte-176/after/${locale}-${mode}-${info.project.name}`;
    mkdirSync(folder, { recursive: true });
    for (const route of ['admin', 'admin/users', 'admin/settings?section=adminAppearance']) {
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
    await page.locator('#admin-appearance-density').selectOption('compact');
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
    await expect(page.locator('#admin-appearance-density')).toHaveValue('compact');
    expect(errors).toEqual([]);
  });
}

for (const locale of ['ar', 'en'] as const) for (const mode of ['light', 'dark'] as const) {
  test(`${locale}/${mode}: AdminLTE coordinated profiles persist without resetting appearance`, async ({ page }, info) => {
    test.setTimeout(120000);
    const {prefix,password} = JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
    const {csrfToken} = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
    await page.addInitScript(value => localStorage.setItem('so7ob-admin-appearance-mode',value),mode);
    const db = await createDataSource().initialize();
    const key = 'adminAppearance.adminStyle';
    const saved = await db.query("SELECT * FROM SiteSetting WHERE `key` LIKE 'adminAppearance.%'");
    const folder = `.migration/adminlte-176/profiles/${locale}-${mode}-${info.project.name}`;
    mkdirSync(folder,{recursive:true});
    try {
      for (const profile of ['light','semi-dark','dark','colored']) {
        expect((await page.request.patch('/api/admin/settings',{headers:{'x-csrf-token':csrfToken},data:{[key]:profile}})).status()).toBe(200);
        await page.goto(`/${locale}/admin/settings?section=adminAppearance`);
        await new VisualReadiness(page).wait();
        await expect(page.locator('#admin-shell')).toHaveAttribute('data-admin-style',profile);
        await expect(page.locator('#admin-appearance-admin-style')).toHaveValue(profile);
        await expect(page.locator('html')).toHaveAttribute('data-color-mode',mode);
        expect(await page.evaluate(() => localStorage.getItem('so7ob-admin-appearance-mode'))).toBe(mode);
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
        await page.locator('#admin-appearance-admin-style').selectOption(profile === 'dark' ? 'light' : 'dark');
        await page.locator('#admin-appearance-admin-style').selectOption(profile);
        const expectedMode = profile === 'dark' ? 'dark' : 'light';
        await expect(page.locator('#admin-appearance-mode')).toHaveValue(expectedMode);
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
        await expect(page.locator('#admin-appearance-admin-style')).toHaveValue(profile);
        await expect(page.locator('#admin-appearance-mode')).toHaveValue(expectedMode);
        await expect(page.locator('html')).toHaveAttribute('data-color-mode',mode);
      }
    } finally {
      await db.query("DELETE FROM SiteSetting WHERE `key` LIKE 'adminAppearance.%'");
      for (const row of saved) {
        const keys = Object.keys(row);
        await db.query('INSERT INTO SiteSetting ('+keys.map(k=>'`'+k+'`').join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',keys.map(k=>row[k]));
      }
      await db.destroy();
    }
  });
}

// Exercise every pinned preset through the real draft controls, including both
// optional palette families, then verify persistence and an independent revert.
for (const locale of ['ar', 'en'] as const) for (const mode of ['light', 'dark'] as const) {
  test(`${locale}/${mode}: all 29 AdminLTE theme presets preview and save`, async ({ page }, info) => {
    test.setTimeout(180000);
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    await page.addInitScript(value => localStorage.setItem('so7ob-admin-appearance-mode', value), mode);
    const db = await createDataSource().initialize();
    const saved = await db.query("SELECT * FROM SiteSetting WHERE `key` LIKE 'adminAppearance.%'");
    const mutations: string[] = [];
    const folder = `.migration/design-system/screenshots/adminlte-180/${locale}-${mode}-${info.project.name}/themes`;
    mkdirSync(folder, {recursive:true});
    const ready = new VisualReadiness(page);
    const rgb = (hex: string) => `rgb(${[1,3,5].map(i => parseInt(hex.slice(i,i+2),16)).join(', ')})`;
    try {
      expect((await page.request.patch('/api/admin/settings', { headers: {'x-csrf-token':csrfToken}, data: ADMIN_APPEARANCE_DEFAULTS })).status()).toBe(200);
      await page.goto(`/${locale}/admin/settings?section=adminAppearance`); await ready.wait();
      page.on('request', request => { if (['POST','PATCH','DELETE'].includes(request.method())) mutations.push(new URL(request.url()).pathname); });
      await page.getByRole('combobox', { name: locale === 'ar' ? 'وضع المعاينة' : 'Preview color mode', exact:true }).selectOption(mode);
      const sample = page.frameLocator('iframe');
      for (const family of ['designed','v3']) {
        await page.getByRole('button', {name: family === 'designed' ? locale === 'ar' ? 'الألوان المصمّمة لـ AdminLTE 4' : 'AdminLTE 4 designed palette' : locale === 'ar' ? 'ألوان AdminLTE 3 الأصلية' : 'AdminLTE 3 originals', exact:true}).click();
        for (const preset of ADMINLTE_THEME_PRESETS.filter(item => item.family === family)) {
          await page.locator(`[data-theme-preset="${preset.id}"]`).click();
          const expected = appearanceTokens({...appearanceForScope(ADMIN_APPEARANCE_DEFAULTS, "admin"), ...adminltePresetSettings(preset)}, mode);
          await expect(sample.locator('.admin-topbar')).toHaveCSS('background-color', rgb(expected['admin-header']));
          await expect(sample.locator('.admin-sidebar')).toHaveCSS('background-color', rgb(expected['admin-sidebar']));
          await expect(sample.locator('.admin-footer')).toHaveCSS('background-color', rgb(expected['admin-footer']));
          await expect(page.locator('html')).toHaveAttribute('data-color-mode',mode);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), preset.id).toBe(true);
          expect(await sample.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth), preset.id).toBe(true);
          await page.locator('iframe').screenshot({path:`${folder}/${preset.id}.png`});
        }
      }
      expect(mutations).toEqual([]);
      // Independent footer backgrounds, including the brightest original color.
      await page.locator('#theme-footer-background').selectOption('v3:lime');
      await expect(sample.locator('.admin-footer')).toHaveCSS('background-color','rgb(1, 255, 112)');
      await expect(sample.locator('.admin-footer')).toHaveCSS('color','rgb(0, 0, 0)');
      const isolated = await page.context().newPage();
      try {
        await isolated.goto(new URL('/api/health/ready',page.url()).href);
        await isolated.setContent(await page.locator('iframe').evaluate((frame:HTMLIFrameElement) => frame.contentDocument!.documentElement.outerHTML));
        await isolated.evaluate(() => document.fonts.ready);
        expect((await documentAudit(isolated)).violations).toEqual([]);
      } finally { await isolated.close(); }
      const save = page.getByRole('button',{name:getPortalContent(locale).admin.settings.save,exact:true});
      const response = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith('/settings/checked'));
      await save.click(); const result = await response; expect(result.status()).toBe(200); expect((await result.json()).settings['adminAppearance.footerBackground']).toBe('v3:lime'); await expect(save).toBeDisabled();
      await page.reload(); await ready.wait();
      await expect(page.locator('#theme-footer-background')).toHaveValue('v3:lime');
      const accountMenu = page.getByRole('button',{name:locale === 'ar' ? 'قائمة الحساب' : 'Account menu',exact:true});
      await accountMenu.click();
      await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCSS('background-color','rgb(255, 255, 255)');
      await page.keyboard.press('Escape');await expect(accountMenu).toBeFocused();
      expect((await page.request.patch('/api/admin/settings',{headers:{'x-csrf-token':csrfToken},data:{'adminAppearance.headerMode':'dark'}})).status()).toBe(200);
      await page.reload();await ready.wait();
      await accountMenu.click();
      await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCSS('background-color','rgb(33, 37, 41)');
      expect((await documentAudit(page,true)).violations).toEqual([]);
      await page.keyboard.press('Escape');await expect(accountMenu).toBeFocused();
      await page.locator('#theme-footer-background').selectOption('designed:indigo:gradient');
      page.once('dialog', dialog => dialog.dismiss());
      await page.getByRole('button',{name:locale === 'ar' ? 'التراجع' : 'Revert',exact:true}).click();
      await expect(page.locator('#theme-footer-background')).toHaveValue('designed:indigo:gradient');
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button',{name:locale === 'ar' ? 'التراجع' : 'Revert',exact:true}).click();
      await expect(page.locator('#theme-footer-background')).toHaveValue('v3:lime');
      await expect(save).toBeDisabled();
      expect((await documentAudit(page,true)).violations).toEqual([]);
      await page.screenshot({path:`${folder}/saved.png`,fullPage:true});
    } finally {
      ready.dispose();
      await db.query("DELETE FROM SiteSetting WHERE `key` LIKE 'adminAppearance.%'");
      for (const row of saved) {
        const keys = Object.keys(row);
        await db.query('INSERT INTO SiteSetting ('+keys.map(key=>'`'+key+'`').join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',keys.map(key=>row[key]));
      }
      await db.destroy();
    }
  });
}

// This cross-mode journey belongs to each locale's light CI cell. It switches
// both scopes through personal light/dark/system choices within the same case.
for (const locale of ['ar','en'] as const) test(`${locale}/light: administration and visitor themes have independent drafts, persistence and mode preferences`, async ({page}, info) => {
  test.setTimeout(120000);
  const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
  const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
  expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
  const headers={'x-csrf-token':csrfToken},db=await createDataSource().initialize();
  const saved=await db.query("SELECT * FROM SiteSetting WHERE `key` LIKE 'appearance.%' OR `key` LIKE 'adminAppearance.%'");
  const ready=new VisualReadiness(page), publicPage=await page.context().newPage();
  const folder=`.migration/design-system/screenshots/adminlte-180/${locale}-${info.project.name}`;
  mkdirSync(folder,{recursive:true});
  try {
    expect((await page.request.patch('/api/admin/settings',{headers,data:{...ADMIN_APPEARANCE_DEFAULTS,'appearance.mode':'dark','appearance.primaryLight':'#0f766e','appearance.fontEn':'inter','adminAppearance.primaryLight':'#c84e10'}})).status()).toBe(200);
    await page.addInitScript(()=>{
      if(!localStorage.getItem('so7ob-admin-appearance-mode'))localStorage.setItem('so7ob-admin-appearance-mode','dark');
      if(!localStorage.getItem('so7ob-appearance-mode'))localStorage.setItem('so7ob-appearance-mode','light');
    });
    await page.goto(`/${locale}/admin/settings?section=adminAppearance`); await ready.wait();
    await expect(page.locator('html')).toHaveAttribute('data-theme-scope','admin');
    await expect(page.locator('html')).toHaveAttribute('data-color-mode','dark');
    await page.locator('a[href="?section=appearance"]').click();
    await page.locator('#appearance-primary-light').fill('#9553db');
    await page.locator('a[href="?section=adminAppearance"]').click();
    await page.locator('#admin-appearance-primary-light').fill('#12827d');
    const response=page.waitForResponse(response=>response.request().method()==='PATCH'&&response.url().endsWith('/settings/checked'));
    await page.getByRole('button',{name:getPortalContent(locale).admin.settings.save,exact:true}).click();
    const result=await response;expect(result.status()).toBe(200);
    expect(Object.keys((await result.json()).settings)).toEqual(['adminAppearance.primaryLight']);
    await page.locator('a[href="?section=appearance"]').click();
    await expect(page.locator('#appearance-primary-light')).toHaveValue('#9553db');
    const current=(await(await page.request.get('/api/admin/settings')).json()).settings;
    expect(current['appearance.primaryLight']).toBe('#0f766e');expect(current['adminAppearance.primaryLight']).toBe('#12827d');
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:locale==='ar'?'التراجع':'Revert',exact:true}).click();
    const toggle=page.getByRole('combobox',{name:locale==='ar'?'وضع العرض':'Color mode',exact:true}).filter({visible:true});
    await toggle.selectOption('light');
    await publicPage.goto(`/${locale}`,{waitUntil:'networkidle'});
    await expect(publicPage.locator('html')).toHaveAttribute('data-theme-scope','site');
    await expect(publicPage.locator('html')).toHaveAttribute('data-color-mode','light');
    await publicPage.getByRole('combobox',{name:locale==='ar'?'وضع العرض':'Color mode',exact:true}).filter({visible:true}).selectOption('dark');
    await expect(publicPage.locator('html')).toHaveAttribute('data-color-mode','dark');
    await expect(page.locator('html')).toHaveAttribute('data-color-mode','light');
    await page.reload(); await ready.wait();
    await expect(page.locator('html')).toHaveAttribute('data-color-mode','light');
    expect(await page.evaluate(()=>({site:localStorage.getItem('so7ob-appearance-mode'),admin:localStorage.getItem('so7ob-admin-appearance-mode')}))).toEqual({site:'dark',admin:'light'});
    await toggle.selectOption('system');
    await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-color-mode','dark');
    await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-color-mode','light');
    await expect(publicPage.locator('html')).toHaveAttribute('data-color-mode','dark');
    expect((await page.request.patch('/api/admin/settings',{headers,data:{'adminAppearance.headerBackground':'url(untrusted)','adminAppearance.mode':'light'}})).status()).toBe(400);
    expect((await documentAudit(page,true)).violations).toEqual([]);
    await page.screenshot({path:`${folder}/independent-admin.png`,fullPage:true});
    await publicPage.screenshot({path:`${folder}/independent-site.png`,fullPage:true});
  } finally {
    ready.dispose();await publicPage.close();
    await db.query("DELETE FROM SiteSetting WHERE `key` LIKE 'appearance.%' OR `key` LIKE 'adminAppearance.%'");
    for(const row of saved){const keys=Object.keys(row);await db.query('INSERT INTO SiteSetting ('+keys.map(key=>'`'+key+'`').join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',keys.map(key=>row[key]));}
    await db.destroy();
  }
});
