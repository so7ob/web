import { expect } from '@playwright/test';
import { test as base } from './quota-fixture';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
import type { DataSource } from 'typeorm';

export const test = base.extend<{ copyFixture: { db: DataSource; id: string; slug: string; title: string; before: Record<string, unknown>; releaseOnCleanup: (release: () => void) => void } }>({
  copyFixture: [async ({ page }, use) => {
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    const db = await createDataSource().initialize(), slug = 'copy120-' + randomBytes(6).toString('hex'), title = 'Synthetic copy ' + slug;
    const releases: Array<() => void> = [];
    let id = '';
    try {
      const created = await page.request.post('/api/admin/pages', { headers: { 'x-csrf-token': csrfToken }, data: { slug, titleAr: title, titleEn: title } });
      expect(created.status()).toBe(201); id = (await created.json()).page.id;
      const content = (locale: string, text: string) => JSON.stringify({ schemaVersion: 1, blocks: [{ id: 'section', type: 'section', children: [{ id: 'draft-' + locale, type: 'heading', props: { text } }] }] });
      const settings = { slug, titleAr: 'عنوان المسودة', titleEn: 'Draft display title', visibility: 'role', allowedRoles: ['ops_manager'], order: 0, seoTitleAr: 'بحث اصطناعي', seoTitleEn: null, seoDescAr: 'وصف البحث', seoDescEn: 'Draft SEO' };
      const saved = await page.request.patch('/api/admin/pages/' + id, { headers: { 'x-csrf-token': csrfToken }, data: { baseRevision: 0, draftSettings: settings, draftBlocksAr: content('ar', 'محتوى المسودة المنسوخة'), draftBlocksEn: content('en', 'Copied draft content') } });
      expect(saved.status()).toBe(200);
      await db.query("UPDATE Page SET status='published',publishedAt=UTC_TIMESTAMP(3),publishedRevision=0,publishedBlocksAr=?,publishedBlocksEn=?,scheduledPublishAt='2035-01-01',scheduledRevision=1 WHERE id=?", [content('ar', 'منشور قديم'), content('en', 'Old publication'), id]);
      const before = (await db.query('SELECT * FROM Page WHERE id=?', [id]))[0];
      await use({ db, id, slug, title, before, releaseOnCleanup: release => releases.push(release) });
    } finally {
      for (const release of releases) release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      try {
        const owned = await db.query('SELECT id FROM Page WHERE slug=? OR slug LIKE ?', [slug, slug + '-copy%']);
        for (const row of owned) { await db.query('DELETE FROM PageVersion WHERE pageId=?', [row.id]); await db.query('DELETE FROM AuditLog WHERE entityId=?', [row.id]); await db.query('DELETE FROM Page WHERE id=?', [row.id]); }
      } finally { await db.destroy(); }
    }
  }, { timeout: 30000 }],
});
