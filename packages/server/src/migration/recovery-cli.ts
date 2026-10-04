import { parseArgs } from 'node:util';
import { createDataSource } from '../database/data-source.js';
import { verifyRecoveryKeys } from './recovery.js';
const { values } = parseArgs({ options: { 'confirm-database': { type: 'string' } } });
if (!values['confirm-database']) throw new Error('--confirm-database is required');
const db = createDataSource();
try {
  await db.initialize();
  process.stdout.write(JSON.stringify(await verifyRecoveryKeys(db, process.env, values['confirm-database'])) + '\n');
} catch {
  process.stderr.write('Recovery key verification failed; keep API and workers stopped. Check database, schema and independently restored key.\n');
  process.exitCode = 1;
} finally { if (db.isInitialized) await db.destroy(); }
