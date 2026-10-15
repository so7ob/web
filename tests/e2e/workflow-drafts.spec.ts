import { expect } from '@playwright/test';
import { test as base } from './quota-fixture';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
import { ar } from '../../apps/web/src/content/ar';
import { en } from '../../apps/web/src/content/en';
import { legacyWorkflow } from '@so7ob/contracts';
const test = base.extend<{ flows: { one: string; two: string; headers: Record<string, string> } }>({
 flows: async ({ page }, use) => {
  const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
  const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
  expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
  const headers = { 'x-csrf-token': csrfToken }, ids: string[] = [];
  const db = await createDataSource().initialize();
  try {
   for (const label of ['one', 'two']) {
    const response = await page.request.post('/api/admin/workflows/drafts', { headers, data: { payload: { definition: { ...legacyWorkflow('requests'), nameAr: 'مسار اصطناعي ' + label, nameEn: 'Synthetic workflow ' + label } } } });
    expect(response.status()).toBe(201); ids.push((await response.json()).id);
   }
   await use({ one: ids[0], two: ids[1], headers });
  } finally {
   for (const id of ids) await db.query('DELETE FROM Workflow WHERE id=?', [id]);
   await db.destroy();
  }
 },
});
test.use({ trace: 'off', screenshot: 'off', contextOptions: { reducedMotion: 'reduce' } });
for (const locale of ['ar', 'en'] as const) {
 const t = (ar: string, en: string) => locale === 'ar' ? ar : en;
 const flowLabel = t('المسار', 'Workflow'), nameLabel = t('اسم المسار بالإنجليزية', 'Workflow English name');
 const dialogName = t('تعديلات مسار غير محفوظة', 'Unsaved workflow changes');
 const stayLabel = t('البقاء', 'Stay'), discardLabel = t('تجاهل التعديلات والمتابعة', 'Discard changes and continue'), saveLabel = t('حفظ المسودة والمتابعة', 'Save draft and continue');
 test(`${locale}: workflow selection requires save, discard or stay and supports keyboard and accessibility`, async ({ page, flows }) => {
  await page.goto(`/${locale}/admin/workflows`);
  const select = page.getByLabel(flowLabel, { exact: true }), name = page.getByLabel(nameLabel, { exact: true });
  await select.selectOption(flows.one); await name.fill('Unsaved workflow input');
  await select.focus(); await select.selectOption(flows.two);
  const dialog = page.getByRole('alertdialog', { name: dialogName }); await expect(dialog).toBeVisible();
  await expect(select).toHaveValue(flows.one); await expect(name).toHaveValue('Unsaved workflow input');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  const bounds = (await dialog.boundingBox())!, viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width); expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  for (const button of await dialog.getByRole('button').all()) { const box = (await button.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
  await expect(dialog.getByRole('button', { name: stayLabel, exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(select).toBeFocused();
  await page.getByRole('tab', { name: t('فرق العمل', 'Teams'), exact: true }).click();
  await page.getByRole('tab', { name: t('المسارات', 'Workflows'), exact: true }).click(); await expect(name).toHaveValue('Unsaved workflow input');
  await select.selectOption(flows.two); await dialog.getByRole('button', { name: discardLabel, exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(select).toHaveValue(flows.two); await expect(name).toHaveValue('Synthetic workflow two');
  await select.selectOption(flows.one); await expect(name).toHaveValue('Synthetic workflow one');
  expect(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })).toBe(false);
 });
 test(`${locale}: saving before selection updates only the source draft and never publishes`, async ({ page, flows }) => {
  let published = 0; page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/workflows/publish')) published++; });
  await page.goto(`/${locale}/admin/workflows`);
  const select = page.getByLabel(flowLabel, { exact: true }), name = page.getByLabel(nameLabel, { exact: true });
  await select.selectOption(flows.one); await name.fill('Saved source definition');
  await page.getByRole('textbox', { name: t('اسم المرحلة بالإنجليزية', 'Stage English name'), exact: true }).fill('Saved intake stage');
  await select.selectOption(flows.two);
  const saved = page.waitForResponse(r => r.url().endsWith('/workflows/drafts') && r.request().method() === 'POST');
  await page.getByRole('alertdialog').getByRole('button', { name: saveLabel, exact: true }).click();
  const response = await saved; expect(response.status()).toBe(201); expect(await response.json()).toMatchObject({ id: flows.one, revision: 1 });
  await expect(select).toHaveValue(flows.two); await expect(name).toHaveValue('Synthetic workflow two');
  await page.reload(); await select.selectOption(flows.one); await expect(name).toHaveValue('Saved source definition');
  await expect(page.getByRole('textbox', { name: t('اسم المرحلة بالإنجليزية', 'Stage English name'), exact: true })).toHaveValue('Saved intake stage');
  expect(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })).toBe(false);
  const overview = await (await page.request.get('/api/admin/workflows')).json();
  expect(overview.workflows.find((flow: { id: string }) => flow.id === flows.two).draft.nameEn).toBe('Synthetic workflow two');
  expect(overview.versions.filter((v: { workflowId: string }) => [flows.one, flows.two].includes(v.workflowId))).toEqual([]); expect(published).toBe(0);
 });
 for (const status of [400, 503]) test(`${locale}: failed draft save ${status} retains input and selection without automatic retry`, async ({ page, flows }) => {
  await page.goto(`/${locale}/admin/workflows`);
  const select = page.getByLabel(flowLabel, { exact: true }), name = page.getByLabel(nameLabel, { exact: true });
  await select.selectOption(flows.one); await name.fill('Retained failed save'); await select.selectOption(flows.two);
  await page.route('**/api/admin/workflows/drafts', r => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ ok: false, error: status === 400 ? 'invalid' : 'unavailable' }) }), { times: 1 });
  const rejected = page.waitForResponse(r => r.url().endsWith('/workflows/drafts') && r.request().method() === 'POST');
  await page.getByRole('alertdialog').getByRole('button', { name: saveLabel, exact: true }).click(); expect((await rejected).status()).toBe(status);
  await expect(page.getByRole('alertdialog').getByRole('alert')).toBeVisible(); await expect(select).toHaveValue(flows.one); await expect(name).toHaveValue('Retained failed save');
  await page.getByRole('alertdialog').getByRole('button', { name: stayLabel, exact: true }).click(); await expect(name).toHaveValue('Retained failed save');
  const overview = await (await page.request.get('/api/admin/workflows')).json(); expect(overview.workflows.find((f: { id: string }) => f.id === flows.one).revision).toBe(0);
 });
 test(`${locale}: a failed in-flight save cannot release a pending navigation even without edits`, async ({ page, flows }) => {
  await page.goto(`/${locale}/admin/workflows`);
  const select = page.getByLabel(flowLabel, { exact: true }); await select.selectOption(flows.one);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), seen = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/admin/workflows/drafts', async route => {
   started(); await gate; await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid' }) });
  }, { times: 1 });
  try {
   const rejected = page.waitForResponse(r => r.url().endsWith('/workflows/drafts') && r.request().method() === 'POST');
   await page.getByRole('button', { name: t('حفظ المسودة', 'Save draft'), exact: true }).click(); await seen;
   await page.locator('a[hreflang]').filter({ visible: true }).click(); await expect(page.getByRole('alertdialog')).toBeVisible();
   release(); expect((await rejected).status()).toBe(400);
   await expect(page.getByRole('alertdialog').getByRole('alert')).toBeVisible();
   await expect(page).toHaveURL(new RegExp(`/${locale}/admin/workflows$`)); await expect(select).toHaveValue(flows.one);
   await page.getByRole('alertdialog').getByRole('button', { name: stayLabel, exact: true }).click();
   expect(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })).toBe(false);
  } finally { release(); }
 });
 test(`${locale}: a real revision conflict keeps local edits and the server draft`, async ({ page, flows }) => {
  await page.goto(`/${locale}/admin/workflows`);
  const select = page.getByLabel(flowLabel, { exact: true }), name = page.getByLabel(nameLabel, { exact: true });
  await select.selectOption(flows.one); await name.fill('Local conflicted edit');
  const server = { ...legacyWorkflow('requests'), nameAr: 'تعديل خادم اصطناعي', nameEn: 'Other confirmed edit' };
  expect((await page.request.post('/api/admin/workflows/drafts', { headers: flows.headers, data: { payload: { id: flows.one, revision: 0, definition: server } } })).status()).toBe(201);
  await select.selectOption(flows.two); const rejected = page.waitForResponse(r => r.url().endsWith('/workflows/drafts') && r.request().method() === 'POST');
  await page.getByRole('alertdialog').getByRole('button', { name: saveLabel, exact: true }).click(); expect((await rejected).status()).toBe(409);
  await expect(page.getByRole('alertdialog').getByRole('alert')).toBeVisible(); await expect(select).toHaveValue(flows.one); await expect(name).toHaveValue('Local conflicted edit');
  const overview = await (await page.request.get('/api/admin/workflows')).json(); expect(overview.workflows.find((f: { id: string }) => f.id === flows.one).draft.nameEn).toBe('Other confirmed edit');
 });
 test(`${locale}: browser back and forward retain edits until save or explicit discard`, async ({ page, flows }) => {
  await page.goto(`/${locale}/admin`);
  const workflowLink = page.locator(`a[href="/${locale}/admin/workflows"]`).filter({ visible: true }).first();
  if (!(await workflowLink.isVisible())) await page.getByRole('button', { name: (locale === 'ar' ? ar : en).common.openMenu, exact: true }).click();
  await workflowLink.click(); await expect(page).toHaveURL(new RegExp(`/${locale}/admin/workflows$`));
  const select = page.getByLabel(flowLabel, { exact: true }), name = page.getByLabel(nameLabel, { exact: true });
  await select.selectOption(flows.one); await name.fill('Saved before leaving');
  await page.evaluate(() => history.back()); await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: stayLabel, exact: true }).click(); await expect(name).toHaveValue('Saved before leaving');
  await page.evaluate(() => history.back()); await page.getByRole('alertdialog').getByRole('button', { name: saveLabel, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/admin$`)); await page.goForward(); await select.selectOption(flows.one); await expect(name).toHaveValue('Saved before leaving');
  await name.fill('Explicitly discarded'); await page.evaluate(() => history.back());
  await page.getByRole('alertdialog').getByRole('button', { name: discardLabel, exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/${locale}/admin$`));
  await page.goForward(); await select.selectOption(flows.one); await expect(name).toHaveValue('Saved before leaving');
 });
 test(`${locale}: approved navigation freezes editing until the destination is ready`, async ({ page, flows }) => {
  const other = locale === 'ar' ? 'en' : 'ar';
  await page.goto(`/${locale}/admin/workflows`);
  const select = page.getByLabel(flowLabel, { exact: true }), name = page.getByLabel(nameLabel, { exact: true });
  await select.selectOption(flows.one); await name.fill('Saved before pending navigation');
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), seen = new Promise<void>(resolve => { started = resolve; });
  await page.route(/\/api\/v1\/public\/view\?/, async route => {
   if (new URL(route.request().url()).searchParams.get('path') === `/${other}/admin/workflows`) { started(); await gate; }
   await route.continue();
  });
  try {
   await page.locator('a[hreflang]').filter({ visible: true }).click();
   await page.getByRole('alertdialog').getByRole('button', { name: saveLabel, exact: true }).click(); await seen;
   await expect(name).toBeDisabled(); await expect(name).toHaveValue('Saved before pending navigation');
   expect(await page.getByLabel(t('مساحة المخطط القابلة للتمرير', 'Scrollable diagram'), { exact: true }).evaluate(element => { (element as HTMLElement).focus(); return document.activeElement === element; })).toBe(false);
   release(); await expect(page).toHaveURL(new RegExp(`/${other}/admin/workflows$`));
   const targetSelect = page.getByLabel(other === 'ar' ? 'المسار' : 'Workflow', { exact: true });
   await expect(targetSelect).toBeEnabled(); await targetSelect.selectOption(flows.one);
   await expect(page.getByLabel(other === 'ar' ? 'اسم المسار بالإنجليزية' : 'Workflow English name', { exact: true })).toHaveValue('Saved before pending navigation');
  } finally { release(); }
 });
 test(`${locale}: language navigation and reload protect the workflow without putting its content in URL`, async ({ page, flows }) => {
  const other = locale === 'ar' ? 'en' : 'ar';
  await page.goto(`/${locale}/admin/workflows`);
  const select = page.getByLabel(flowLabel, { exact: true }), name = page.getByLabel(nameLabel, { exact: true });
  await select.selectOption(flows.one); await name.fill('Retained across language');
  await page.locator('a[hreflang]').filter({ visible: true }).click(); await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: stayLabel, exact: true }).click(); await expect(name).toHaveValue('Retained across language');
  await page.locator('a[hreflang]').filter({ visible: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: saveLabel, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${other}/admin/workflows$`));
  const otherSelect = page.getByRole('combobox', { name: other === 'ar' ? 'المسار' : 'Workflow', exact: true });
  await otherSelect.selectOption(flows.one);
  const otherName = page.getByRole('textbox', { name: other === 'ar' ? 'اسم المسار بالإنجليزية' : 'Workflow English name', exact: true });
  await expect(otherName).toHaveValue('Retained across language'); await otherName.fill('Reload warning edit');
  const dialog = page.waitForEvent('dialog'); const reload = page.evaluate(() => window.location.reload());
  const warning = await dialog; expect(warning.type()).toBe('beforeunload'); await warning.dismiss(); await reload;
  await expect(otherName).toHaveValue('Reload warning edit');
  expect(new URL(page.url()).search).toBe('');
 });
}
