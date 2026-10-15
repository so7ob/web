import { test as base } from './quota-fixture';
import { expect } from '@playwright/test';
import { createDataSource, sha256 } from '@so7ob/server';
import { type TrackScope, type TrackMode } from '@so7ob/contracts';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

type Fixture = { db: ReturnType<typeof createDataSource>; id: string; prefix: string;
  login: (actor: 'owner' | 'admin' | 'other') => Promise<void>;
  create: (scope: TrackScope, staffOwner?: boolean) => Promise<string>;
  capability: (scope: TrackScope, id: string, mode: TrackMode) => Promise<string> };
export const test = base.extend<{ trackingReply: Fixture }>({
  trackingReply: [async ({ page, preserveLoginQuota }, use) => {
    void preserveLoginQuota;
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const db = await createDataSource().initialize(), owned: Array<{ scope: TrackScope; id: string }> = [];
    const quotas = await Promise.all(['track-rp:127.0.0.1','track-ex:127.0.0.1'].map(async name => {
      const key = sha256(name), [row] = await db.query('SELECT timestamps,updatedAt FROM RateLimitBucket WHERE bucketKey=?', [key]);
      return { key, row };
    }));
    const login: Fixture['login'] = async actor => {
      const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
      expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + actor + '@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    };
    const create: Fixture['create'] = async (scope, staffOwner = false) => {
      const id = 'reply117' + randomBytes(8).toString('hex'), owner = prefix + (staffOwner ? 'admin' : 'owner');
      owned.push({ scope, id });
      if (scope === 'request') await db.query("INSERT INTO ProjectRequest(id,refCode,clientId,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,?,'quote','web','Synthetic eligibility117','synthetic','unspecified','flexible','PRIVATE contact',?,'email','en')", [id, 'S7-' + id.slice(-8), owner, prefix + 'owner@example.invalid']);
      else await db.query("INSERT INTO Inquiry(id,refCode,clientId,subject,name,email,locale) VALUES(?,?,?,'Synthetic eligibility117','PRIVATE contact',?,'en')", [id, 'S7-' + id.slice(-8), owner, prefix + 'owner@example.invalid']);
      const message = scope === 'request' ? 'RequestMessage' : 'InquiryMessage', field = scope === 'request' ? 'requestId' : 'inquiryId';
      await db.query(`INSERT INTO ${message}(id,${field},authorType,kind,body) VALUES(?,?,'staff','internal_note','PRIVATE note117')`, [id + 'note', id]);
      return id;
    };
    const capability: Fixture['capability'] = async (scope, id, mode) => {
      const token = randomBytes(32).toString('base64url'), field = scope === 'request' ? 'requestId' : 'inquiryId';
      await db.query('INSERT INTO SiteSetting(`key`,value,updatedById) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)', ['track.exception.' + scope + '.' + id, mode, prefix + 'admin']);
      await db.query(`INSERT INTO TrackLink(id,scope,${field},tokenHash,expiresAt) VALUES(?,?,?,?,TIMESTAMPADD(DAY,1,UTC_TIMESTAMP(3)))`, [id + 'link', scope, id, sha256(token)]);
      return token;
    };
    try {
      for (const { key } of quotas) await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [key]);
      const id = await create('request'); await login('owner');
      await use({ db, id, prefix, login, create, capability });
    } finally {
      try {
        try {
          for (const { scope, id } of owned) {
            await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
            await db.query("DELETE FROM Notification WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ref'))=?", ['S7-' + id.slice(-8)]);
            await db.query('DELETE FROM ConversationWorkflow WHERE recordId=?', [id]);
            await db.query('DELETE FROM SiteSetting WHERE `key`=?', ['track.exception.' + scope + '.' + id]);
            await db.query(`DELETE FROM ${scope === 'request' ? 'ProjectRequest' : 'Inquiry'} WHERE id=?`, [id]);
          }
        } finally {
          for (const { key, row } of quotas) {
            if (row) await db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps,updatedAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps),updatedAt=VALUES(updatedAt)', [key, row.timestamps, row.updatedAt]);
            else await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [key]);
          }
        }
      } finally { await db.destroy(); }
    }
  }, { timeout: 30000 }],
});
