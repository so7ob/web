// Offline inventory of the SHA-pinned archive and GitHub compare response.
// No source checkout, database, remote branch, or original manifest is modified.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const sha = process.argv[2];
const verifiedAt = process.argv[3];
if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !verifiedAt || Number.isNaN(Date.parse(verifiedAt))) {
  throw new Error('Usage: node tools/migration/inventory-refresh.mjs <verified-full-SHA> <verification-UTC>');
}
const root = resolve('.');
const snapshot = resolve(root, `.migration/reference/Website-${sha.slice(0, 7)}`);
const original = JSON.parse(readFileSync('docs/migration/import-manifest.json', 'utf8'));
const compare = JSON.parse(readFileSync('.migration/source-refresh/compare.json', 'utf8'));
if (compare.base_commit.sha !== original.sourceSHA || compare.commits.at(-1)?.sha !== sha) {
  throw new Error('Compare response does not match the original import and pinned head');
}
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = resolve(dir, entry.name);
  return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
});
const digest = path => existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
const originalFiles = new Map(original.entries.map(entry => [entry.source, entry]));
const files = compare.files.map(file => {
  const path = resolve(snapshot, file.filename);
  if (!path.startsWith(snapshot + '/')) throw new Error('Unsafe source path');
  return { source: file.filename, change: file.status,
    oldSHA256: originalFiles.get(file.filename)?.sha256 ?? null,
    newSHA256: digest(path), status: 'pending-review-and-port', evidence: [] };
});
const sourceFiles = walk(resolve(snapshot, 'src/app'));
const apiFiles = sourceFiles.filter(path => path.includes('/src/app/api/') && path.endsWith('/route.ts')).sort().map(path => ({
  source: relative(snapshot, path),
  path: '/' + relative(resolve(snapshot, 'src/app'), path).replace(/\/route\.ts$/, ''),
  methods: [...readFileSync(path, 'utf8').matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map(match => match[1]),
}));
const record = { source: 'https://github.com/so7ob/Website', sourceSHA: sha,
  previousSourceSHA: original.sourceSHA, verifiedAt, commits: compare.total_commits, files,
  inventory: {
    blocks: [...readFileSync(resolve(snapshot, 'src/lib/blocks/types.ts'), 'utf8').matchAll(/^ {2}(\w+): z\.object\(/gm)].map(match => match[1]),
    containers: JSON.parse(readFileSync(resolve(snapshot, 'src/lib/blocks/tree.ts'), 'utf8').match(/CONTAINER_TYPES = (\[[^\]]+\])/)[1]),
    models: [...readFileSync(resolve(snapshot, 'prisma/schema.prisma'), 'utf8').matchAll(/^model\s+(\w+)/gm)].map(match => match[1]),
    pages: sourceFiles.filter(path => path.endsWith('/page.tsx')).sort().map(path => relative(snapshot, path)),
    apiFiles, explicitHttpHandlers: apiFiles.reduce((sum, file) => sum + file.methods.length, 0),
  },
};
const output = 'docs/migration/source-refresh-manifest.json';
if (existsSync(output)) {
  const previous = JSON.parse(readFileSync(output, 'utf8'));
  if (previous.sourceSHA !== sha) throw new Error('Archive the previous refresh cycle before replacing it');
  for (const file of record.files) {
    const prior = previous.files.find(entry => entry.source === file.source && entry.newSHA256 === file.newSHA256);
    if (prior) {
      file.status = prior.status; file.evidence = prior.evidence;
      if (prior.destination) file.destination = prior.destination;
    }
  }
}
writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ sha, changedFiles: files.length, models: record.inventory.models.length, pages: record.inventory.pages.length, apiFiles: apiFiles.length, handlers: record.inventory.explicitHttpHandlers }));
