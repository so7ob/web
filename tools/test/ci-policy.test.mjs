import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { selectSuites, requiredJobs, checkGate, docsOnly } from './ci-policy.mjs';
const specs = readdirSync('tests/e2e').filter(file => file.endsWith('.spec.ts'));
const select = paths => selectSuites(paths,specs);
test('only allowlisted documentation avoids application E2E', () => {
  const plan = select(['README.md','README.en.md','docs/migration/example.md']);
  assert.equal(plan.mode,'docs'); assert.deepEqual(requiredJobs(plan),['plan','docs']);
  for (const path of ['docs/config.json','docs/run.sh','.github/workflows/ci.yml','AGENTS.md','docs/../package.json']) {
    assert.equal(docsOnly(path),false); assert.equal(select([path]).mode,'full');
  }
});
test('request UI selects smoke, all dependent request cases and the full visual matrix', () => {
  const plan = select(['apps/web/src/components/account/requests-view.tsx']);
  assert.equal(plan.mode,'affected'); assert.equal(plan.smoke,true); assert.equal(plan.design,true);
  assert.ok(plan.files.includes('account-inquiry-ownership.spec.ts'));
  assert.ok(plan.files.includes('contact-draft.spec.ts'));
  assert.ok(plan.files.includes('tracking-language.spec.ts'));
  assert.ok(plan.files.includes('account-portal.spec.ts')); assert.ok(plan.files.includes('files-claims.spec.ts'));
  assert.ok(!plan.files.includes('tree-editor.spec.ts'));
});
test('CMS and workflow UI preserve their dependency closure and design matrix', () => {
  const plan = select(['apps/web/src/components/editor/canvas.tsx']);
  assert.ok(plan.files.includes('media-alt-drafts.spec.ts'));
  assert.ok(plan.files.includes('publication.spec.ts')); assert.equal(plan.design,true);
  const workflow = select(['apps/web/src/components/admin/workflows/workspace.tsx']);
  assert.equal(workflow.smoke,true); assert.equal(workflow.design,true);
});
test('permissions, shared modules, translation, configuration and unknown paths fail closed to full', () => {
  for (const path of ['packages/contracts/src/permissions.ts','packages/server/src/business/requests.ts','apps/web/src/lib/auth/permissions.ts','apps/web/src/components/ui/button.tsx','apps/web/src/content/portal/ar.ts','apps/web/src/components/auth/login.tsx','apps/web/src/components/account/security-view.tsx','apps/web/src/components/account/profile-form.tsx','apps/web/src/components/account/account-shell.tsx','apps/web/src/components/account/api.ts','apps/web/src/components/account/types.ts','apps/web/src/components/account/new-unknown-view.tsx','playwright.config.ts','package-lock.json','new-unknown-file.xyz']) {
    assert.equal(select([path]).mode,'full',path);
  }
  assert.equal(select([]).mode,'full');
  assert.equal(selectSuites(['README.md'],specs,'push').mode,'full');
  assert.equal(selectSuites(['README.md'],specs,'workflow_dispatch').mode,'full');
  assert.equal(selectSuites(['README.md'],specs,'pull_request','main').mode,'full');
});
test('new unclassified specs force full selection and remain in the selected catalog', () => {
  const plan = selectSuites(['apps/web/src/components/account/requests-view.tsx'],[...specs,'new-domain.spec.ts']);
  assert.equal(plan.mode,'full'); assert.ok(plan.files.includes('new-domain.spec.ts'));
});
test('every required failure, cancellation, omission or unexpected skip fails the stable gate', () => {
  for (const plan of [select(['README.md']), select(['apps/web/src/components/account/requests-view.tsx']),select(['playwright.config.ts'])]) {
    const results = Object.fromEntries(['plan','docs','build','operations','smoke','functional','design'].map(name => [name,requiredJobs(plan).includes(name)?'success':'skipped']));
    assert.equal(checkGate(plan,results),true);
    for (const name of requiredJobs(plan)) for (const state of ['failure','cancelled','skipped',undefined])
      assert.equal(checkGate(plan,{...results,[name]:state}),false,`${name}: ${state}`);
    assert.equal(checkGate(plan,{...results,extra:'failure'}),false);
  }
});
