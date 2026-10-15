import { expect, type Page } from '@playwright/test';
import { test, differentPhone } from './admin-configuration-fixture';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { getPortalContent } from '../../apps/web/src/content/portal';

async function saveSettings(page: Page, locale: 'ar' | 'en') {
  const save = page.getByRole('button', { name: getPortalContent(locale).admin.settings.save, exact: true });
  const response = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith('/api/v1/admin/settings/checked'));
  await save.click();
  expect((await response).status()).toBe(200);
  // Disabled also means "saving". Require the clean state AND an idle control.
  await expect(page.getByRole('status').filter({ hasText: locale === 'ar' ? 'كل التعديلات محفوظة' : 'All changes saved' })).toBeVisible();
  await expect(page.getByRole('button', { name: locale === 'ar' ? 'استعادة الافتراضي' : 'Restore defaults', exact: true })).toBeEnabled();
  await expect(save).toBeDisabled();
}

async function openSection(page: Page, section: 'announcement' | 'contact') {
  const link = page.locator(`nav[aria-label] a[href="?section=${section}"]`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`\\?section=${section}$`));
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(page.locator(section === 'contact' ? '#contact-phone' : '#announcement-message-ar')).toBeVisible();
}

for (const locale of ['ar', 'en'] as const) test(`${locale}: administrator saves menu labels and announcement settings, observes public HTML and audit`, async ({ page, configuration }, info) => {
  const { original, db, prefix } = configuration, t = getPortalContent(locale);
  const marker = 'Synthetic ' + locale + ' ' + info.project.name;
  const phone = differentPhone(original['contact.phone']);
  await page.goto('/' + locale + '/admin/settings?section=contact', { waitUntil: 'networkidle' });
  await page.locator('#contact-phone').focus(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(phone);
  await saveSettings(page, locale);
  await openSection(page, 'announcement');
  await page.locator('#announcement-message-ar').fill(marker + ' عربي'); await page.locator('#announcement-message-en').fill(marker + ' English');
  if (!(await page.locator('#announcement-enabled').isChecked())) await page.locator('#announcement-enabled').click();
  await saveSettings(page, locale);
  await page.reload({ waitUntil: 'networkidle' }); await openSection(page, 'contact'); await expect(page.locator('#contact-phone')).toHaveValue(phone);
  expect((await db.query("SELECT value FROM SiteSetting WHERE `key`='announcement.messageAr'"))[0].value).toBe(marker + ' عربي');
  expect(await (await page.request.get('/' + locale)).text()).toContain(marker + (locale === 'ar' ? ' عربي' : ' English'));
  await page.goto('/' + locale + '/admin/menus', { waitUntil: 'networkidle' });
  await page.locator('#label-ar-0').fill(marker + ' قائمة'); await page.locator('#label-en-0').fill(marker + ' Menu');
  const menuSaved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith('/api/v1/admin/menus/checked'));
  await page.getByRole('button', { name: t.admin.menus.save, exact: true }).click(); expect((await menuSaved).status()).toBe(200);
  await page.reload({ waitUntil: 'networkidle' }); await expect(page.locator('#label-en-0')).toHaveValue(marker + ' Menu');
  expect(await (await page.request.get('/' + locale)).text()).toContain(marker + (locale === 'ar' ? ' قائمة' : ' Menu'));
  expect((await db.query('SELECT id FROM AuditLog WHERE actorId=?', [prefix + 'admin'])).length).toBeGreaterThan(1);
});

for (const locale of ['ar', 'en'] as const) test(`${locale}: delayed settings response keeps the save journey on contact until completion`, async ({ page, configuration }) => {
  // Model an interrupted predecessor that left the old fixed fixture value behind.
  expect((await configuration.request.patch('/api/admin/settings', { headers: configuration.headers, data: { 'contact.phone': '+967 123456789' } })).status()).toBe(200);
  const current = (await (await configuration.request.get('/api/admin/settings')).json()).settings['contact.phone'];
  const phone = differentPhone(current);
  expect(phone).not.toBe(current);
  await page.goto('/' + locale + '/admin/settings?section=contact', { waitUntil: 'networkidle' });
  await page.locator('#contact-phone').fill(phone);
  let release!: () => void, committed!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const intercepted = new Promise<void>(resolve => { committed = resolve; });
  await page.route('**/api/v1/admin/settings/checked', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200); committed();
    await held; await route.fulfill({ response });
  }, { times: 1 });
  // Observe attempted navigation too: the product deliberately ignores it while saving.
  await page.locator('nav[aria-label] a[href="?section=announcement"]').evaluate(link => {
    link.addEventListener('click', () => link.setAttribute('data-save-test-clicked', 'true'));
  });
  const journey = (async () => { await saveSettings(page, locale); await openSection(page, 'announcement'); })();
  // Attach a handler immediately so an assertion failure cannot become unhandled.
  void journey.catch(() => {});
  try {
    await intercepted;
    await expect(page.getByRole('button', { name: getPortalContent(locale).admin.settings.save, exact: true })).toBeDisabled();
    await expect(page.locator('#contact-phone')).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: locale === 'ar' ? 'أقسام غير محفوظة' : 'unsaved sections' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/settings\\?section=contact$`));
    await expect(page.locator('nav[aria-label] a[href="?section=announcement"]')).not.toHaveAttribute('data-save-test-clicked', 'true');
  } finally {
    release(); await journey;
  }
  await page.reload({ waitUntil: 'networkidle' }); await openSection(page, 'contact');
  await expect(page.locator('#contact-phone')).toHaveValue(phone);
});

test('configuration teardown restores settings and exact menu rows after a body timeout before the next case', async ({ configuration }, info) => {
  const directory = mkdtempSync(join(tmpdir(), 'so7ob-configuration-timeout-'));
  const snapshot = join(directory, 'snapshot.json'), report = join(directory, 'report.json');
  writeFileSync(snapshot, JSON.stringify({ settings: configuration.original, menus: configuration.menuSnapshot }));
  try {
    const run = await promisify(execFile)(process.execPath, [createRequire(import.meta.url).resolve('@playwright/test/cli'), 'test', '--config=tests/e2e/support/admin-configuration-timeout.config.ts'], {
      env: { ...process.env, SO7OB_CONFIGURATION_SNAPSHOT: snapshot, SO7OB_CONFIGURATION_REPORT: report, SO7OB_CONFIGURATION_PROJECT: info.project.name, SO7OB_CONFIGURATION_OUTPUT: join(directory, 'output') },
      timeout: info.timeout,
    }).then(output => ({ code: 0, output: output.stdout + output.stderr }), error => ({ code: error.code, output: (error.stdout ?? '') + (error.stderr ?? '') }));
    await info.attach('timeout-runner-output', { body: run.output, contentType: 'text/plain' });
    expect(run.code).toBe(1);
    const result = JSON.parse(readFileSync(report, 'utf8'));
    await info.attach('timeout-restoration-report', { body: readFileSync(report), contentType: 'application/json' });
    expect(result.errors).toEqual([]);
    const cases = result.suites.flatMap((suite: { specs: Array<{ tests: Array<{ results: Array<{ status: string; errors: Array<{ message: string }> }> }> }> }) => suite.specs.flatMap(spec => spec.tests.flatMap(test => test.results)));
    expect(cases.map((result: { status: string }) => result.status)).toEqual(['timedOut', 'passed']);
    expect(cases[0].errors).toHaveLength(1);
    expect(cases[0].errors[0].message).toContain('Test timeout of 1ms exceeded');
    expect(cases[1].errors).toEqual([]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
