import { readFileSync, lstatSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsOnly } from './ci-policy.mjs';

export function checkDocumentation(root, paths) {
  for(const path of paths){
    if(!docsOnly(path))throw new Error('Non-allowlisted documentation path');
    const file=resolve(root,path);
    if(relative(root,file).startsWith('..'))throw new Error('Documentation escapes checkout');
    if(!existsSync(file))continue; // An explicitly deleted Markdown file.
    if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())throw new Error('Documentation must be a regular file');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(file));
    if(!text.trim()||text.includes('\0'))throw new Error('Empty or invalid Markdown document');
    for(const match of text.matchAll(/!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)){
      const target=(match[1]??match[2]).split('#')[0];
      if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('//'))continue;
      const destination=resolve(target.startsWith('/')?root:dirname(file),decodeURIComponent(target.replace(/^\//,'')));
      if(relative(root,destination).startsWith('..')||!existsSync(destination))throw new Error(`Broken local documentation link in ${path}`);
    }
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  checkDocumentation(process.cwd(),JSON.parse(process.env.CI_DOC_PATHS??'[]'));
  process.stdout.write('Allowlisted Markdown: UTF-8, regular files, nonempty content and local links verified.\n');
}
