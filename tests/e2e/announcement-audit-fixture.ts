import { test as base } from './admin-configuration-fixture';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const test = base.extend<{ quotaSnapshot: { directory: string; key: string; before: Array<Record<string, unknown>> } }>({
  quotaSnapshot: [async ({ configuration }, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'so7ob-announcement-quota-'));
    const key = createHash('sha256').update('login:127.0.0.1').digest('hex');
    const [original] = await configuration.db.query('SELECT * FROM RateLimitBucket WHERE bucketKey=?', [key]);
    try {
      const full = Array.from({ length: 30 }, (_, index) => Date.now() - index);
      await configuration.db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps) VALUES(?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps)', [key, JSON.stringify(full)]);
      const before = await configuration.db.query('SELECT * FROM RateLimitBucket WHERE bucketKey=?', [key]);
      await use({ directory, key, before });
    } finally {
      try {
        if (original) await configuration.db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps,updatedAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps),updatedAt=VALUES(updatedAt)', [key, original.timestamps, original.updatedAt]);
        else await configuration.db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [key]);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  }, { timeout: 30000 }],
});
