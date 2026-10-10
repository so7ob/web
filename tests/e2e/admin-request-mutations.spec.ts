import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './quota-fixture';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createDataSource } from '@so7ob/server';
import { getPortalContent } from '../../apps/web/src/content/portal';
import AxeBuilder from '@axe-core/playwright';

test.use({ contextOptions: { reducedMotion: 'reduce' } });
async function login(request: APIRequestContext, suffix = 'admin') {
  const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
  const { csrfToken } = await (await request.get('/api/auth/csrf')).json();
  expect((await request.post('/api/auth/callback/credentials', {
    form: { email: prefix + suffix + '@example.invalid', password, csrfToken, json: 'true' },
  })).status()).toBe(200);
  return { prefix, headers: { 'x-csrf-token': csrfToken } };
}
async function fixture(prefix: string) {
  const db = await createDataSource().initialize();
  const id = prefix + 'mutation' + randomBytes(5).toString('hex');
  await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId,assigneeId) VALUES(?,?,'quote','web','Synthetic mutation regression','synthetic','unspecified','flexible','Synthetic',?,'email','ar',?,?)", [id,id,prefix+'owner@example.invalid',prefix+'owner',prefix+'admin']);
  await db.query("INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale,clientId,assigneeId) VALUES(?,?,'Synthetic mutation regression','Synthetic',?,'general','ar',?,?)", [id,id,prefix+'owner@example.invalid',prefix+'owner',prefix+'admin']);
  const row = async (kind = 'requests') => (await db.query(`SELECT * FROM ${kind === 'requests' ? 'ProjectRequest' : 'Inquiry'} WHERE id=?`, [id]))[0];
  return { id, db, row, async dispose() {
    await db.query('DELETE FROM Notification WHERE link LIKE ?', ['%'+id]);
    await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
    await db.query('DELETE FROM ProjectRequest WHERE id=?', [id]);
    await db.query('DELETE FROM Inquiry WHERE id=?', [id]);
    await db.destroy();
  } };
}

test('HTTP sparse mutations preserve omitted fields, audit and legacy/v1 behavior', async ({ request }) => {
  const { prefix, headers } = await login(request);
  const f = await fixture(prefix);
  try {
    for (const api of ['/api/admin', '/api/v1/admin']) {
      const before = await f.row();
      const priority = before.priority === 'high' ? 'urgent' : 'high';
      const result = await request.patch(`${api}/requests/${f.id}`, { headers, data: { priority } });
      expect({ status: result.status(), body: await result.json() }).toEqual({ status: 200, body: { ok: true } });
      expect(await f.row()).toMatchObject({ priority, status: before.status, assigneeId: prefix+'admin' });
      const status = before.status === 'in_review' ? 'in_progress' : 'in_review';
      expect((await request.patch(`${api}/requests/${f.id}`, { headers, data: { status, note: 'Synthetic status note' } })).status()).toBe(200);
      expect(await f.row()).toMatchObject({ status, priority, assigneeId: prefix+'admin' });
      for (const kind of ['requests', 'inquiries']) {
        const url = `${api}/${kind}/${f.id}`;
        expect((await request.patch(url, { headers, data: { assigneeId: null } })).status()).toBe(200);
        expect((await f.row(kind)).assigneeId).toBeNull();
        expect((await request.patch(url, { headers, data: { assigneeId: prefix+'admin' } })).status()).toBe(200);
        for (const action of ['archive', 'restore']) {
          expect((await request.patch(url, { headers, data: { action } })).status()).toBe(200);
          expect(Boolean((await f.row(kind)).archivedAt)).toBe(action === 'archive');
          expect((await f.row(kind)).assigneeId).toBe(prefix+'admin');
        }
      }
      const inquiryStatus = (await f.row('inquiries')).status === 'responded' ? 'closed' : 'responded';
      expect((await request.patch(`${api}/inquiries/${f.id}`, { headers, data: { status: inquiryStatus } })).status()).toBe(200);
      expect((await f.row('inquiries')).status).toBe(inquiryStatus);
    }
    const events = await f.db.query('SELECT toStatus,note FROM RequestStatusEvent WHERE requestId=? ORDER BY createdAt,id', [f.id]);
    expect(events.map((r: {toStatus: string}) => r.toStatus)).toEqual(['in_review','in_progress']);
    expect(events.every((r: {note: string}) => r.note === 'Synthetic status note')).toBe(true);
    const audits = await f.db.query("SELECT action FROM AuditLog WHERE entityId=? AND action IN ('request.priority_changed','request.status_changed')", [f.id]);
    expect(audits).toHaveLength(4);
  } finally { await f.dispose(); }
});

