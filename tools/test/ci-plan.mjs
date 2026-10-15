import { appendFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { selectSuites, docsOnly } from './ci-policy.mjs';
import { canReuseEvidence, sourceFingerprint } from './ci-evidence.mjs';

const git = args => execFileSync('git',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const api = path => JSON.parse(execFileSync('gh',['api',path],{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:4*1024*1024}));
const event=process.env.GITHUB_EVENT_NAME??'workflow_dispatch';
const head=process.env.CI_HEAD_SHA??git(['rev-parse','HEAD']);
const base=process.env.CI_BASE_SHA;
if(!/^[a-f0-9]{40}$/.test(head)||(event==='pull_request'&&!/^[a-f0-9]{40}$/.test(base??'')))throw new Error('Exact CI source SHAs required');
let paths=[];
if(event==='pull_request'){
  paths=execFileSync('git',['diff','--name-only','-z',base,head],{encoding:'utf8'}).split('\0').filter(Boolean);
  execFileSync('git',['diff','--check',base,head],{stdio:'inherit'});
}
const specs=readdirSync('tests/e2e',{recursive:true}).filter(name=>name.endsWith('.spec.ts'));
const unusualDoc=paths.some(path=>docsOnly(path)&&[base,head].filter(Boolean).some(ref=>{
  const entry=git(['ls-tree',ref,'--',path]);return entry&&!entry.startsWith('100644 blob ');
}));
let plan=selectSuites(unusualDoc?[...paths,'unsafe-document-mode']:paths,specs,event,process.env.CI_BASE_BRANCH);
// A docs-only update of an application PR can reuse a completed successful run
// only when the actual non-doc head AND checkout trees, base SHA and suite agree.
if(event==='pull_request'&&!plan.docs&&!unusualDoc&&process.env.GH_TOKEN){
  try{
    const repository=process.env.GITHUB_REPOSITORY;
    if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository??''))throw new Error('Explicit repository required');
    const branch=process.env.GITHUB_HEAD_REF,prNumber=Number(process.env.CI_PR_NUMBER);
    const context={event,repository,branch,prNumber,baseSha:base};
    const query=new URLSearchParams({per_page:'20',status:'success',event:'pull_request',branch});
    const runs=api(`repos/${repository}/actions/workflows/ci.yml/runs?${query}`).workflow_runs;
    for(const run of runs){
      if(!/^[a-f0-9]{40}$/.test(run.head_sha)||!Number.isSafeInteger(run.id))continue;
      let ancestor=false;
      try{execFileSync('git',['merge-base','--is-ancestor',run.head_sha,head],{stdio:'pipe'});ancestor=true;}catch{continue;}
      const changedPaths=execFileSync('git',['diff','--name-only','-z',run.head_sha,head],{encoding:'utf8'}).split('\0').filter(Boolean);
      if(!changedPaths.length||!changedPaths.every(docsOnly))continue;
      const artifact=api(`repos/${repository}/actions/runs/${run.id}/artifacts`).artifacts.find(item=>item.name==='ci-proof'&&!item.expired);
      if(!artifact||!Number.isSafeInteger(artifact.id))continue;
      const zip=execFileSync('gh',['api',`repos/${repository}/actions/artifacts/${artifact.id}/zip`],{stdio:['pipe','pipe','pipe'],maxBuffer:1024*1024});
      const proof=JSON.parse(execFileSync('python3',['-c',"import io,json,sys,zipfile\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\na=[i for i in z.infolist() if i.filename.split('/')[-1]=='proof.json']\nassert len(a)==1 and a[0].file_size<65536\nsys.stdout.buffer.write(z.read(a[0]))"],{input:zip,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:65536}));
      const previousHead=sourceFingerprint(run.head_sha);
      if(previousHead!==sourceFingerprint(head))continue;
      if(canReuseEvidence({run,proof,context,headFingerprint:previousHead,checkoutFingerprint:sourceFingerprint(git(['rev-parse','HEAD'])),ancestor,changedPaths,selection:plan})){
        plan={mode:'docs',reason:'documentation update with verified identical passing source and suites',docs:true,build:false,operations:false,smoke:false,design:false,files:[],reusedRun:run.id,reusedHead:run.head_sha};
        paths=changedPaths;
        break;
      }
    }
  }catch{
    // API/permissions/expired/malformed evidence can only cost more checks.
    process.stdout.write('No verifiable previous proof; retaining all selected application checks.\n');
  }
}
const output={...plan,paths,functional:plan.files.length>0};
for(const [key,value] of Object.entries({...output,plan:output}))if(process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${typeof value==='object'?JSON.stringify(value):value}\n`);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`CI selection: **${plan.mode}** — ${plan.reason}${plan.reusedRun?` (passing run ${plan.reusedRun})`:''}\n`);
process.stdout.write(JSON.stringify(output,null,2)+'\n');
