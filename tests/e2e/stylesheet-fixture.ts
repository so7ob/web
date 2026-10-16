import { test as base, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { observeStylesheets } from './stylesheet-readiness';

export const test = base.extend({
  page: async ({ page }, use, info) => {
    const observation = observeStylesheets(page);
    try { await use(page); }
    finally {
      if (observation.failures.length) await info.attach('terminal-stylesheet-failures', {
        body: JSON.stringify(observation.failures), contentType: 'application/json',
      });
      observation.dispose();
      expect(observation.failures, 'No terminal stylesheet failure may be hidden by later requests').toEqual([]);
    }
  },
  browser: [async ({ playwright, browserName, launchOptions, headless, channel }, use, info) => {
    if (browserName !== 'chromium') throw new Error('Stylesheet transport diagnostics require Chromium');
    const directory = resolve('.migration/e2e/netlog');
    mkdirSync(directory, { recursive: true });
    const browser = await playwright.chromium.launch({ ...launchOptions, headless, channel,
      args: [...(launchOptions.args ?? []), `--log-net-log=${directory}/worker-${info.workerIndex}.json`, '--net-log-max-size-mb=20'],
    });
    try { await use(browser); } finally { await browser.close(); }
  }, { scope: 'worker' }],
});
