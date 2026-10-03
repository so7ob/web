import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createDataSource, assertSchema } from './data-source.js';
import { schema } from './schema.js';
const env = { ...process.env, DATABASE_NAME: process.env.TEST_DATABASE_NAME };
if (!env.DATABASE_NAME || !/^so7ob_[a-z0-9_]+_test$/.test(env.DATABASE_NAME)) throw new Error('TEST_DATABASE_NAME must name an isolated so7ob_*_test database');
const db = createDataSource(env);
const prefix = `test${randomBytes(6).toString('hex')}`;
beforeAll(async () => { await db.initialize(); await db.runMigrations(); }, 30000);
afterAll(async () => {
  if (db.isInitialized) {
    await db.query('DELETE FROM User WHERE id LIKE ?', [`${prefix}%`]);
    await db.query('DELETE FROM Role WHERE `key` LIKE ?', [`${prefix}%`]);
    await db.destroy();
  }
});
describe('Website schema on real MariaDB', () => {
  it('applies explicit migrations once and retains all source fields', async () => {
    expect(await db.runMigrations()).toEqual([]); await assertSchema(db);
    const columns: Array<{ TABLE_NAME: string; COLUMN_NAME: string }> = await db.query('SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=?', [env.DATABASE_NAME]);
    for (const [table, model] of Object.entries(schema)) for (const name of Object.keys(model.columns)) {
      expect(columns.some(c => c.TABLE_NAME === table && c.COLUMN_NAME === name), `${table}.${name}`).toBe(true);
    }
    expect(db.options.synchronize).toBe(false);
  });
  it('preserves SQLite binary uniqueness including case and trailing spaces', async () => {
    for (const suffix of ['Case', 'case', 'case ']) await db.query('INSERT INTO Role (`key`,nameAr,nameEn) VALUES (?,?,?)', [prefix + suffix, 'دور اصطناعي 😀', suffix]);
    const rows: Array<{ key: string }> = await db.query('SELECT `key` FROM Role WHERE `key` IN (?,?,?)', [prefix+'Case',prefix+'case',prefix+'case ']);
    expect(new Set(rows.map(r => r.key)).size).toBe(3);
    await expect(db.query('INSERT INTO Role (`key`,nameAr,nameEn) VALUES (?,?,?)', [prefix+'Case','x','x'])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
  it('rejects orphan ownership while retaining nullable values, JSON text and UTC milliseconds', async () => {
    const insert = 'INSERT INTO User (id,email,passwordHash,name,roleKey,createdAt) VALUES (?,?,?,?,?,?)';
    const instant = new Date('2026-10-02T00:01:02.123Z');
    await expect(db.query(insert, [prefix+'orphan',prefix+'orphan@example.invalid','synthetic','Synthetic',prefix+'missing',instant])).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
    await db.query(insert, [prefix+'user',prefix+'@example.invalid','synthetic','Synthetic',prefix+'Case',instant]);
    const rows: Array<{ phone: string | null; createdAt: Date }> = await db.query('SELECT phone,createdAt FROM User WHERE id=?', [prefix+'user']);
    expect(rows[0].phone).toBeNull(); expect(rows[0].createdAt.toISOString()).toBe(instant.toISOString());
  });
  it('uses UTC defaults even when the MariaDB session timezone differs', async () => {
    const r = db.createQueryRunner(); await r.connect();
    try {
      await r.query("SET time_zone='+03:00'");
      const before = Date.now();
      await r.query('INSERT INTO Role (`key`,nameAr,nameEn) VALUES (?,?,?)',[prefix+'timezone','توقيت','Timezone']);
      const [row] = await r.query('SELECT createdAt,updatedAt FROM Role WHERE `key`=?',[prefix+'timezone']);
      expect(Math.abs(row.createdAt.valueOf()-before)).toBeLessThan(2000);
      expect(Math.abs(row.updatedAt.valueOf()-before)).toBeLessThan(2000);
    } finally { await r.query("SET time_zone='SYSTEM'"); await r.release(); }
  });
  it('refuses an unreviewed destructive down migration', async () => {
    await expect(db.undoLastMigration({ transaction: 'none' })).rejects.toThrow('Destructive schema rollback is disabled');
    await assertSchema(db);
  });
});