test('HTTP mutation permissions, invalid input and concurrent independent fields remain protected', async ({ request, playwright, baseURL }) => {
  const { prefix, headers } = await login(request), f = await fixture(prefix);
  const denied = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    for (const api of ['/api/admin', '/api/v1/admin']) {
      const url = `${api}/requests/${f.id}`;
      expect((await denied.patch(url, { data: { priority:'urgent' } })).status()).toBe(401);
      expect((await request.patch(url, { data: { priority:'urgent' } })).status()).toBe(403);
      expect((await request.patch(url, { headers:{...headers,origin:'https://example.invalid'}, data:{status:'closed'} })).status()).toBe(403);
      for (const data of [{}, {priority:null}, {priority:'invalid'}, {status:'invalid'}, {assigneeId:'missing'}, {action:'invalid'}, {priority:false}, {priority:0}, {priority:''}, {status:'in_review',priority:'urgent'}, {assigneeId:null,status:'closed'}, {action:'archive',priority:'high'}, {note:'orphan note',priority:'high'}])
        expect((await request.patch(url, { headers, data })).status()).toBe(400);
      expect(await f.row()).toMatchObject({ priority:'normal',status:'new',assigneeId:prefix+'admin' });
    }
    const limited = await login(denied, 'editor');
    for (const kind of ['requests','inquiries']) for (const data of [{status:'closed'},{assigneeId:null},{action:'archive'},...(kind==='requests'?[{priority:'urgent'}]:[])])
      expect((await denied.patch(`/api/admin/${kind}/${f.id}`, {headers:limited.headers,data})).status()).toBe(403);
    const responses = await Promise.all([
      request.patch(`/api/admin/requests/${f.id}`, {headers,data:{priority:'urgent'}}),
      request.patch(`/api/v1/admin/requests/${f.id}`, {headers,data:{status:'awaiting_info'}}),
    ]);
    expect(responses.map(r=>r.status())).toEqual([200,200]);
    expect(await f.row()).toMatchObject({priority:'urgent',status:'awaiting_info',assigneeId:prefix+'admin'});
    const repeated = await request.patch(`/api/admin/requests/${f.id}`, {headers,data:{status:'awaiting_info'}});
    expect(repeated.status()).toBe(409);expect(await repeated.json()).toMatchObject({code:'invalid_transition'});
    expect(await f.db.query('SELECT id FROM RequestStatusEvent WHERE requestId=?',[f.id])).toHaveLength(1);
    const support = await login(denied, 'support');
    for (const kind of ['requests','inquiries']) {
      expect((await denied.patch(`/api/admin/${kind}/${f.id}`, {headers:support.headers,data:{status:kind==='requests'?'in_progress':'responded'}})).status()).toBe(200);
      expect((await denied.patch(`/api/v1/admin/${kind}/${f.id}`, {headers:support.headers,data:{assigneeId:null}})).status()).toBe(403);
      expect((await f.row(kind)).assigneeId).toBe(prefix+'admin');
    }
  } finally { await denied.dispose(); await f.dispose(); }
});

