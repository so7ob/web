import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { documentAudit, accessibilityTags, VisualReadiness } from './visual-checks';
import type { AxeResults } from 'axe-core';

const violations = (result: AxeResults) => result.violations.map(v => ({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})).sort((a,b)=>a.id.localeCompare(b.id));
for (const locale of ['ar','en']) test(`${locale}: accessibility engine preserves violations, exclusions and fresh DOM scans`, async ({page}) => {
  await page.goto('/api/health/ready');
  await page.setContent(`<!doctype html><html lang="${locale}"><head><title>Pure synthetic accessibility fixture</title></head><body><main><h1>Fixture</h1><button id="empty"></button><label for="name">Name</label><input id="name"><p style="color:#aaa;background:white">Low contrast fixture</p><iframe title="Excluded fixture" srcdoc="<button></button>"></iframe></main></body></html>`);
  const standard = await new AxeBuilder({page}).exclude('iframe').withTags(accessibilityTags).analyze();
  expect(standard.violations.map(v=>v.id)).toContain('button-name');
  const optimized = await documentAudit(page,true);
  expect(violations(optimized)).toEqual(violations(standard));
  await page.locator('#empty').evaluate(button => {button.textContent='Fixed accessible name';});
  const changed = await documentAudit(page,true);
  expect(changed.violations.map(v=>v.id)).not.toContain('button-name');
  expect(violations(changed)).toEqual(violations(await new AxeBuilder({page}).exclude('iframe').withTags(accessibilityTags).analyze()));
  // Frames in scope retain AxeBuilder's cross-frame algorithm, not same-origin-only mode.
  expect(violations(await documentAudit(page))).toEqual(violations(await new AxeBuilder({page}).withTags(accessibilityTags).analyze()));
});

test('visual readiness waits for the real loading state and pending API response', async ({page}) => {
  await page.goto('/api/health/ready');
  const readiness = new VisualReadiness(page);
  let release!:()=>void;
  const held = new Promise<void>(resolve=>{release=resolve;});
  let started!:()=>void;
  const requestStarted = new Promise<void>(resolve=>{started=resolve;});
  await page.route('**/api/readiness-synthetic', async route => {started();await held;await route.fulfill({json:{ok:true}});});
  try {
    await page.setContent('<main><h1>Readiness fixture</h1><div data-slot="skeleton">Pending</div><img loading="lazy" style="position:absolute;top:10000px" width="100" height="100" alt="Offscreen synthetic image" src="/api/offscreen-synthetic-image"></main>');
    await page.evaluate(() => { void fetch('/api/readiness-synthetic'); });
    await requestStarted;
    let ready = false;
    const wait = readiness.wait().then(()=>{ready=true;});
    // There is a real in-flight response and a real loading element. No sleep/retry.
    await expect(page.locator('[data-slot="skeleton"]')).toBeVisible();
    expect(ready).toBe(false);
    const response=page.waitForResponse('**/api/readiness-synthetic');
    release();
    // Loading UI may outlive its response. Keep the readiness promise pending
    // through rendering turns until the application explicitly removes it.
    await response;
    await page.evaluate(() => new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    expect(ready).toBe(false);
    await page.locator('[data-slot="skeleton"]').evaluate(element=>element.remove());
    await wait;
    expect(ready).toBe(true);
    expect(await page.locator('img').evaluate(image=>(image as HTMLImageElement).complete)).toBe(false);
  } finally {release();readiness.dispose();}
});
