import test from 'node:test';
import assert from 'node:assert/strict';
import { canReuseEvidence, suiteSignature, proofVersion, sourceFingerprint } from './ci-evidence.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const selection={mode:'full',operations:true,smoke:true,design:true,files:['a.spec.ts']};
function fixture(){return {
  run:{id:123,conclusion:'success',event:'pull_request',path:'.github/workflows/ci.yml',head_branch:'perf/123',head_sha:'a'.repeat(40),pull_requests:[{number:124}]},
  context:{event:'pull_request',branch:'perf/123',prNumber:124,repository:'so7ob/web',baseSha:'b'.repeat(40)},
  proof:{version:proofVersion,repository:'so7ob/web',runId:123,headSha:'a'.repeat(40),baseSha:'b'.repeat(40),prNumber:124,result:'passed',passedCases:300,headFingerprint:'head-hash',checkoutFingerprint:'merge-hash',suiteSignature:suiteSignature(selection)},
  ancestor:true,changedPaths:['docs/migration/evidence.md'],headFingerprint:'head-hash',checkoutFingerprint:'merge-hash',selection,
};}
test('a documentation update reuses only verified passing identical source and suite evidence',()=>assert.equal(canReuseEvidence(fixture()),true));
test('no reuse across failed runs, other PRs/workflows, changed base, source, suites or non-doc changes',()=>{
  const mutations=[
    f=>{f.run.conclusion='failure';}, f=>{f.run.conclusion='cancelled';},f=>{f.run.path='other.yml';},f=>{f.run.pull_requests=[{number:125}];},
    f=>{f.run.head_branch='another-branch';},f=>{f.proof.repository='other/repo';},f=>{f.proof.runId=122;},f=>{f.proof.version=0;},
    f=>{f.proof.baseSha='c'.repeat(40);},f=>{f.proof.headSha='c'.repeat(40);},f=>{f.headFingerprint='changed';},f=>{f.checkoutFingerprint='changed';},
    f=>{f.proof.result='failed';},f=>{f.proof.passedCases=0;},f=>{f.ancestor=false;},f=>{f.changedPaths=['tools/run.md.sh'];},
    f=>{f.changedPaths=['docs/config.json'];},f=>{f.changedPaths=['docs/link.md\n'];},f=>{f.changedPaths=[];},f=>{f.selection.files.push('b.spec.ts');},
    f=>{f.context.event='workflow_dispatch';},f=>{f.context.prNumber=125;},
  ];
  for(const mutate of mutations){const f=fixture();f.selection={...selection,files:[...selection.files]};mutate(f);assert.equal(canReuseEvidence(f),false);}
});
test('actual Git fingerprints ignore regular Markdown content but include scripts, executable Markdown and symlinks',()=>{
  mkdirSync('.migration',{recursive:true});const cwd=mkdtempSync(resolve('.migration/fingerprint-'));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const commit=()=>{git('add','.');git('commit','-m','Synthetic fingerprint fixture');return git('rev-parse','HEAD');};
  try{
    git('init');git('config','user.name','Synthetic fixture');git('config','user.email','fixture@example.invalid');
    mkdirSync(join(cwd,'docs'));writeFileSync(join(cwd,'code.js'),'export const answer=1;\n');writeFileSync(join(cwd,'docs/a.md'),'# Before\n');
    const original=sourceFingerprint(commit(),cwd);
    writeFileSync(join(cwd,'docs/a.md'),'# After\n');assert.equal(sourceFingerprint(commit(),cwd),original);
    chmodSync(join(cwd,'docs/a.md'),0o755);assert.notEqual(sourceFingerprint(commit(),cwd),original);
    chmodSync(join(cwd,'docs/a.md'),0o644);symlinkSync('../code.js',join(cwd,'docs/link.md'));assert.notEqual(sourceFingerprint(commit(),cwd),original);
    rmSync(join(cwd,'docs/link.md'));writeFileSync(join(cwd,'docs/disguised.md\t.js'),'executable source');assert.notEqual(sourceFingerprint(commit(),cwd),original);
    rmSync(join(cwd,'docs/disguised.md\t.js'));writeFileSync(join(cwd,'code.js'),'export const answer=2;\n');assert.notEqual(sourceFingerprint(commit(),cwd),original);
    assert.throws(()=>sourceFingerprint('HEAD; echo unsafe',cwd));
  }finally{rmSync(cwd,{recursive:true});}
});
