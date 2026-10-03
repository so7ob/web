import { randomBytes } from 'node:crypto';
import type { QueryRunner } from 'typeorm';
import { newId, sha256 } from './persistence.js';
export const TOKEN_TTL = { email_verify: 86400000, password_reset: 1800000, request_claim: 86400000 } as const;
export type TokenType = keyof typeof TOKEN_TTL;
export async function issueToken(r: QueryRunner, userId: string, type: TokenType, resourceId: string | null = null) {
  if (!r.isTransactionActive || (type === 'request_claim' && !resourceId)) throw new Error('Bound token issuance requires a transaction');
  const raw = randomBytes(32).toString('hex'); const expiresAt = new Date(Date.now()+TOKEN_TTL[type]);
  await r.query('DELETE FROM AuthToken WHERE userId=? AND type=? AND resourceId<=>? AND usedAt IS NULL',[userId,type,resourceId]);
  await r.query('INSERT INTO AuthToken(id,userId,tokenHash,type,resourceId,expiresAt) VALUES(?,?,?,?,?,?)',[newId(),userId,sha256(raw),type,resourceId,expiresAt]);
  return { raw, expiresAt };
}
export async function consumeToken(r: QueryRunner, raw: string, type: TokenType, scope: { userId?: string; resourceId?: string } = {}): Promise<string | null> {
  if (!r.isTransactionActive || !/^[a-f0-9]{64}$/.test(raw) || (type === 'request_claim' && (!scope.userId || !scope.resourceId))) return null;
  // Conditional update is atomic; no read-then-consume race or expiry extension.
  const result = await r.query(`UPDATE AuthToken t JOIN User u ON u.id=t.userId SET t.usedAt=UTC_TIMESTAMP(3)
    WHERE t.tokenHash=? AND t.type=? AND t.resourceId<=>? AND (? IS NULL OR t.userId=?)
    AND t.usedAt IS NULL AND t.expiresAt>UTC_TIMESTAMP(3) AND u.status<>'suspended'`,[sha256(raw),type,scope.resourceId ?? null,scope.userId ?? null,scope.userId ?? null]);
  if (result.affectedRows !== 1) return null;
  const [row] = await r.query('SELECT userId FROM AuthToken WHERE tokenHash=?',[sha256(raw)]); return row.userId;
}
