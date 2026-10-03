import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { getPortalContent } from '../../apps/web/src/content/portal';

for (const locale of ['ar', 'en'] as const) {
  test(`${locale}: delayed login hydration retains first keyboard credentials and reloadable session`, async ({ page }) => {
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const email = prefix + 'owner@example.invalid';
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let intercepted = 0;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/assets/auth-*.js', async route => { intercepted++; await gate; await route.continue(); });
    try {
      await page.goto(`/${locale}/auth/login`, { waitUntil: 'commit' });
      const emailField = page.locator('#login-email');
      const passwordField = page.locator('#login-password');
      await expect(emailField).toBeVisible();
      await expect(emailField).toBeDisabled();
      await expect(passwordField).toBeDisabled();
      await expect(page.locator('form button[type=submit]')).toBeDisabled();
      await expect.poll(() => intercepted).toBeGreaterThan(0);
      release();
      await expect(emailField).toBeEnabled();
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
      await emailField.focus();
      await page.keyboard.type(email);
      await page.keyboard.press('Tab');
      await expect(passwordField).toBeFocused();
      await page.keyboard.type(password);
      const submitted = page.waitForResponse(response => response.url().endsWith('/api/auth/callback/credentials') && response.request().method() === 'POST');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      const response = await submitted;
      expect(response.status()).toBe(200);
      const form = new URLSearchParams(response.request().postData()!);
      expect(form.get('email')).toBe(email);
      expect(form.get('password')).toBe(password);
      await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
      expect((await (await page.request.get('/api/auth/session')).json()).user.id).toBe(prefix + 'owner');
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
      expect(errors).toEqual([]);
    } finally {
      release();
      await page.unroute('**/assets/auth-*.js');
    }
  });
  test(`${locale}: rejected credentials use the pinned source message without account disclosure`, async ({ page }) => {
    await page.goto(`/${locale}/auth/login`);
    await page.locator('#login-email').fill('missing-hydration@example.invalid');
    await page.locator('#login-password').fill('Synthetic-Wrong-4929');
    await page.locator('form button[type=submit]').click();
    await expect(page.getByRole('alert')).toHaveText(getPortalContent(locale).auth.errors.credentials);
  });
}
