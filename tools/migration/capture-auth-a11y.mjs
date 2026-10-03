import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch(); const baseline={ source:'Website@5321b7fd11db421c83290b262f276811e5f04e5f',cases:{} };
try {
  for (const width of [375,1280]) for (const locale of ['ar','en']) {
    const context=await browser.newContext({viewport:{width,height:width===375?812:900},locale:'en-US',timezoneId:'Asia/Aden'}); const page=await context.newPage();
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto(`http://127.0.0.1:3107/${locale}/auth/register`,{waitUntil:'networkidle'}); await page.evaluate(()=>document.fonts.ready);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze(); const fingerprints=[];
    for (const violation of result.violations) for (const node of violation.nodes) {
      const signature=await page.locator(node.target[0]).first().evaluate(el=>({ tag:el.tagName,role:el.getAttribute('role'),type:el.getAttribute('type'),label:el.getAttribute('aria-label'),text:el.textContent?.replace(/\s+/g,' ').trim(),href:el.getAttribute('href') }));
      fingerprints.push(JSON.stringify({id:violation.id,impact:violation.impact,...signature}));
    }
    baseline.cases[`${width}:${locale}`]=fingerprints.sort(); await context.close();
  }
  writeFileSync('tests/e2e/fixtures/auth-axe-baseline.json',JSON.stringify(baseline,null,2)+'\n');
} finally { await browser.close(); }
