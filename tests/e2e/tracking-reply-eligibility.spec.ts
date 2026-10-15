import { test } from './quota-fixture';
import { expect } from '@playwright/test';
import { createDataSource, sha256 } from '@so7ob/server';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { getPortalContent } from '../../apps/web/src/content/portal';

test('en: eligibility change refuses a staff reply and keeps an accessible unsent draft', async ({ page, baseURL }) => {
  const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
  const db = await createDataSource().initialize(), id = 'reply117-' + randomBytes(8).toString('hex'), key = sha256('track-rp:127.0.0.1');
  const [quota] = await db.query('SELECT timestamps,updatedAt FROM RateLimitBucket WHERE bucketKey=?', [key]);
  const login = async (actor: string) => {
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + actor + '@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
  };
  try {
    await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [key]);
    await db.query("INSERT INTO ProjectRequest(id,refCode,clientId,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,?,'quote','web','Synthetic eligibility117','synthetic','unspecified','flexible','Synthetic client',?,'email','en')", [id, 'S7-' + id.slice(-8), prefix + 'owner', prefix + 'owner@example.invalid']);
    await login('owner');
    await page.goto('/en/track?card=request:' + id, { waitUntil: 'networkidle' });
    const t = getPortalContent('en').track, draft = 'Synthetic retained unsent draft117';
    await expect(page.getByPlaceholder(t.replyPlaceholder)).toBeVisible();
    await page.getByPlaceholder(t.replyPlaceholder).fill(draft);
    await login('admin');
    expect((await db.query('SELECT roleKey FROM User WHERE id=?', [prefix + 'admin']))[0].roleKey).toBe('super_admin');
    const view = await page.request.get('/api/track/card', { params: { scope: 'request', id } });
    expect(view.status()).toBe(200);
    const payload = await view.json();
    let posts = 0; page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/track/reply') posts++; });
    const denied = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/track/reply'));
    await page.getByRole('button', { name: t.send, exact: true }).click();
    const response = await denied; expect(response.status()).toBe(403); expect((await response.json()).code).toBe('policy_denied');
    expect(await db.query('SELECT id FROM RequestMessage WHERE requestId=?', [id])).toHaveLength(0);
    expect(posts).toBe(1);
    expect(new URL(page.url()).origin).toBe(baseURL);
    await expect(page.getByText('Use the staff workspace to reply to this card.', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Unsent reply', exact: true })).toHaveValue(draft);
    await expect(page.getByRole('textbox', { name: 'Unsent reply', exact: true })).toHaveAttribute('readonly', '');
    await expect(page.getByText(t.replyDisabledLogin, { exact: true })).toHaveCount(0);
    expect(payload.policy.canReplyByOwner).toBe(false);
  } finally {
    try {
      await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
      await db.query('DELETE FROM ProjectRequest WHERE id=?', [id]);
      if (quota) await db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps,updatedAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps),updatedAt=VALUES(updatedAt)', [key, quota.timestamps, quota.updatedAt]);
      else await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [key]);
    } finally { await db.destroy(); }
  }
});
