// Invoked only by the parent regression against its isolated loopback server.
import { expect } from '@playwright/test';
import { sha256 } from '@so7ob/server';
import { test } from '../admin-configuration-fixture';

test('configuration authentication is inside the quota fixture and restores a full prior bucket', async ({ configuration }) => {
  expect((await configuration.request.get('/api/admin/settings')).status()).toBe(200);
  const [bucket] = await configuration.db.query('SELECT timestamps FROM RateLimitBucket WHERE bucketKey=?', [sha256('login:127.0.0.1')]);
  expect(JSON.parse(bucket.timestamps)).toHaveLength(1);
});
