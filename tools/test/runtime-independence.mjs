// Check current development, test and maintenance entry points without a source archive.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { checkSource, checkManifest, checkConfiguration, forbiddenDependency } from './independence-policy.mjs';

const root = process.cwd();
assert(!readdirSync(root).some(path => /^reference$/.test(path)), 'The retired reference archive must not return');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  ['node_modules', 'dist', '.git', '.migration'].includes(entry.name) ? [] :
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
const directories = ['apps', 'packages', 'tools', 'tests', 'ops', '.github'];
const files = [...directories.flatMap(walk), ...readdirSync(root).filter(file => /\.(?:json|[cm]?js|ts)$/.test(file))];
let importsChecked = 0, sourcesChecked = 0, configurationsChecked = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (/(?:^|\/)package\.json$/.test(file)) checkManifest(JSON.parse(source), file);
  if (/\.(?:tsx?|[cm]?js)$/.test(file)) {
    importsChecked += checkSource(source, file, root, {
      // Deliberately rejected specimens are data in the policy's regression tests.
      inspectPaths: file !== 'tools/test/runtime-independence.test.mjs',
    });
    sourcesChecked++;
  } else if (/\.(?:json|ya?ml|sh|template|service|html|css)$/.test(file) && file !== 'package-lock.json') {
    checkConfiguration(source, file);
    configurationsChecked++;
  }
}
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
for (const [path, entry] of Object.entries(lock.packages)) {
  const name = path.split('node_modules/').at(-1);
  assert(!forbiddenDependency(name), `Forbidden installed dependency: ${path}`);
  for (const dependency of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
    assert(!forbiddenDependency(dependency), `${path}: forbidden dependency ${dependency}`);
  }
  if (entry.resolved?.startsWith('file:')) checkConfiguration(entry.resolved, path);
}
console.log(JSON.stringify({ passed: true, sourcesChecked, importsChecked, configurationsChecked, productRuntime: 'Node/Nest/Vite/TypeORM', historicalCheckoutRequired: false }));
