import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { docsOnly } from './ci-policy.mjs';

export const proofVersion = 1;
export function sourceFingerprint(ref, cwd = process.cwd()) {
  if(!/^[a-f0-9]{40}$/.test(ref))throw new Error('Exact source SHA required');
  const entries=execFileSync('git',['ls-tree','-r','-z',ref],{cwd,encoding:'utf8'}).split('\0').filter(Boolean);
  const source=entries.filter(entry=>{
    const separator=entry.indexOf('\t'), metadata=entry.slice(0,separator), path=entry.slice(separator+1);
    return !(metadata.startsWith('100644 blob ')&&docsOnly(path));
  });
  return createHash('sha256').update(source.join('\0')).digest('hex');
}
export const suiteSignature = plan => JSON.stringify({mode:plan.mode,operations:plan.operations,smoke:plan.smoke,design:plan.design,files:[...plan.files].sort()});
export function canReuseEvidence({run,proof,context,headFingerprint,checkoutFingerprint,ancestor,changedPaths,selection}) {
  return context.event==='pull_request' && ancestor===true && changedPaths.length>0 && changedPaths.every(docsOnly) &&
    run.conclusion==='success' && run.event==='pull_request' && run.path==='.github/workflows/ci.yml' && run.head_branch===context.branch &&
    run.pull_requests?.some(pr=>pr.number===context.prNumber) && proof.version===proofVersion && proof.repository===context.repository &&
    proof.runId===run.id && proof.headSha===run.head_sha && proof.baseSha===context.baseSha && proof.prNumber===context.prNumber &&
    proof.result==='passed' && proof.passedCases>0 && proof.headFingerprint===headFingerprint && proof.checkoutFingerprint===checkoutFingerprint &&
    proof.suiteSignature===suiteSignature(selection);
}
