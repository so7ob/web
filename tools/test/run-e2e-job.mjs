import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { smoke, design } from './ci-policy.mjs';
const require=createRequire(import.meta.url);
const suite=process.env.SO7OB_E2E_SUITE ?? 'full', project=process.env.SO7OB_E2E_PROJECT;
const args=['test'];
const literal = file => 'tests/e2e/'+file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$';
if(project&&!['desktop','mobile'].includes(project))throw new Error('Unknown project');
if(suite==='smoke')args.push(...smoke.map(literal));
else if(suite==='functional'){
  const files=JSON.parse(process.env.SO7OB_E2E_FILES ?? 'null');
  if(!Array.isArray(files)||!files.length||files.some(file=>typeof file!=='string'||!file.endsWith('.spec.ts')||file.split('/').includes('..')||file.startsWith('/')))throw new Error('Explicit nonempty functional catalog required');
  args.push(...files.map(literal));
  if(process.env.SO7OB_E2E_SHARD){if(!/^[1-9]\d*\/[1-9]\d*$/.test(process.env.SO7OB_E2E_SHARD))throw new Error('Invalid shard');args.push('--shard',process.env.SO7OB_E2E_SHARD);}
}else if(suite==='design'){
  const {SO7OB_E2E_LOCALE:locale,SO7OB_E2E_MODE:mode}=process.env;
  if(!project||!['ar','en'].includes(locale)||!['light','dark'].includes(mode))throw new Error('Explicit design matrix cell required');
  args.push(...design.map(literal),'--grep',[`${locale}/${mode}:`,...(mode==='light'?[`${locale}: accessibility engine`]:[]),...(locale==='ar'&&mode==='light'?['visual readiness','theme preference','saved density']:[])].join('|'));
}else if(suite!=='full')throw new Error('Unknown suite');
// Playwright's --project is variadic: put it last so it cannot consume file filters.
if(project)args.push('--project',project);
const resultFile=process.env.SO7OB_E2E_RESULT_FILE ?? `.migration/ci/results/${suite}-${project??'all'}-${(process.env.SO7OB_E2E_SHARD??'0').replace('/','-')}.json`;
const start=performance.now();
const result=spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),...args],{stdio:'inherit',env:{...process.env,SO7OB_E2E_RESULT_FILE:resultFile}});
const wall={suite,project,shard:process.env.SO7OB_E2E_SHARD,milliseconds:performance.now()-start,exitCode:result.status,signal:result.signal};
mkdirSync(dirname(resultFile),{recursive:true});writeFileSync(resultFile.replace(/\.json$/,'.wall.json'),JSON.stringify(wall,null,2)+'\n');
if(result.error)throw result.error;
process.exitCode=result.status??1;
