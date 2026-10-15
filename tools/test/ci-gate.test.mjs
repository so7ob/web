import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCoverage, catalogCases } from './ci-gate.mjs';
const plan={smoke:true,design:false,files:[]};
const required=['smoke.spec.ts','workflows.spec.ts','workflow-drafts.spec.ts','workflow-version-labels.spec.ts','workflow-transition-labels.spec.ts','workflow-deadline-zones.spec.ts'].flatMap(file=>['desktop','mobile'].flatMap(project=>['ar','en'].map(locale=>({id:`${file}-${project}-${locale}`,file,project,title:locale+': scenario'}))));
const catalog=[...required,{id:'c',file:'unselected.spec.ts',project:'desktop',title:'extra'}];
const ids=required.map(test=>test.id);
const report=(selected=ids)=>({status:'passed',catalog:selected,cases:selected.map(id=>({id,status:'passed',expectedStatus:'passed',retry:0}))});
test('required coverage is exact and cannot pass on a partial or empty browser result',()=>{
  assert.deepEqual(verifyCoverage(plan,catalog,[report()]),{expected:24,passed:24});
  for(const reports of [[],[report(ids.slice(1))],[report([...ids,'c'])],[report(),report()]])assert.throws(()=>verifyCoverage(plan,catalog,reports));
  assert.throws(()=>verifyCoverage(plan,[],[]));
  assert.throws(()=>verifyCoverage(plan,catalog.filter(test=>test.project!=='mobile'),[report()]));
  assert.throws(()=>verifyCoverage(plan,catalog.filter(test=>!test.title.startsWith('en:')),[report()]));
  const withoutVersions=required.filter(test=>test.file!=='workflow-version-labels.spec.ts');
  assert.throws(()=>verifyCoverage(plan,withoutVersions,[report(withoutVersions.map(test=>test.id))]));
  const withoutDestinations=required.filter(test=>test.file!=='workflow-transition-labels.spec.ts');
  assert.throws(()=>verifyCoverage(plan,withoutDestinations,[report(withoutDestinations.map(test=>test.id))]));
  const withoutDeadlines=required.filter(test=>test.file!=='workflow-deadline-zones.spec.ts');
  assert.throws(()=>verifyCoverage(plan,withoutDeadlines,[report(withoutDeadlines.map(test=>test.id))]));
});
test('failed, cancelled, skipped, expected-failure and retried cases cannot produce a passing gate',()=>{
  for(const state of ['failed','timedout','interrupted'])assert.throws(()=>verifyCoverage(plan,catalog,[{...report(),status:state}]));
  for(const mutation of [{status:'failed'},{status:'skipped'},{expectedStatus:'failed'},{retry:1}]){
    const r=report();Object.assign(r.cases[0],mutation);assert.throws(()=>verifyCoverage(plan,catalog,[r]));
  }
});
test('list catalog retains project-specific test IDs',()=>{
  assert.deepEqual(catalogCases({suites:[{specs:[{id:'spec',title:'case',file:'smoke.spec.ts',tests:[{testId:'desktop-id',projectName:'desktop'},{testId:'mobile-id',projectName:'mobile'}]}]}]}),[{id:'desktop-id',file:'smoke.spec.ts',project:'desktop',title:'case'},{id:'mobile-id',file:'smoke.spec.ts',project:'mobile',title:'case'}]);
});
