import { createHash, randomBytes } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { checkRateLimit, type RateLimitResult } from './rate-policy.js';
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
// Existing source paths accept alphanumeric IDs; don't introduce hyphens into domain IDs.
export const newId = (): string => 'c'+randomBytes(15).toString('hex');
export async function transaction<T>(db: DataSource, work: (r: QueryRunner) => Promise<T>): Promise<T> {
  const r = db.createQueryRunner(); await r.connect(); await r.startTransaction('READ COMMITTED');
  try { const result = await work(r); await r.commitTransaction(); return result; }
  catch (error) { await r.rollbackTransaction(); throw error; } finally { await r.release(); }
}
export async function consumeRateLimit(db: DataSource, key: string, limits?: { shortMax: number; shortWindowMs: number; dailyMax: number; dailyWindowMs: number }): Promise<RateLimitResult> {
  return transaction(db, async r => {
    const bucket = sha256(key);
    await r.query("INSERT INTO RateLimitBucket(bucketKey,timestamps) VALUES(?,'[]') ON DUPLICATE KEY UPDATE bucketKey=bucketKey", [bucket]);
    const [row] = await r.query('SELECT timestamps FROM RateLimitBucket WHERE bucketKey=? FOR UPDATE',[bucket]);
    let timestamps: number[] = JSON.parse(row.timestamps);
    if (!Array.isArray(timestamps) || timestamps.some(t => !Number.isFinite(t))) throw new Error('Invalid rate bucket');
    const result = checkRateLimit({ get: () => ({ timestamps }), set: (_key,entry) => { timestamps = entry.timestamps; } },key,Date.now(),limits);
    await r.query('UPDATE RateLimitBucket SET timestamps=?,updatedAt=UTC_TIMESTAMP(3) WHERE bucketKey=?',[JSON.stringify(timestamps),bucket]);
    return result;
  });
}
export async function audit(r: QueryRunner, action: string, user: { id: string; email: string } | null, details: Record<string, unknown> | null = null, entityType = 'user', entityId: string | null = user?.id ?? null, ip?: string): Promise<void> {
  await r.query('INSERT INTO AuditLog(id,actorId,actorEmail,action,entityType,entityId,details,ipHash) VALUES(?,?,?,?,?,?,?,?)', [newId(),user?.id ?? null,user?.email ?? null,action,entityType,entityId,details ? JSON.stringify(details) : null,ip ? sha256('ip:'+ip) : null]);
}
export class AuthFault extends Error {
  constructor(readonly status: number, readonly code: string, readonly extra: Record<string, unknown> = {}) { super(code); }
}
