import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertSchema, createDataSource } from '../database/data-source.js';
import { transaction } from './persistence.js';

const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name)) throw new Error('Real isolated MariaDB required');
const db = createDataSource({ ...process.env, DATABASE_NAME: name });
const keys = Array.from({ length: 3 }, () => randomBytes(32).toString('hex'));

beforeAll(async () => { await db.initialize(); await assertSchema(db); });
afterAll(async () => {
  vi.restoreAllMocks();
  if (db.isInitialized) {
    try { await db.query('DELETE FROM RateLimitBucket WHERE bucketKey IN (?,?,?)', keys); }
    finally { await db.destroy(); }
  }
});

describe('real MariaDB transaction recovery', () => {
  it('rolls back writes and preserves the original work error', async () => {
    const failure = new Error('synthetic operation failure');
    await expect(transaction(db, async r => {
      await r.query("INSERT INTO RateLimitBucket(bucketKey,timestamps) VALUES(?,'[]')", [keys[0]]);
      throw failure;
    })).rejects.toBe(failure);
    expect(await db.query('SELECT bucketKey FROM RateLimitBucket WHERE bucketKey=?', [keys[0]])).toEqual([]);
  });

  it('rolls back a commit failure before dispatch and releases the runner', async () => {
    const runner = db.createQueryRunner();
    const failure = new Error('synthetic pre-commit failure');
    const commit = vi.spyOn(runner, 'commitTransaction').mockRejectedValueOnce(failure);
    const create = vi.spyOn(db, 'createQueryRunner').mockReturnValueOnce(runner);
    try {
      await expect(transaction(db, async r => {
        await r.query("INSERT INTO RateLimitBucket(bucketKey,timestamps) VALUES(?,'[]')", [keys[1]]);
      })).rejects.toBe(failure);
      expect(runner.isTransactionActive).toBe(false);
      expect(runner.isReleased).toBe(true);
    } finally { create.mockRestore(); commit.mockRestore(); }
    expect(await db.query('SELECT bucketKey FROM RateLimitBucket WHERE bucketKey=?', [keys[1]])).toEqual([]);
  });

  it('releases more failed starts than the pool capacity and remains usable', async () => {
    for (let i = 0; i < 12; i++) {
      const runner = db.createQueryRunner();
      const failure = new Error('synthetic start failure');
      const start = vi.spyOn(runner, 'startTransaction').mockRejectedValueOnce(failure);
      const create = vi.spyOn(db, 'createQueryRunner').mockReturnValueOnce(runner);
      try {
        await expect(transaction(db, async () => { throw new Error('work must not execute'); })).rejects.toBe(failure);
        expect(runner.isReleased).toBe(true);
      } finally { create.mockRestore(); start.mockRestore(); }
    }
    await expect(transaction(db, async r => {
      const [row] = await r.query('SELECT 1 AS ready');
      return row.ready;
    })).resolves.toBe(1);
  });

  it('keeps concurrent locked updates atomic after recovery', async () => {
    await db.query("INSERT INTO RateLimitBucket(bucketKey,timestamps) VALUES(?,'[]')", [keys[2]]);
    await Promise.all(Array.from({ length: 12 }, (_, i) => transaction(db, async r => {
      const [row] = await r.query('SELECT timestamps FROM RateLimitBucket WHERE bucketKey=? FOR UPDATE', [keys[2]]);
      const values: number[] = JSON.parse(row.timestamps);
      values.push(i);
      await r.query('UPDATE RateLimitBucket SET timestamps=? WHERE bucketKey=?', [JSON.stringify(values), keys[2]]);
    })));
    const [row] = await db.query('SELECT timestamps FROM RateLimitBucket WHERE bucketKey=?', [keys[2]]);
    expect(JSON.parse(row.timestamps).sort((a: number, b: number) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
});
