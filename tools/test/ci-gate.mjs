import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGate, smoke, design } from './ci-policy.mjs';
import { proofVersion, sourceFingerprint, suiteSignature } from './ci-evidence.mjs';

export function catalogCases(report) {
  const cases=[];
  const visit=suite=>{for(const spec of suite.specs??[])for(const test of spec.tests??[])cases.push({id:test.testId??test.id??spec.id,project:test.projectName,file:spec.file,title:spec.title});for(const child of suite.suites??[])visit(child);};
  for(const suite of report.suites??[])visit(suite);
  return cases;
}
export function verifyCoverage(plan, catalog, reports) {
  const selected=new Set([...plan.files,...(plan.smoke?smoke:[]),...(plan.design?design:[])]);
  const expected=catalog.filter(test=>selected.has(test.file.replace(/^.*tests\/e2e\//,'')));
  if(!expected.length)throw new Error('Required browser catalog is empty');
  for(const file of [...(plan.smoke?smoke:[]),...(plan.design?design:[])])for(const project of ['desktop','mobile']) {
    if(!expected.some(test=>test.file===file&&test.project===project))throw new Error('Mandatory smoke/design project coverage is absent');
    if(file==='smoke.spec.ts'||file==='workflows.spec.ts')for(const locale of ['ar','en'])
      if(!expected.some(test=>test.file===file&&test.project===project&&test.title.startsWith(locale+':')))throw new Error('Mandatory bilingual smoke coverage is absent');
    if(file==='design-system.spec.ts')for(const locale of ['ar','en'])for(const mode of ['light','dark'])
      if(!expected.some(test=>test.file===file&&test.project===project&&test.title.startsWith(`${locale}/${mode}:`)))throw new Error('Complete design matrix coverage is absent');
  }
  const observed=reports.flatMap(report=>{
    if(report.status!=='passed')throw new Error('A required browser run did not pass');
    if(report.catalog.length!==report.cases.length)throw new Error('Browser case accounting mismatch');
    for(const test of report.cases)if(test.status!=='passed'||test.expectedStatus!=='passed'||test.retry!==0)throw new Error('Failed, skipped, expected-failure or retried browser case');
    return report.cases.map(test=>test.id);
  });
  if(new Set(observed).size!==observed.length)throw new Error('Duplicate browser coverage across isolated jobs');
  const ids=new Set(observed);
  if(expected.length!==ids.size||expected.some(test=>!ids.has(test.id)))throw new Error('Selected browser coverage is incomplete or unexpected');
  return {expected:expected.length,passed:ids.size};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const plan=JSON.parse(process.env.PLAN_JSON??'null');
  const needs=JSON.parse(process.env.NEEDS_JSON??'{}');
  if(!plan||!checkGate(plan,Object.fromEntries(Object.entries(needs).map(([name,value])=>[name,value.result]))))throw new Error('A required quality job failed, was cancelled or was unexpectedly skipped');
  if(plan.smoke){
    const folder=process.argv[2]??'.migration/ci/results';
    const reports=readdirSync(folder,{recursive:true}).filter(file=>file.endsWith('.cases.json')).map(file=>JSON.parse(readFileSync(join(folder,file),'utf8')));
    const catalog=catalogCases(JSON.parse(readFileSync(process.argv[3]??'.migration/ci/catalog/catalog.json','utf8')));
    const coverage=verifyCoverage(plan,catalog,reports);
    process.stdout.write(JSON.stringify(coverage)+'\n');
    if(process.env.GITHUB_ACTIONS==='true'){
      mkdirSync('.migration/ci',{recursive:true});
      const headSha=process.env.CI_HEAD_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
      const checkedOut=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
      writeFileSync('.migration/ci/proof.json',JSON.stringify({version:proofVersion,result:'passed',repository:process.env.GITHUB_REPOSITORY,
        runId:Number(process.env.GITHUB_RUN_ID),prNumber:Number(process.env.CI_PR_NUMBER),headSha,baseSha:process.env.CI_BASE_SHA,
        headFingerprint:sourceFingerprint(headSha),checkoutFingerprint:sourceFingerprint(checkedOut),suiteSignature:suiteSignature(plan),passedCases:coverage.passed},null,2)+'\n');
    }
  }else process.stdout.write('Allowlisted documentation checks passed; application jobs were not required.\n');
}
