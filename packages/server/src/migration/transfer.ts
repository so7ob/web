import type { DataSource, QueryRunner } from 'typeorm';
import { constants, closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertSchema } from '../database/data-source.js';
import { schema, identifier as q } from '../database/schema.js';
import { canonicalRow, hash, orderedTables, primaryKey, readSnapshot, regularFile, safeDirectory, TransferError, type Row, type Snapshot } from './snapshot.js';
export interface TransferOptions {
  mode: 'dry-run' | 'apply' | 'resume' | 'verify'; sqlite: string; sourceUploads: string; targetUploads: string;
  expectedDatabase: string; writesPaused?: boolean;
}
export interface TableResult { sourceCount: number; destinationCount: number; sourceHash: string; destinationHash: string; idsMatch: boolean; valuesMatch: boolean }
export interface TransferReport {
  format: 1; snapshot: string; sqliteHash: string; mode: TransferOptions['mode']; startedAt: string; finishedAt?: string;
  status: 'preflight' | 'ready' | 'verified'; tables: Record<string, TableResult>; files: Snapshot['files'];
  unreferencedFiles: string[]; productionData: false | 'operator-supplied';
  sourceSchemaVersion: 1 | 2;
  mappingVersion: 2;
}
function stableRows(table: string, rows: Row[]): Row[] {
  const pk = primaryKey(table);
  return [...rows].sort((a,b) => Buffer.compare(Buffer.from(String(a[pk])), Buffer.from(String(b[pk]))));
}
async function compare(r: QueryRunner, snapshot: Snapshot, requireComplete: boolean): Promise<Record<string, TableResult>> {
  const results: Record<string, TableResult> = {};
  for (const table of orderedTables()) {
    const target: Row[] = (await r.query(`SELECT * FROM ${q(table)}`)).map((row: Record<string, unknown>) => canonicalRow(table, row));
    const source = stableRows(table, snapshot.rows[table]); const destination = stableRows(table, target);
    const pk = primaryKey(table); const index = new Map(source.map(row => [row[pk], JSON.stringify(row)]));
    // Never overwrite a destination record or silently ignore records absent from the snapshot.
    for (const row of target) if (index.get(row[pk]) !== JSON.stringify(row)) throw new TransferError(`Destination conflict in ${table}; no overwrite performed`);
    const sourceHash = hash(JSON.stringify(source)); const destinationHash = hash(JSON.stringify(destination));
    results[table] = { sourceCount: source.length, destinationCount: destination.length, sourceHash, destinationHash,
      idsMatch: JSON.stringify(source.map(row => row[pk])) === JSON.stringify(destination.map(row => row[pk])), valuesMatch: sourceHash === destinationHash };
    if (requireComplete && !results[table].valuesMatch) throw new TransferError(`Incomplete destination table ${table}`);
  }
  return results;
}
function checkFiles(snapshot: Snapshot, target: string, complete: boolean): void {
  if (!existsSync(target)) { if (complete && snapshot.files.length) throw new TransferError('Destination uploads missing'); return; }
  safeDirectory(target);
  const known = new Map(snapshot.files.map(f => [f.name, f]));
  for (const name of readdirSync(target)) {
    const expected = known.get(name);
    // Temporary files are never discarded automatically; an interrupted copy must be reviewed.
    if (!expected || hash(regularFile(join(target, name))) !== expected.sha256) throw new TransferError('Unknown or conflicting destination file');
  }
  if (complete && snapshot.files.some(f => !existsSync(join(target, f.name)))) throw new TransferError('Destination file missing');
}
function copyFiles(snapshot: Snapshot, target: string): void {
  mkdirSync(target, { recursive: true, mode: 0o700 }); safeDirectory(target);
  for (const entry of snapshot.files) {
    const final = join(target, entry.name); if (existsSync(final)) continue;
    const bytes = regularFile(join(snapshot.uploads, entry.name));
    if (hash(bytes) !== entry.sha256) throw new TransferError('Source file changed during transfer');
    // Atomic no-clobber publication. Temp lives outside uploads so crash resume can continue.
    const temporary = join(resolve(target, '..'), `.so7ob-transfer-${randomUUID()}`);
    const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    try { linkSync(temporary, final); } finally { unlinkSync(temporary); }
    const dirFd = openSync(target, constants.O_RDONLY); try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
  }
}
function separatePaths(source: string, destination: string): void {
  const delta = relative(resolve(source), resolve(destination));
  if (!delta || (!delta.startsWith('..') && !delta.startsWith('/'))) throw new TransferError('Source and destination paths must be disjoint');
}
export async function transfer(db: DataSource, options: TransferOptions): Promise<TransferReport> {
  if (!['dry-run', 'apply', 'resume', 'verify'].includes(options.mode)) throw new TransferError('Unknown migration mode');
  if (db.options.database !== options.expectedDatabase) throw new TransferError('Explicit database confirmation does not match connection');
  const writing = options.mode === 'apply' || options.mode === 'resume';
  if (writing && !options.writesPaused) throw new TransferError('Apply/resume requires offline destination and writes-paused acknowledgement');
  const target = resolve(options.targetUploads); const source = safeDirectory(options.sourceUploads);
  separatePaths(source, target); separatePaths(target, source);
  // Even a missing destination directory may not have symlinked parents.
  let ancestor = target; while (!existsSync(ancestor)) ancestor = resolve(ancestor, '..'); safeDirectory(ancestor);
  const snapshot = readSnapshot(options.sqlite, source);
  const report: TransferReport = { format: 1, snapshot: snapshot.id, sqliteHash: snapshot.sqliteHash, sourceSchemaVersion: snapshot.sourceSchemaVersion, mappingVersion: 2, mode: options.mode,
    startedAt: new Date().toISOString(), status: 'preflight', tables: {}, files: snapshot.files,
    unreferencedFiles: snapshot.files.filter(f => !f.references.length).map(f => f.name), productionData: 'operator-supplied' };
  await assertSchema(db);
  const r = db.createQueryRunner(); await r.connect(); let locked = false;
  try {
    const lock = await r.query('SELECT GET_LOCK(?,0) AS acquired', [`so7ob-transfer:${options.expectedDatabase}`]);
    if (Number(lock[0].acquired) !== 1) throw new TransferError('Another migration owns the destination lock'); locked = true;
    report.tables = await compare(r, snapshot, options.mode === 'verify');
    checkFiles(snapshot, target, options.mode === 'verify');
    const journals: Array<{ id: string; targetPathHash: string; completedTables: string }> = await r.query('SELECT id,targetPathHash,completedTables FROM MigrationTransfer');
    if (journals.some(j => j.id !== snapshot.id || (options.mode !== 'verify' && j.targetPathHash !== hash(target)))) throw new TransferError('Destination belongs to another snapshot/path; use a separate destination');
    if (options.mode === 'resume' && !journals.length) throw new TransferError('No matching transfer to resume; use apply');
    if (writing) {
      if (!journals.length) await r.query('INSERT INTO MigrationTransfer(id,sqliteHash,filesHash,targetPathHash,status,completedTables) VALUES(?,?,?,?,?,?)', [snapshot.id, snapshot.sqliteHash, hash(JSON.stringify(snapshot.files)), hash(target), 'copying', '[]']);
      copyFiles(snapshot, target);
      const completed: string[] = [];
      for (const table of orderedTables()) {
        await r.startTransaction('SERIALIZABLE');
        try {
          const pk = primaryKey(table); const columns = Object.keys(schema[table].columns);
          const existing = new Set((await r.query(`SELECT ${q(pk)} FROM ${q(table)} FOR UPDATE`)).map((row: Row) => row[pk]));
          for (const row of snapshot.rows[table]) {
            if (existing.has(row[pk])) continue;
            const values = columns.map(k => schema[table].columns[k].type === 'DateTime' && row[k] !== null ? new Date(String(row[k])) : row[k]);
            await r.query(`INSERT INTO ${q(table)} (${columns.map(q).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
          }
          completed.push(table);
          await r.query('UPDATE MigrationTransfer SET completedTables=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?', [JSON.stringify(completed), snapshot.id]);
          await r.commitTransaction();
        } catch (error) { await r.rollbackTransaction(); throw error; }
      }
      report.tables = await compare(r, snapshot, true); checkFiles(snapshot, target, true);
      await r.query("UPDATE MigrationTransfer SET status='verified',updatedAt=UTC_TIMESTAMP(3) WHERE id=?", [snapshot.id]);
    }
    // Detect concurrent changes to either source before reporting success.
    if (readSnapshot(options.sqlite, source).id !== snapshot.id) throw new TransferError('Source snapshot or files changed during transfer');
    report.status = options.mode === 'dry-run' ? 'ready' : 'verified'; report.finishedAt = new Date().toISOString();
    return report;
  } finally {
    if (locked) await r.query('SELECT RELEASE_LOCK(?)', [`so7ob-transfer:${options.expectedDatabase}`]);
    await r.release();
  }
}
