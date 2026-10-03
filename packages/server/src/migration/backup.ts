import type { DataSource } from 'typeorm';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { hash, regularFile, safeDirectory, safeName, TransferError } from './snapshot.js';
interface BackupManifest { version: 1; createdAt: string; database: string; sqlSha256: string; files: Array<{ name: string; sha256: string; size: number }> }
function clientEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Never pass a password in command arguments or echo tool stderr containing SQL.
  return { PATH: env.PATH, MYSQL_PWD: env.DATABASE_PASSWORD, LANG: 'C.UTF-8' };
}
function args(env: NodeJS.ProcessEnv): string[] {
  if (!env.DATABASE_NAME || !/^[a-zA-Z0-9_]+$/.test(env.DATABASE_NAME) || !env.DATABASE_USER) throw new TransferError('Explicit valid database and user required');
  return ['--no-defaults', '--protocol=TCP', '--host='+ (env.DATABASE_HOST ?? '127.0.0.1'), '--port='+ (env.DATABASE_PORT ?? '3306'), '--user='+env.DATABASE_USER];
}
async function waitFor(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((ok, fail) => { child.once('error', () => fail(new TransferError('MariaDB client could not start'))); child.once('close', code => code === 0 ? ok() : fail(new TransferError('MariaDB backup/restore failed; keep destination offline'))); });
}
function newPath(path: string, source: string): void {
  if (!isAbsolute(path) || existsSync(path)) throw new TransferError('Output must be a new absolute path');
  let parent = resolve(path, '..'); while (!existsSync(parent)) parent = resolve(parent, '..'); safeDirectory(parent);
  for (const [a,b] of [[path,source],[source,path]]) {
    const delta = relative(resolve(a),resolve(b));
    if (!delta || (!delta.startsWith('..') && !isAbsolute(delta))) throw new TransferError('Backup input/output paths must be disjoint');
  }
}
export async function backup(env: NodeJS.ProcessEnv, uploads: string, output: string, expectedDatabase: string): Promise<BackupManifest> {
  if (env.DATABASE_NAME !== expectedDatabase || env.MIGRATION_WRITES_PAUSED !== 'yes') throw new TransferError('Backup requires database confirmation and paused writes, including worker');
  safeDirectory(uploads); newPath(output, uploads); output = resolve(output);
  if (existsSync(output)) throw new TransferError('Backup destination must be new');
  mkdirSync(output, { recursive: true, mode: 0o700 }); safeDirectory(output); mkdirSync(join(output, 'uploads'), { mode: 0o700 });
  const sql = join(output, 'database.sql');
  const child = spawn('mariadb-dump', [...args(env), '--single-transaction', '--skip-lock-tables', '--hex-blob', '--routines', '--events', '--triggers', env.DATABASE_NAME!], { env: clientEnv(env), stdio: ['ignore','pipe','ignore'] });
  await Promise.all([waitFor(child), pipeline(child.stdout!, createWriteStream(sql, { flags: 'wx', mode: 0o600 }))]);
  const files: BackupManifest['files'] = [];
  for (const name of readdirSync(uploads).sort()) {
    if (!safeName(name)) throw new TransferError('Unsafe upload name');
    const bytes = regularFile(join(uploads,name)); writeFileSync(join(output,'uploads',name), bytes, { flag: 'wx', mode: 0o600 });
    files.push({ name, size: bytes.length, sha256: hash(bytes) });
  }
  const manifest: BackupManifest = { version: 1, createdAt: new Date().toISOString(), database: expectedDatabase, sqlSha256: hash(regularFile(sql)), files };
  writeFileSync(join(output,'manifest.json'), JSON.stringify(manifest,null,2)+'\n', { flag: 'wx', mode: 0o600 }); return manifest;
}
export async function restore(db: DataSource, env: NodeJS.ProcessEnv, input: string, uploads: string, expectedDatabase: string): Promise<BackupManifest> {
  if (env.DATABASE_NAME !== expectedDatabase || db.options.database !== expectedDatabase || env.MIGRATION_WRITES_PAUSED !== 'yes') throw new TransferError('Restore requires database confirmation and paused writes');
  safeDirectory(input); newPath(uploads, input);
  const manifest = JSON.parse(readFileSync(join(input, 'manifest.json'), 'utf8')) as BackupManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new TransferError('Unsupported backup format');
  const sql = join(input, 'database.sql'); if (hash(regularFile(sql)) !== manifest.sqlSha256) throw new TransferError('Backup SQL checksum mismatch');
  for (const file of manifest.files) {
    if (!safeName(file.name)) throw new TransferError('Unsafe backup file');
    const bytes = regularFile(join(input,'uploads',file.name)); if (bytes.length !== file.size || hash(bytes) !== file.sha256) throw new TransferError('Backup file checksum mismatch');
  }
  if ((await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?', [expectedDatabase])).length || existsSync(uploads)) throw new TransferError('Restore requires an empty database and a new uploads directory; never overwrite existing data');
  // Backups are trusted operator artifacts: SQL is executable, checksums detect corruption, not authenticity.
  const child = spawn('mariadb', [...args(env), expectedDatabase], { env: clientEnv(env), stdio: ['pipe','ignore','ignore'] });
  await Promise.all([waitFor(child), pipeline(createReadStream(sql), child.stdin!)]);
  mkdirSync(uploads, { recursive: true, mode: 0o700 }); safeDirectory(uploads);
  for (const file of manifest.files) writeFileSync(join(uploads,file.name), regularFile(join(input,'uploads',file.name)), { flag: 'wx', mode: 0o600 });
  return manifest;
}
