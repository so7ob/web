import type { DataSource } from 'typeorm';
import { assertSchema } from '../database/data-source.js';
import { PayloadCipher } from '../queue/crypto.js';
import { WebhookCipher } from '../queue/webhook.js';
import { TransferError } from './snapshot.js';

/** Read-only key preflight. Run before starting workers against a recovered database. */
export async function verifyRecoveryKeys(db: DataSource, env: NodeJS.ProcessEnv, expectedDatabase: string) {
  if (env.MIGRATION_WRITES_PAUSED !== 'yes' || !expectedDatabase || env.DATABASE_NAME !== expectedDatabase || db.options.database !== expectedDatabase)
    throw new TransferError('Recovery verification requires confirmed database and paused writes including workers');
  if (!env.OUTBOX_KEY || !/^[a-fA-F0-9]{64}$/.test(env.OUTBOX_KEY)) throw new TransferError('Independent recovered OUTBOX_KEY required');
  await assertSchema(db);
  const ciphers = { MailJob: new PayloadCipher(env.OUTBOX_KEY), WebhookJob: new WebhookCipher(env.OUTBOX_KEY) };
  const checked = { MailJob: 0, WebhookJob: 0 };
  for (const table of ['MailJob', 'WebhookJob'] as const) {
    let after: string | undefined;
    for (;;) {
      const rows: Array<{ id: string; payload: string }> = await db.query(`SELECT id,payload FROM ${table}${after === undefined ? '' : ' WHERE id>?'} ORDER BY id LIMIT 100`, after === undefined ? [] : [after]);
      if (!rows.length) break;
      for (const row of rows) {
        try { ciphers[table].decrypt(row.payload, row.id); }
        catch { throw new TransferError('Recovered queue key or encrypted payload is invalid; keep workers stopped'); }
        checked[table]++;
      }
      after = rows[rows.length - 1].id;
    }
  }
  return { ok: true, checked };
}
