import { expect, type Page, type Request, type Response } from '@playwright/test';

// Keep terminal failures for the whole journey. A later fetch/XHR or navigation
// must never erase evidence that a document's real stylesheet failed.
const histories = new WeakMap<Page, string[]>();
export function observeStylesheets(page: Page) {
  const failures: string[] = [];
  histories.set(page, failures);
  const failed = (request: Request) => {
    if (request.resourceType() === 'stylesheet') failures.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`);
  };
  const response = (response: Response) => {
    if (response.request().resourceType() === 'stylesheet' && response.status() >= 400)
      failures.push(`${new URL(response.url()).pathname}: HTTP ${response.status()}`);
  };
  page.on('requestfailed', failed);
  page.on('response', response);
  return { failures, dispose: () => { page.off('requestfailed', failed); page.off('response', response); histories.delete(page); } };
}

export async function assertStylesheetsApplied(page: Page) {
  const failures = histories.get(page);
  if (!failures) throw new Error('Install stylesheet observation before navigating');
  // Poll only document state, never reload or issue replacement HTTP requests.
  await expect(async () => {
    expect(failures, 'Terminal stylesheet failures before layout/accessibility checks').toEqual([]);
    const state = await page.evaluate(() => {
      const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')];
      return {
        sheets: links.map(link => {
          try {
            return { path: new URL(link.href).pathname, applied: !link.disabled && !!link.sheet && link.sheet.cssRules.length > 0 };
          } catch {
            // Chromium can expose .sheet after a failed crossorigin load, while
            // accessing cssRules throws SecurityError. .sheet alone is not proof.
            return { path: new URL(link.href).pathname, applied: false };
          }
        }),
        // The application's real Tailwind preflight changes the root box model.
        // Do not insert probe CSS, which would itself make an unstyled page pass.
        boxSizing: getComputedStyle(document.documentElement).boxSizing,
      };
    });
    expect(state.sheets.length, 'Document must contain its real stylesheet').toBeGreaterThan(0);
    expect(state.sheets.filter(sheet => !sheet.applied), 'Stylesheets must have readable nonempty rules').toEqual([]);
    expect(state.boxSizing, 'Application preflight must be applied').toBe('border-box');
    expect(failures, 'Preserve failures arriving during readiness checks').toEqual([]);
  }).toPass({ timeout: 5000 });
}
