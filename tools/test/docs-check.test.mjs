import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkDocumentation } from './docs-check.mjs';
test('documentation validation checks content and local links without executing scripts',()=>{
  mkdirSync('.migration',{recursive:true});const root=mkdtempSync(resolve('.migration/docs-check-'));
  try{
    mkdirSync(join(root,'docs'));writeFileSync(join(root,'docs/a.md'),'# A\n[Home](../README.md)\n');writeFileSync(join(root,'README.md'),'# Home\n');
    checkDocumentation(root,['docs/a.md','README.md','docs/deleted.md']);
    for(const text of ['','\0','# Broken\n[Missing](absent.md)']){writeFileSync(join(root,'docs/a.md'),text);assert.throws(()=>checkDocumentation(root,['docs/a.md']));}
    symlinkSync('../README.md',join(root,'docs/link.md'));assert.throws(()=>checkDocumentation(root,['docs/link.md']));
    assert.throws(()=>checkDocumentation(root,['docs/config.json']));
  }finally{rmSync(root,{recursive:true});}
});
