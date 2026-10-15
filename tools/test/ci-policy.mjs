export const domains = {
  requests: ['account-inquiry-ownership','account-claim-errors','account-diagnostics','account-failure-state','account-portal','admin-request-mutations','csv-download','contact-draft','files-claims','inquiry-hydration','portal-tabs','profile-hydration','reply-drafts','request-list-workflow','response-policy','submissions','support-operations','tracking','tracking-language'],
  cms: ['admin-configuration','admin-conflicts','admin-navigation','cms-publication','content-tree','editor-operations','editor-properties','layer-move','media-library','media-alt-drafts','menus-editor','publication','public-visibility','templates','tree-editor'],
  identity: ['admin-users','auth-compatibility','auth-error-state','auth-public','identity-management','invite-ui','login-hydration','role-contracts'],
  operations: ['api-inventory','audit-health','audit-investigation','audit-operations','diagnostics-http','diagnostics-ui','error-feedback','outbox-status'],
  presentation: ['admin-hydration','admin-layout','footer-targets','settings-appearance'],
};
export const smoke = ['smoke.spec.ts', 'workflows.spec.ts', 'workflow-drafts.spec.ts', 'workflow-version-labels.spec.ts', 'workflow-transition-labels.spec.ts', 'workflow-deadline-zones.spec.ts'];
export const design = ['design-system.spec.ts', 'accessibility-engine.spec.ts', 'design-pointer-state.spec.ts'];
// Account contains authentication/session controls as well as request views.
// Only known record views qualify for the narrower request-domain selection.
const accountRequestViews = new Set(['requests-view.tsx','request-detail-view.tsx','inquiry-detail-view.tsx','inquiries-view.tsx','notifications-view.tsx','new-request-view.tsx','new-inquiry-dialog.tsx','dashboard.tsx','status-badge.tsx']);
export const docsOnly = path => /^(README(?:\.en)?\.md|docs\/.+\.md)$/.test(path) && !Array.from(path).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127||char==='\\') && !path.split('/').includes('..');

export function selectSuites(paths, specs, event = 'pull_request', base = 'develop') {
  const all = specs.filter(file => ![...smoke, ...design].includes(file)).sort();
  const full = reason => ({ mode:'full', reason, docs:false, build:true, operations:true, smoke:true, design:true, files:all });
  if (event !== 'pull_request' || base === 'main') return full('develop/main push, release preparation or manual full run');
  if (!paths.length) return full('empty or unavailable change information');
  if (paths.every(docsOnly)) return { mode:'docs', reason:'allowlisted Markdown only', docs:true, build:false, operations:false, smoke:false, design:false, files:[] };
  const selected = new Set();
  let visual = false;
  for (const path of paths) {
    if (docsOnly(path)) continue;
    // These modules contain authorization, cross-domain contracts or infrastructure.
    // Domain services mix ownership and persistence: treat all server edits as full.
    if (/^(packages\/|apps\/api\/|apps\/worker\/|tests\/|tools\/|ops\/|\.github\/|\.agents\/)/.test(path)) return full('shared, server, security, database or test infrastructure changed');
    if (/^apps\/web\/src\/(components\/ui\/|lib\/|content\/|hooks\/|routing\/)/.test(path)) return full('shared UI, translation, permission or transport dependency changed');
    if (!/^apps\/web\/src\//.test(path)) return full('unknown or root configuration path');
    if (path.startsWith('apps/web/src/components/account/') && !accountRequestViews.has(path.slice('apps/web/src/components/account/'.length)))
      return full('account authentication, session, shared helper or unknown dependency changed');
    visual = true;
    if (/\/components\/(account|form|track)\//.test(path) || /\/components\/admin\/requests\//.test(path)) selected.add('requests');
    else if (/\/components\/admin\/workflows\//.test(path)) { /* workflows are mandatory smoke */ }
    else if (/\/components\/(editor|blocks)\//.test(path) || /\/components\/admin\/(pages|menus|media|templates)\//.test(path)) selected.add('cms');
    else if (/\/components\/admin\/(audit|diagnostics|outbox)\//.test(path)) selected.add('operations');
    else if (/\/components\/admin\/(users|roles|permissions|identity)\//.test(path) || /\/components\/auth\//.test(path)) return full('identity or authentication UI dependency changed');
    else return full('unclassified application dependency');
  }
  const known = new Set(Object.values(domains).flat().map(name => name + '.spec.ts'));
  if (all.some(file => !known.has(file))) return full('new unclassified spec requires full coverage');
  return { mode:'affected', reason:[...selected].join(', ') || 'workflow UI', docs:false, build:true, operations:false, smoke:true, design:visual,
    files:all.filter(file => [...selected].some(domain => domains[domain].includes(file.replace('.spec.ts','')))) };
}

export function requiredJobs(plan) {
  return ['plan', ...(plan.docs ? ['docs'] : []), ...(plan.build ? ['build'] : []), ...(plan.operations ? ['operations'] : []),
    ...(plan.smoke ? ['smoke'] : []), ...(plan.files.length ? ['functional'] : []), ...(plan.design ? ['design'] : [])];
}
export function checkGate(plan, results) {
  const required = requiredJobs(plan);
  return required.every(name => results[name] === 'success') && Object.values(results).every(result => ['success','skipped'].includes(result));
}
