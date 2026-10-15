// Only the parent regression launches this isolated runner; never a catalog case.
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { test, configurationSettings, differentPhone } from '../admin-configuration-fixture';

test('intentional body timeout after settings and menu writes', async ({ configuration }, info) => {
  const { request, headers, original } = configuration;
  expect((await request.patch('/api/admin/settings', { headers, data: {
    'contact.phone': differentPhone(original['contact.phone']),
    'announcement.enabled': original['announcement.enabled'] === 'true' ? 'false' : 'true',
    'announcement.messageAr': 'Synthetic timeout عربي', 'announcement.messageEn': 'Synthetic timeout English',
  } })).status()).toBe(200);
  expect((await request.put('/api/admin/menus', { headers, data: { location: 'header', items: [
    { labelAr: 'قائمة اصطناعية', labelEn: 'Synthetic timeout menu', url: '/ar', enabled: true },
  ] } })).status()).toBe(200);
  // Trigger the actual runner deadline only after writes succeeded. The fixture
  // still has its own timeout and API context when this body is interrupted.
  info.setTimeout(1);
  await new Promise(() => {});
});

test('next case sees restored settings and identical menu IDs and rows', async ({ configuration }) => {
  const snapshot = JSON.parse(readFileSync(process.env.SO7OB_CONFIGURATION_SNAPSHOT!, 'utf8'));
  expect(configurationSettings((await (await configuration.request.get('/api/admin/settings')).json()).settings)).toEqual(snapshot.settings);
  expect(JSON.parse(JSON.stringify(await configuration.db.query("SELECT * FROM MenuItem WHERE location='header' ORDER BY id")))).toEqual(snapshot.menus);
});
