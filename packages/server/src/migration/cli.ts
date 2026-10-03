import { parseArgs } from 'node:util';
import { writeFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createDataSource } from '../database/data-source.js';
import { transfer, type TransferOptions } from './transfer.js';
import { TransferError } from './snapshot.js';
const { values } = parseArgs({ options: {
  mode: { type: 'string' }, sqlite: { type: 'string' }, 'source-uploads': { type: 'string' },
  'target-uploads': { type: 'string' }, 'confirm-database': { type: 'string' }, report: { type: 'string' },
} });
for (const key of ['mode','sqlite','source-uploads','target-uploads','confirm-database','report'] as const) if (!values[key]) throw new TransferError(`--${key} is required`);
const report = resolve(values.report!);
if (!isAbsolute(values.report!) || existsSync(report) || realpathSync(dirname(report)) !== dirname(report)) throw new TransferError('Report must be a new absolute path with a real parent directory');
for (const path of [values.sqlite!, values['source-uploads']!, values['target-uploads']!]) {
  const rel = relative(resolve(path), report);
  if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw new TransferError('Report must be separate from source and destination data');
}
const db = createDataSource();
try {
  await db.initialize();
  const result = await transfer(db, { mode: values.mode as TransferOptions['mode'], sqlite: values.sqlite!, sourceUploads: values['source-uploads']!, targetUploads: values['target-uploads']!, expectedDatabase: values['confirm-database']!, writesPaused: process.env.MIGRATION_WRITES_PAUSED === 'yes' });
  writeFileSync(report, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ status: result.status, snapshot: result.snapshot, tables: Object.keys(result.tables).length, files: result.files.length }) + '\n');
} catch (error) {
  // Never print driver SQL parameters, password hashes or source records.
  const message = error instanceof TransferError ? error.message : 'Transfer failed; destination remains offline. Inspect safely and resume the same snapshot.';
  writeFileSync(report, JSON.stringify({ status: 'failed', message, time: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
  process.stderr.write(message + '\n'); process.exitCode = 1;
} finally { if (db.isInitialized) await db.destroy(); }
