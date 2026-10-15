import { expect } from '@playwright/test';
import { test } from './quota-fixture';
import { readFileSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { createDataSource } from '@so7ob/server';
import { getPortalContent } from '../../apps/web/src/content/portal';

for (const locale of ['ar', 'en'] as const) {
  test(`${locale}: media alt saves preserve sibling/newer drafts and failed text with keyboard navigation`, async ({ page, baseURL }) => {
    test.setTimeout(60000);
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const db = await createDataSource().initialize();
    const folder = 'alt-race-' + randomBytes(6).toString('hex');
    const files: Array<{ id: string; filename: string; storedName: string }> = [];
    const gates: Array<() => void> = [];
    const m = getPortalContent(locale).admin.media;
    try {
      const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
      expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
      for (const index of [1, 2]) {
        const filename = folder + '-' + index + '.png';
        const uploaded = await page.request.post('/api/admin/media', {
          headers: { Origin: baseURL! }, multipart: { folder, altText: 'Original ' + index,
            file: { name: filename, mimeType: 'image/png', buffer: await sharp({ create: { width: 16, height: 16, channels: 3, background: '#12486b' } }).png().toBuffer() } },
        });
        expect(uploaded.status()).toBe(201);
        const { media } = await uploaded.json();
        const [row] = await db.query('SELECT storedName FROM MediaItem WHERE id=?', [media.id]);
        files.push({ id: media.id, filename, storedName: row.storedName });
      }
      await page.goto(`/${locale}/admin/media`);
      await page.getByRole('group', { name: m.folder, exact: true }).getByRole('button', { name: folder, exact: true }).click();
      const first = page.getByRole('textbox', { name: m.alt + ' — ' + files[0].filename });
      const second = page.getByRole('textbox', { name: m.alt + ' — ' + files[1].filename });
      await expect(first).toHaveValue('Original 1');
      await expect(second).toHaveValue('Original 2');
      const url = '/api/admin/media/' + files[0].id;
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; }); gates.push(release);
      let fetched!: () => void;
      const committed = new Promise<void>(resolve => { fetched = resolve; });
      await page.route('**' + url, async route => {
        const response = await route.fetch(); fetched(); await held; await route.fulfill({ response });
      }, { times: 1 });
      await first.fill('Saved first بيانات');
      // The newer upload is earlier in the grid; traverse backward with native Tab.
      await first.press('Shift+Tab'); await committed;
      for (let step = 0; step < 16 && !(await second.evaluate(node => node === document.activeElement)); step++) {
        await page.keyboard.press('Shift+Tab');
      }
      await expect(second).toBeFocused();
      await second.fill('Keep second draft نص');
      const delivered = page.waitForResponse(r => r.url().endsWith(url) && r.request().method() === 'PATCH');
      release(); expect((await delivered).status()).toBe(200);
      await expect(second).toHaveValue('Keep second draft نص'); await expect(second).toBeFocused();
      await expect(first).toHaveValue('Saved first بيانات');
      expect((await db.query('SELECT altText FROM MediaItem WHERE id=?', [files[0].id]))[0].altText).toBe('Saved first بيانات');

      // A failed blur-save preserves the focused draft and reports the failure.
      const secondUrl = '/api/admin/media/' + files[1].id;
      await page.route('**' + secondUrl, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'unavailable' }) }), { times: 1 });
      const failed = page.waitForResponse(r => r.url().endsWith(secondUrl) && r.request().method() === 'PATCH');
      await second.press('Tab'); expect((await failed).status()).toBe(503);
      await expect(second).toHaveValue('Keep second draft نص');
      await expect(page.locator('[data-sonner-toast][data-type="error"]').last()).toBeVisible();
      expect((await db.query('SELECT altText FROM MediaItem WHERE id=?', [files[1].id]))[0].altText).toBe('Original 2');
      const retried = page.waitForResponse(r => r.url().endsWith(secondUrl) && r.request().method() === 'PATCH');
      await second.click(); await second.press('Tab'); expect((await retried).status()).toBe(200);
      await expect(second).toHaveValue('Keep second draft نص');

      // An older response for the same file must leave its newer focused edit intact.
      let releaseOlder!: () => void;
      const olderGate = new Promise<void>(resolve => { releaseOlder = resolve; }); gates.push(releaseOlder);
      let olderFetched!: () => void;
      const olderCommitted = new Promise<void>(resolve => { olderFetched = resolve; });
      await page.route('**' + url, async route => { const response = await route.fetch(); olderFetched(); await olderGate; await route.fulfill({ response }); }, { times: 1 });
      await first.fill('Older submitted'); await first.press('Tab'); await olderCommitted;
      await first.click(); await first.fill('Newest retained تعديل');
      const olderResponse = page.waitForResponse(r => r.url().endsWith(url) && r.request().method() === 'PATCH');
      releaseOlder(); expect((await olderResponse).status()).toBe(200);
      await expect(first).toHaveValue('Newest retained تعديل'); await expect(first).toBeFocused();
      const newestResponse = page.waitForResponse(r => r.url().endsWith(url) && r.request().method() === 'PATCH');
      await first.press('Tab'); expect((await newestResponse).status()).toBe(200);
      await page.reload();
      await page.getByRole('group', { name: m.folder, exact: true }).getByRole('button', { name: folder, exact: true }).click();
      await expect(first).toHaveValue('Newest retained تعديل'); await expect(second).toHaveValue('Keep second draft نص');
      expect((await db.query('SELECT altText FROM MediaItem WHERE id=?', [files[0].id]))[0].altText).toBe('Newest retained تعديل');
      expect((await db.query('SELECT altText FROM MediaItem WHERE id=?', [files[1].id]))[0].altText).toBe('Keep second draft نص');
    } finally {
      for (const release of gates) release();
      await page.unrouteAll({ behavior: 'wait' });
      for (const file of files) {
        await db.query('DELETE FROM MediaItem WHERE id=?', [file.id]);
        await db.query('DELETE FROM AuditLog WHERE entityId=?', [file.id]);
        const { dataDir } = JSON.parse(readFileSync('.migration/e2e/storage.json', 'utf8'));
        try { unlinkSync(dataDir + '/uploads/' + file.storedName); } catch { /* Owned temporary file may already be removed. */ }
      }
      await db.destroy();
    }
  });
}
