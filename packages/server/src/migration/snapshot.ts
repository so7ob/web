import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { constants, lstatSync, openSync, closeSync, readFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { schema, identifier as q, type ColumnDefinition } from '../database/schema.js';
export type Value = string | number | null;
export type Row = Record<string, Value>;
export interface FileEntry { name: string; size: number; sha256: string; references: string[] }
export interface Snapshot { id: string; sqliteHash: string; rows: Record<string, Row[]>; files: FileEntry[]; uploads: string }
export class TransferError extends Error {}
export function hash(data: string | Buffer): string { return createHash('sha256').update(data).digest('hex'); }
export function regularFile(path: string): Buffer {
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new TransferError('Expected a regular file, never a symlink');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return readFileSync(fd); } finally { closeSync(fd); }
}
export function safeDirectory(path: string): string {
  const absolute = resolve(path);
  if (absolute !== realpathSync(absolute) || !lstatSync(absolute).isDirectory()) throw new TransferError('Directory must exist and contain no symlink components');
  return absolute;
}
export function safeName(name: string): boolean { return !!name && basename(name) === name && name !== '.' && name !== '..' && !/[\\\0]/u.test(name); }
export function normalize(value: unknown, c: ColumnDefinition): Value {
  if (value === null) { if (!c.nullable) throw new TransferError('NULL in non-nullable column'); return null; }
  if (c.type === 'DateTime') {
    let date: Date;
    if (value instanceof Date) date = value;
    else if (typeof value === 'number' && Number.isSafeInteger(value)) date = new Date(value);
    else if (typeof value === 'string' && /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)?$/.test(value)) {
      date = new Date(value.replace(' ', 'T') + (/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? '' : 'Z'));
    } else throw new TransferError('Unsupported date representation; explicit UTC conversion required');
    if (!Number.isFinite(date.valueOf()) || date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9999) throw new TransferError('Date outside MariaDB range');
    return date.toISOString();
  }
  if (c.type === 'String') {
    if (typeof value !== 'string' || value.includes('\0') || value !== Buffer.from(value, 'utf8').toString('utf8')) throw new TransferError('Invalid UTF-8 string');
    if (c.indexed && [...value].length > 255) throw new TransferError('Indexed string exceeds VARCHAR(255); schema review required');
    return value;
  }
  if (c.type === 'Boolean') {
    if (![true, false, 0, 1].includes(value as boolean | number)) throw new TransferError('Invalid boolean');
    return value === true || value === 1 ? 1 : 0;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || (c.type === 'Int' && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647))) throw new TransferError('Number outside destination range');
  return value;
}
export function canonicalRow(table: string, row: Record<string, unknown>): Row {
  return Object.fromEntries(Object.entries(schema[table].columns).map(([key, c]) => [key, normalize(row[key], c)]));
}
export function primaryKey(table: string): string { return Object.keys(schema[table].columns).find(k => schema[table].columns[k].primary)!; }
export function orderedTables(): string[] {
  const remaining = new Set(Object.keys(schema)); const done: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter(t => Object.values(schema[t].relations).every(r => !r.fields.length || !remaining.has(r.model)));
    if (!ready.length) throw new TransferError('Cyclic schema requires an explicit migration strategy');
    for (const t of ready) { done.push(t); remaining.delete(t); }
  }
  return done;
}
export function readSnapshot(sqlitePath: string, uploadPath: string): Snapshot {
  const path = resolve(sqlitePath); const uploads = safeDirectory(uploadPath);
  if (path !== realpathSync(path) || ['-wal', '-shm', '-journal'].some(suffix => existsSync(path + suffix))) throw new TransferError('Use a closed SQLite backup with no WAL/journal or symlinks');
  const sqliteHash = hash(regularFile(path));
  const sqlite = new DatabaseSync(path, { readOnly: true });
  const rows: Record<string, Row[]> = {};
  try {
    sqlite.exec('BEGIN');
    if (JSON.stringify(sqlite.prepare('PRAGMA integrity_check').all()) !== '[{"integrity_check":"ok"}]') throw new TransferError('SQLite integrity check failed');
    if (sqlite.prepare('PRAGMA foreign_key_check').all().length) throw new TransferError('SQLite contains orphan foreign keys');
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => String(r.name));
    if (tables.some(t => t !== '_prisma_migrations' && !schema[t])) throw new TransferError('Unknown source tables would be lost; schema review required');
    for (const [table, model] of Object.entries(schema)) {
      const actual = sqlite.prepare(`PRAGMA table_info(${q(table)})`).all().map(r => String(r.name)).sort();
      if (JSON.stringify(actual) !== JSON.stringify(Object.keys(model.columns).sort())) throw new TransferError(`Source schema mismatch in ${table}`);
      rows[table] = sqlite.prepare(`SELECT * FROM ${q(table)} ORDER BY ${q(primaryKey(table))} COLLATE BINARY`).all().map(r => canonicalRow(table, r));
    }
    sqlite.exec('ROLLBACK');
  } finally { sqlite.close(); }
  if (sqliteHash !== hash(regularFile(path))) throw new TransferError('SQLite snapshot changed while reading');
  // Validate from the pinned contract even if a source database had FK enforcement disabled.
  for (const [table, model] of Object.entries(schema)) {
    for (const relation of Object.values(model.relations)) {
      if (!relation.fields.length) continue;
      const referenced = new Set(rows[relation.model].map(row => JSON.stringify(relation.references.map(key => row[key]))));
      for (const row of rows[table]) {
        const values = relation.fields.map(key => row[key]);
        if (!values.includes(null) && !referenced.has(JSON.stringify(values))) throw new TransferError(`Orphan relation in ${table}`);
      }
    }
    const uniques = [...Object.entries(model.columns).filter(([, c]) => c.primary || c.unique).map(([key]) => [key]), ...model.uniques];
    for (const fields of uniques) {
      const seen = new Set<string>();
      for (const row of rows[table]) {
        const values = fields.map(k => row[k]); if (values.includes(null)) continue;
        const key = JSON.stringify(values); if (seen.has(key)) throw new TransferError(`Duplicate unique value in ${table}`); seen.add(key);
      }
    }
  }
  const files: FileEntry[] = [];
  const references = new Map<string, Array<{ id: string; size: number }>>();
  for (const table of ['Attachment', 'MediaItem']) for (const row of rows[table]) {
    const name = String(row.storedName);
    if (!safeName(name)) throw new TransferError('Unsafe stored file name');
    const list = references.get(name) ?? []; list.push({ id: `${table}:${row.id}`, size: Number(row.size) }); references.set(name, list);
    if (table === 'Attachment' && row.messageId !== null) {
      const request = rows.RequestMessage.find(m => m.id === row.messageId && m.requestId === row.requestId && row.inquiryId === null);
      const inquiry = rows.InquiryMessage.find(m => m.id === row.messageId && m.inquiryId === row.inquiryId && row.requestId === null);
      if (!request && !inquiry) throw new TransferError('Orphan or cross-record attachment message link');
    }
  }
  for (const name of readdirSync(uploads).sort()) {
    if (!safeName(name)) throw new TransferError('Unsafe upload file name');
    const bytes = regularFile(join(uploads, name)); const refs = references.get(name) ?? [];
    if (refs.some(r => r.size !== bytes.length)) throw new TransferError('Attachment metadata size mismatch');
    files.push({ name, size: bytes.length, sha256: hash(bytes), references: refs.map(r => r.id).sort() });
  }
  if ([...references.keys()].some(name => !files.some(f => f.name === name))) throw new TransferError('Referenced attachment or media file is missing');
  return { id: hash(JSON.stringify({ sqliteHash, files })), sqliteHash, rows, files, uploads };
}
