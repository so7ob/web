import { expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
import { test as base } from './quota-fixture';

const settingKeys = ['contact.phone', 'announcement.enabled', 'announcement.messageAr', 'announcement.messageEn'];
export const differentPhone = (current: string | undefined) => current === '+967 123456789' ? '+967 987654321' : '+967 123456789';
export const configurationSettings = (settings: Record<string, string>) => Object.fromEntries(settingKeys.map(key => [key, settings[key] ?? (key === 'announcement.enabled' ? 'false' : '')]));

export const test = base.extend<{ configuration: {
  request: APIRequestContext;
  headers: Record<string, string>;
  original: Record<string, string>;
  menuSnapshot: Array<Record<string, unknown> & { id: string }>;
  db: ReturnType<typeof createDataSource>;
  prefix: string;
} }>({
  storageState: async ({ configuration }, use) => {
    await use(await configuration.request.storageState());
  },
  configuration: [async ({ playwright, baseURL, preserveLoginQuota }, use) => {
    // storageState can request this fixture before automatic test fixtures.
    // Explicitly bracket its login too, so added cases cannot leak quota.
    void preserveLoginQuota;
    // This context survives a body deadline and does not depend on page.request.
    const request = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true, timeout: 10000 });
    const db = await createDataSource().initialize();
    try {
      const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
      const { csrfToken } = await (await request.get('/api/auth/csrf')).json();
      expect((await request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
      const headers = { 'x-csrf-token': csrfToken };
      const original = configurationSettings((await (await request.get('/api/admin/settings')).json()).settings);
      const menus = (await (await request.get('/api/admin/menus')).json()).header;
      const menuSnapshot = await db.query("SELECT * FROM MenuItem WHERE location='header' ORDER BY id");
      expect(menus).toHaveLength(menuSnapshot.length);
      try {
        await use({ request, headers, original, menuSnapshot, db, prefix });
      } finally {
        try {
          expect((await request.patch('/api/admin/settings', { headers, data: original })).status()).toBe(200);
          expect(configurationSettings((await (await request.get('/api/admin/settings')).json()).settings)).toEqual(original);
        } finally {
          // The API replaces IDs: restore exact rows even if settings restoration fails.
          await db.transaction(async manager => {
            await manager.query("DELETE FROM MenuItem WHERE location='header'");
            for (const row of menuSnapshot) {
              const columns = Object.keys(row);
              await manager.query('INSERT INTO MenuItem (' + columns.map(key => '`' + key + '`').join(',') + ') VALUES (' + columns.map(() => '?').join(',') + ')', columns.map(key => row[key]));
            }
          });
          expect(await db.query("SELECT * FROM MenuItem WHERE location='header' ORDER BY id")).toEqual(menuSnapshot);
        }
      }
    } finally {
      try { await request.dispose(); } finally { await db.destroy(); }
    }
  }, { timeout: 30000 }],
});
