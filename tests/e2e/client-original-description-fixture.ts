import { test as base } from './quota-fixture';
import { expect, type APIRequestContext } from '@playwright/test';
import { createDataSource, sha256 } from '@so7ob/server';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Fixture = { db: ReturnType<typeof createDataSource>; prefix: string; email: string; headers: Record<string, string>; legacy: (description: string, owner?: 'owner' | 'other') => Promise<{ id: string; ref: string }>; apiFor: (actor: 'admin' | 'other') => Promise<{ request: APIRequestContext; headers: Record<string, string> }> };
export const test = base.extend<{ originalRequest: Fixture }>({
  originalRequest: [async ({ page, playwright, baseURL, preserveLoginQuota }, use) => {
    void preserveLoginQuota;
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const db = await createDataSource().initialize(), contexts: APIRequestContext[] = [];
    const quotaKey = sha256('request:' + sha256('ip:127.0.0.1'));
    const [quota] = await db.query('SELECT timestamps,updatedAt FROM RateLimitBucket WHERE bucketKey=?', [quotaKey]);
    const [previousDraft] = await db.query('SELECT * FROM RequestDraft WHERE userId=?', [prefix + 'owner']);
    const login = async (request: APIRequestContext, actor: string) => {
      const { csrfToken } = await (await request.get('/api/auth/csrf')).json();
      expect((await request.post('/api/auth/callback/credentials', { form: { email: prefix + actor + '@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
      return { 'x-csrf-token': csrfToken };
    };
    try {
      await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [quotaKey]);
      // Another project can intentionally leave this shared synthetic owner's
      // server draft. This journey creates a new request from an empty draft.
      await db.query('DELETE FROM RequestDraft WHERE userId=?', [prefix + 'owner']);
      const headers = await login(page.request, 'owner');
      expect((await db.query('SELECT roleKey FROM User WHERE id=?', [prefix + 'owner']))[0].roleKey).toBe('client');
      await use({ db, prefix, headers, email: prefix + 'owner@example.invalid',
        legacy: async (description, owner = 'owner') => {
          const id = 'desc108-' + randomBytes(10).toString('hex'), ref = 'S7-' + randomBytes(5).toString('hex').toUpperCase();
          await db.query("INSERT INTO ProjectRequest(id,refCode,clientId,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,?,'quote','web',?,?,'unspecified','flexible','Synthetic client',?,'email','en')", [id, ref, prefix + owner, description, sha256(description), prefix + owner + '@example.invalid']);
          return { id, ref };
        },
        apiFor: async actor => {
          const request = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true }); contexts.push(request);
          return { request, headers: await login(request, actor) };
        },
      });
    } finally {
      try {
        await db.query('DELETE FROM RequestDraft WHERE userId=?', [prefix + 'owner']);
        if (previousDraft) await db.query('INSERT INTO RequestDraft(id,userId,data,updatedAt) VALUES(?,?,?,?)', [previousDraft.id,previousDraft.userId,previousDraft.data,previousDraft.updatedAt]);
        if (quota) await db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps,updatedAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps),updatedAt=VALUES(updatedAt)', [quotaKey, quota.timestamps, quota.updatedAt]);
        else await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [quotaKey]);
      } finally { for (const request of contexts) await request.dispose(); await db.destroy(); }
      // The global synthetic fixture owns these prefix-addressed requests,
      // messages, attachments and queued mail, including after a body deadline.
    }
  }, { timeout: 30000 }],
});
