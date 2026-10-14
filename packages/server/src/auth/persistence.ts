import {writeAudit,type AuditWriteOptions} from '../audit/writer.js';
import { createHash, randomBytes } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { checkRateLimit, type RateLimitResult } from './rate-policy.js';
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
// Existing source paths accept alphanumeric IDs; don't introduce hyphens into domain IDs.
export const newId = (): string => 'c'+randomBytes(15).toString('hex');
export async function transaction<T>(db: DataSource, work: (r: QueryRunner) => Promise<T>): Promise<T> {
  const r = db.createQueryRunner();
  let failed = false;
  let failure: unknown;
  let result!: T;
  try {
    await r.connect();
    await r.startTransaction('READ COMMITTED');
    result = await work(r);
    await r.commitTransaction();
  } catch (error) {
    failed = true;
    failure = error;
    if (r.isTransactionActive) {
      try { await r.rollbackTransaction(); }
      catch { /* Preserve the operation/start/commit failure for its caller. */ }
    }
  }
  // Cleanup must not replace the original failure, even when it was undefined.
  try { await r.release(); }
  catch (error) { if (!failed) throw error; }
  if (failed) throw failure;
  return result;
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
export async function audit(r: QueryRunner, action: string, user: { id: string; email: string; name?:string;roleKey?:string } | null, details: Record<string, unknown> | null, entityType: string, entityId: string | null, ip?: string, options:AuditWriteOptions={}): Promise<void> {
  await writeAudit(r,action,user,details,entityType,entityId,ip,options);
}
export class AuthFault extends Error {
  constructor(readonly status: number, readonly code: string, readonly extra: Record<string, unknown> = {}) { super(code); }
}
