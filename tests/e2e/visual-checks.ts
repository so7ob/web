import { expect, type Page, type Request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const accessibilityTags = ['wcag2a','wcag2aa','wcag21aa','wcag22aa'];
/** The parent excludes every iframe and audits srcdoc previews separately.
 * axe.run uses the same rules without creating a blank result page for each scan.
 * Keep the standard cross-frame implementation whenever frames are in scope.
 */
export function documentAudit(page: Page, excludeFrames = false) {
  let builder = new AxeBuilder({page}).withTags(accessibilityTags);
  if (excludeFrames) builder = builder.exclude('iframe');
  if (excludeFrames || page.frames().length === 1) builder = builder.setLegacyMode(true);
  return builder.analyze();
}

export class VisualReadiness {
  private readonly pending = new Set<Request>();
  private readonly start = (request: Request) => {
    if (['xhr','fetch'].includes(request.resourceType()) && new URL(request.url()).origin === new URL(this.page.url()).origin)
      this.pending.add(request);
  };
  private readonly finish = (request: Request) => { this.pending.delete(request); };
  constructor(private readonly page: Page) {
    page.on('request',this.start);
    page.on('requestfinished',this.finish);
    page.on('requestfailed',this.finish);
  }
  async wait() {
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.locator('main').first()).toBeVisible();
    // Theme controls are disabled by SSR until their client effect is interactive.
    const theme = this.page.locator('header select').filter({visible:true}).first();
    if (await theme.count()) await expect(theme).toBeEnabled();
    // Flush effects/paint so a new tab's fetch is observed, rather than wait 500ms
    // for every tab, dialog and screenshot regardless of application readiness.
    await this.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(() => this.pending.size, { intervals:[25,50,100] }).toBe(0);
    await expect(this.page.locator('main [data-slot="skeleton"], main[aria-busy="true"], main [aria-busy="true"]').filter({visible:true})).toHaveCount(0);
    await this.page.evaluate(() => document.fonts.ready);
    await this.page.waitForFunction(() => Array.from(document.images).every(image => {
      const rect=image.getBoundingClientRect();
      // Native lazy loading intentionally leaves offscreen images pending.
      // Wait for images visible in the current viewport, as the user sees them.
      return !rect.width || !rect.height || rect.bottom<=0 || rect.top>=innerHeight || rect.right<=0 || rect.left>=innerWidth || image.complete;
    }));
    await this.page.locator('body').evaluate(async root => {
      await Promise.all(root.getAnimations({subtree:true})
        .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => undefined)));
    });
    await this.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(() => this.pending.size, { intervals:[25,50,100] }).toBe(0);
  }
  dispose() {
    this.page.off('request',this.start);
    this.page.off('requestfinished',this.finish);
    this.page.off('requestfailed',this.finish);
  }
}
