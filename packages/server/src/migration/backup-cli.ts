import { parseArgs } from 'node:util';
import { createDataSource, assertSchema } from '../database/data-source.js';
import { backup, restore } from './backup.js';
import { TransferError } from './snapshot.js';
const { values } = parseArgs({ options: { mode: { type: 'string' }, directory: { type: 'string' }, uploads: { type: 'string' }, 'confirm-database': { type: 'string' } } });
if (!values.directory || !values.uploads || !values['confirm-database'] || !['backup','restore'].includes(values.mode ?? '')) throw new TransferError('Required: --mode backup|restore --directory ABSOLUTE --uploads ABSOLUTE --confirm-database NAME');
const db = createDataSource();
try {
  await db.initialize();
  if (values.mode === 'backup') { await assertSchema(db); await backup(process.env, values.uploads, values.directory, values['confirm-database']); }
  else { await restore(db, process.env, values.directory, values.uploads, values['confirm-database']); await assertSchema(db); }
  process.stdout.write('Backup/restore finished. Keep writes paused until independent row/file reconciliation passes.\n');
} catch (error) {
  process.stderr.write((error instanceof TransferError ? error.message : 'Backup/restore failed; keep writes paused and inspect the isolated target')+'\n'); process.exitCode = 1;
} finally { if (db.isInitialized) await db.destroy(); }
