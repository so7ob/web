import { test as base, expect } from '@playwright/test';
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
});
