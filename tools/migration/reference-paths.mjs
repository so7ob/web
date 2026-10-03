import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const root = resolve(import.meta.dirname, '../..');
const original = '5321b7fd11db421c83290b262f276811e5f04e5f';
export const sourceSHA = process.env.REFERENCE_SOURCE_SHA ?? original;
if (!/^[a-f0-9]{40}$/.test(sourceSHA)) throw new Error('Expected a full reference SHA');
if (sourceSHA !== original) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'docs/migration/source-refresh-manifest.json'), 'utf8'));
  if (manifest.sourceSHA !== sourceSHA) throw new Error('Reference SHA has not been inventoried');
}
export const referencePath = resolve(root, '.migration/reference', sourceSHA === original ? 'Website' : `Website-${sourceSHA.slice(0, 7)}`);
export const baselinePath = resolve(root, '.migration', sourceSHA === original ? 'baseline' : `baseline-${sourceSHA.slice(0, 7)}`);
export const referenceDatabase = resolve(baselinePath, 'data', sourceSHA === original ? 'reference.db' : 'runtime.db');
