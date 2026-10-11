import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const locale of ['ar', 'en'] as const) {
  test(locale + ' footer links keep usable pointer targets and keyboard navigation', async ({ page }) => {
    await page.goto('/' + locale + '/auth/reset-password?token=' + 'a'.repeat(64), { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await page.evaluate(() => document.fonts.ready);
    const links = page.locator('footer a');
    const destinations = await links.evaluateAll(elements => elements.map(element => element.getAttribute('href')));
    expect(destinations).toContain('/' + locale + '/services#maintenance');
    const assertTargets = async () => {
      for (const link of await links.all()) {
        const box = await link.boundingBox();
        expect(box, await link.getAttribute('href') ?? 'footer link').not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(24);
        expect(box!.height).toBeGreaterThanOrEqual(24);
      }
    };
    await assertTargets();
    await links.first().focus();
    for (let index = 1; index < await links.count(); index++) {
      await page.keyboard.press('Tab');
      await expect(links.nth(index)).toBeFocused();
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    // The pointer area must survive a fallback font, rather than depending on glyph dimensions.
    await page.addStyleTag({ content: 'footer a { font-family: Arial, sans-serif !important; }' });
    await assertTargets();
    expect(await links.evaluateAll(elements => elements.map(element => element.getAttribute('href')))).toEqual(destinations);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    const service = page.locator('footer a[href="/' + locale + '/services#maintenance"]');
    await service.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp('/' + locale + '/services#maintenance$'));
  });
}
