import { expect } from '@playwright/test';
import { test } from './quota-fixture';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createDataSource } from '@so7ob/server';

for (const locale of ['ar', 'en'] as const) test(`${locale}: actual client can read their stored original request after reload`, async ({ page }) => {
  const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
  const db = await createDataSource().initialize(), id = 'description108-' + randomBytes(8).toString('hex');
  const description = 'وصف الطلب الأصلي الاصطناعي\nOriginal synthetic request description108';
  try {
    await db.query("INSERT INTO ProjectRequest(id,refCode,clientId,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,?,'quote','web',?,'synthetic','unspecified','flexible','Synthetic client',?,'email',?)", [id, 'S7-' + id.slice(-8), prefix + 'owner', description, prefix + 'owner@example.invalid', locale]);
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + 'owner@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    expect((await db.query('SELECT roleKey FROM User WHERE id=?', [prefix + 'owner']))[0].roleKey).toBe('client');
    expect((await db.query('SELECT description FROM ProjectRequest WHERE id=?', [id]))[0].description).toBe(description);
    const response = await page.request.get('/api/account/requests/' + id);
    expect(response.status()).toBe(200);
    expect((await response.json()).request.description).toBe(description);
    await page.goto(`/${locale}/account/requests/${id}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'S7-' + id.slice(-8), exact: true })).toBeVisible();
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText(description, { exact: true })).toBeVisible();
  } finally {
    await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
    await db.query('DELETE FROM ProjectRequest WHERE id=?', [id]);
    await db.destroy();
  }
});
