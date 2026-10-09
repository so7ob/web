// Guard the product boundary and preserve the exact historical archive bytes.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const root=process.cwd();
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='node_modules'||e.name==='dist'?[]:e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
const forbidden=s=>/^(next(?:\/|$)|@prisma\/|prisma(?:\/|$)|bun(?:[:/]|$))/.test(s);
const manifest=JSON.parse(readFileSync('package.json','utf8'));
assert(!Object.keys(manifest.scripts).some(k=>k.startsWith('reference:')),'Reference commands must not be product entry points');
let imports=0;
for(const dir of ['apps','packages']) {
 for(const file of walk(dir).filter(p=>/\.(?:tsx?|mjs|json)$/.test(p))) {
  if(file.endsWith('/package.json')) {
   const p=JSON.parse(readFileSync(file,'utf8'));
   for(const name of Object.keys({...p.dependencies,...p.devDependencies}))assert(!forbidden(name),`${file}: ${name}`);
  }
  if(!/\.(?:tsx?|mjs)$/.test(file))continue;
  for(const item of ts.preProcessFile(readFileSync(file,'utf8'),true,true).importedFiles){
   const name=item.fileName;imports++;
   assert(!forbidden(name),`${file}: forbidden runtime import ${name}`);
   if(name.startsWith('.')){
    const target=relative(root,resolve(file,'..',name));
    assert(!/^(reference|src|prisma|scripts|\.migration)\//.test(target),`${file}: source archive import ${name}`);
   }
  }
 }
}
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
for(const name of Object.keys(lock.packages))assert(!/(?:^|\/)node_modules\/(next|prisma|@prisma\/[^/]+|bun)$/.test(name),`Forbidden installed dependency: ${name}`);
const map=JSON.parse(readFileSync('docs/migration/reference-relocation.json','utf8'));
for(const entry of map.entries)assert.equal(createHash('sha256').update(readFileSync(entry.archivePath)).digest('hex'),entry.sha256,entry.archivePath);
console.log(JSON.stringify({passed:true,importsChecked:imports,archivedFilesVerified:map.entries.length,productRuntime:'Node/Nest/Vite/TypeORM',referenceArchiveNotExecutable:true}));
