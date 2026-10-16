import { test, expect } from '@playwright/test';
import { assertStylesheetsApplied, observeStylesheets } from './stylesheet-readiness';

const origin = 'http://127.0.0.1:3147';
const css = 'html{box-sizing:border-box}a{min-height:44px;display:inline-flex}';
const html = '<link rel="stylesheet" crossorigin href="/main.css"><a href="#">About</a>';

test('stylesheet readiness waits for the real delayed stylesheet', async ({ page }) => {
  const observation = observeStylesheets(page);
  let release!: () => void, requested!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { requested = resolve; });
  await page.route(origin + '/**', async route => {
    if (route.request().resourceType() === 'stylesheet') { requested(); await gate; await route.fulfill({ contentType: 'text/css', body: css }); }
    else await route.fulfill({ contentType: 'text/html', body: html });
  });
  try {
    await page.goto(origin, { waitUntil: 'commit' });
    await started;
    let complete = false;
    const readiness = assertStylesheetsApplied(page).then(() => { complete = true; });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).boxSizing)).toBe('content-box');
    expect(complete).toBe(false);
    release();
    await readiness;
    await expect(page.locator('a')).toHaveCSS('min-height', '44px');
    expect(observation.failures).toEqual([]);
  } finally { release(); observation.dispose(); }
});

for (const failure of ['abort', 'http', 'empty'] as const) test(`stylesheet readiness rejects ${failure} even after a successful XHR`, async ({ page }) => {
  const observation = observeStylesheets(page);
  await page.route(origin + '/**', async route => {
    if (route.request().resourceType() === 'stylesheet') {
      if (failure === 'abort') await route.abort('failed');
      else await route.fulfill({ status: failure === 'http' ? 503 : 200, contentType: 'text/css', body: '' });
    } else if (route.request().resourceType() === 'xhr') await route.fulfill({ contentType: 'text/css', body: css });
    else await route.fulfill({ contentType: 'text/html', body: html });
  });
  try {
    await page.goto(origin);
    const before = [...observation.failures];
    expect(await page.evaluate(() => new Promise<number>(resolve => {
      const xhr = new XMLHttpRequest(); xhr.open('GET', '/main.css'); xhr.onload = () => resolve(xhr.status); xhr.send();
    }))).toBe(200);
    await expect(assertStylesheetsApplied(page)).rejects.toThrow(failure === 'empty' ? 'readable nonempty rules' : 'Terminal stylesheet failures');
    expect(observation.failures).toEqual(before);
    if (failure !== 'empty') expect(before.length).toBeGreaterThan(0);
    await expect(page.locator('a')).toHaveCSS('min-height', '0px');
  } finally { observation.dispose(); }
});

test('a later healthy navigation cannot erase a stylesheet failure', async ({ page }) => {
  const observation = observeStylesheets(page);
  let fail = true;
  await page.route(origin + '/**', async route => {
    if (route.request().resourceType() === 'stylesheet') {
      if (fail) await route.abort('failed');
      else await route.fulfill({ contentType: 'text/css', body: css });
    } else await route.fulfill({ contentType: 'text/html', body: html });
  });
  try {
    await page.goto(origin); fail = false; await page.goto(origin + '/healthy');
    await expect(page.locator('a')).toHaveCSS('min-height', '44px');
    await expect(assertStylesheetsApplied(page)).rejects.toThrow('Terminal stylesheet failures');
  } finally { observation.dispose(); }
});