for (const locale of ['ar','en'] as const) test(`${locale}: details save priority/status, preserve failed notes and reload persisted data`, async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const { prefix } = await login(page.request), f = await fixture(prefix), t = getPortalContent(locale), tr = t.admin.requests;
  try {
    await page.goto(`/${locale}/admin/requests/${f.id}`, {waitUntil:'networkidle'});
    const patchResponse = () => page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/requests/'+f.id));
    const priority = page.getByRole('combobox',{name:tr.priority,exact:true});
    await priority.focus();await page.keyboard.press('Enter');
    const savedPriority = patchResponse();await page.getByRole('option',{name:tr.priorities.high,exact:true}).click();
    expect((await savedPriority).status()).toBe(200);await expect.poll(async()=> (await f.row()).priority).toBe('high');
    const status = page.getByRole('combobox',{name:tr.changeStatus,exact:true});
    await status.click();await page.getByRole('option',{name:tr.statuses.in_review,exact:true}).click();
    const note = page.getByPlaceholder(tr.statusNotePlaceholder);await note.fill('Synthetic note retained after failure');
    await page.route('**/api/admin/requests/'+f.id, async route=> {
      if(route.request().method()==='PATCH') await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({ok:false,code:'generic'})});
      else await route.continue();
    });
    const failed = patchResponse();await page.getByRole('button',{name:tr.applyStatus,exact:true}).click();expect((await failed).status()).toBe(500);
    await expect(page.getByText(t.auth.errors.generic,{exact:true})).toBeVisible();await expect(note).toHaveValue('Synthetic note retained after failure');
    expect((await f.row()).status).toBe('new');
    await page.unroute('**/api/admin/requests/'+f.id);
    const saved = patchResponse();await page.getByRole('button',{name:tr.applyStatus,exact:true}).click();expect((await saved).status()).toBe(200);
    await expect.poll(async()=>(await f.row()).status).toBe('in_review');
    await page.reload({waitUntil:'networkidle'});await expect(priority).toContainText(tr.priorities.high);await expect(status).toContainText(tr.statuses.in_review);
    expect((await f.row()).assigneeId).toBe(prefix+'admin');
    await status.click();await page.getByRole('option',{name:tr.statuses.closed,exact:true}).click();
    const reason = page.getByPlaceholder(tr.closeReasonPlaceholder);await reason.fill('Synthetic closure reason retained');
    await page.route('**/api/admin/requests/'+f.id, async route=> {
      if(route.request().method()==='PATCH') await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,code:'invalid_transition'})});
      else await route.continue();
    });
    const conflict = patchResponse();await page.getByRole('button',{name:tr.applyStatus,exact:true}).click();expect((await conflict).status()).toBe(409);
    await expect(page.getByText(tr.invalidTransition,{exact:true})).toBeVisible();await expect(reason).toHaveValue('Synthetic closure reason retained');
    await page.unroute('**/api/admin/requests/'+f.id);
    const closed = patchResponse();await page.getByRole('button',{name:tr.applyStatus,exact:true}).click();expect((await closed).status()).toBe(200);
    await expect.poll(async()=>(await f.row()).status).toBe('closed');
    expect((await f.row()).resolutionNote).toBe('Synthetic closure reason retained');
    const tabs = page.getByRole('tablist').last(), triggers = tabs.getByRole('tab');
    await page.getByRole('tabpanel').getByRole('textbox').fill('Synthetic unsent reply draft');
    await triggers.first().focus();await page.keyboard.press('End');
    await expect(triggers.last()).toHaveAttribute('aria-selected','true');
    await expect(page.getByRole('tabpanel').getByRole('textbox')).toHaveValue('Synthetic unsent reply draft');
    await expect(page.getByRole('tabpanel')).toHaveAttribute('id',(await triggers.last().getAttribute('aria-controls'))!);
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby',(await triggers.last().getAttribute('id'))!);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await page.keyboard.press('Home');await expect(triggers.first()).toHaveAttribute('aria-selected','true');
    await expect(page.getByRole('tabpanel').getByRole('textbox')).toHaveValue('Synthetic unsent reply draft');
    await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({path:testInfo.outputPath('synthetic-request-details.png'),fullPage:true});
  } finally { await f.dispose(); }
});

for (const locale of ['ar','en'] as const) test(`${locale}: a confirmed save with failed refresh never repeats the write`,async({page})=>{
  const {prefix}=await login(page.request),f=await fixture(prefix),tr=getPortalContent(locale).admin.requests;
  try {
    await page.goto(`/${locale}/admin/requests/${f.id}`,{waitUntil:'networkidle'});
    let writes=0,failReads=false;
    await page.route('**/api/admin/requests/'+f.id,async route=>{
      if(route.request().method()==='PATCH'){writes++;failReads=true;await route.continue();}
      else if(failReads)await route.fulfill({status:500,contentType:'application/json',body:'{"ok":false,"code":"internal_error"}'});
      else await route.continue();
    });
    const priority=page.getByRole('combobox',{name:tr.priority,exact:true});
    await priority.click();await page.getByRole('option',{name:tr.priorities.high,exact:true}).click();
    await expect(page.getByText(tr.savedRefreshFailed,{exact:true})).toBeVisible();
    expect((await f.row()).priority).toBe('high');expect(writes).toBe(1);await expect(priority).toBeDisabled();
    failReads=false;await page.getByRole('button',{name:tr.refreshData,exact:true}).click();
    await expect(page.getByText(tr.savedRefreshFailed,{exact:true})).toHaveCount(0);
    await expect(priority).toContainText(tr.priorities.high);await expect(priority).toBeEnabled();expect(writes).toBe(1);
  }finally{await f.dispose();}
});
