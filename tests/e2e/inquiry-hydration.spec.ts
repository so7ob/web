import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
import { getPortalContent } from '../../apps/web/src/content/portal';
import { test as quotaTest } from './quota-fixture';

// A new synthetic account makes both create buttons observable regardless of
// records left by another acceptance journey. Teardown has its own fixture budget.
const test = quotaTest.extend<{ inquiryActor: 'admin' | 'owner'; inquiryEmail: string }>({
  inquiryActor: ['owner', { option: true }],
  inquiryEmail: [async ({ inquiryActor }, use) => {
    const { prefix } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const id = prefix + 'hydration' + randomBytes(6).toString('hex');
    const email = id + '@example.invalid';
    const db = await createDataSource().initialize();
    try {
      await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt,locale) SELECT ?,?,'Synthetic hydration',passwordHash,roleKey,'active',UTC_TIMESTAMP(3),locale FROM User WHERE id=?", [id, email, prefix + inquiryActor]);
      await use(email);
    } finally {
      try {
        await db.query('DELETE FROM AuditLog WHERE actorId=?', [id]);
        await db.query('DELETE FROM User WHERE id=?', [id]);
      } finally { await db.destroy(); }
    }
  }, { timeout: 30000 }],
});

for (const actor of ['admin', 'owner'] as const) test.describe(actor, () => {
  test.use({ inquiryActor: actor });
  for (const locale of ['ar', 'en'] as const) for (const journey of ['bootstrap readiness', 'dialog interactions', 'back and delayed reload'] as const) test(`${locale}: ${actor} inquiry ${journey}`, async ({ page, inquiryEmail }, info) => {
    const { password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', {
      form: { email: inquiryEmail, password, csrfToken, json: 'true' },
    })).status()).toBe(200);
    const session = await (await page.request.get('/api/auth/session')).json();
    expect(session.user.email).toBe(inquiryEmail);
    expect(session.user.roleKey).toBe(actor === 'admin' ? 'super_admin' : 'client');
    const t = getPortalContent(locale).account.inquiries;
    const createButtons = page.getByRole('button', { name: t.create, exact: true });
    const errors: string[] = [];
    const timeline: object[] = [];
    let lists = 0, posts = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname !== '/api/account/inquiries') return;
      if (request.method() === 'GET') lists++;
      if (request.method() === 'POST') posts++;
    });

    async function delayedVisit(navigate: () => Promise<unknown>, stage: string) {
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let intercepted = 0;
      const previousLists = lists;
      await page.route('**/assets/inquiries-*.js', async route => {
        intercepted++;
        await gate;
        await route.continue();
      });
      try {
        await navigate();
        const button = createButtons.first();
        await expect(button).toBeVisible();
        await expect(button).toBeDisabled();
        await expect(button).toHaveAttribute('aria-busy', 'true');
        await expect.poll(() => intercepted).toBeGreaterThan(0);
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        // Real early/repeated pointer input must not activate an inert SSR button.
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { clickCount: 2 });
        await button.focus();
        await expect(button).not.toBeFocused();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(lists).toBe(previousLists);
        expect(posts).toBe(0);
        timeline.push({ stage, phase: 'SSR disabled; matched route chunk held; early clicks inert', intercepted, lists, posts });
        release();
        await expect(button).toBeEnabled();
        await expect(button).toHaveAttribute('aria-busy', 'false');
        await expect.poll(() => lists).toBeGreaterThan(previousLists);
        timeline.push({ stage, phase: 'chunk released; React effect ran; create listener ready', lists, posts });
      } finally {
        release();
        await page.unroute('**/assets/inquiries-*.js');
      }
    }

    const headerButton = createButtons.first();
    if (journey === 'bootstrap readiness') {
      await delayedVisit(() => page.goto(`/${locale}/account/inquiries`, { waitUntil: 'commit' }), 'initial');
    } else {
      await page.goto(`/${locale}/account/inquiries`);
      await expect(headerButton).toBeEnabled();
    }
    await headerButton.click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('#inquiry-subject')).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveAccessibleName(t.formTitle);
    if (journey === 'bootstrap readiness') {
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    }
    if (journey === 'dialog interactions') await page.locator('#inquiry-subject').fill('Synthetic discarded inquiry');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(headerButton).toBeFocused();

    if (journey === 'dialog interactions') {
      await expect(createButtons).toHaveCount(2);
      const emptyButton = createButtons.nth(1);
      await expect(emptyButton).toBeEnabled();
      await emptyButton.focus();
      await emptyButton.press('Enter');
      await expect(page.locator('#inquiry-subject')).toHaveValue('');
      await expect(page.locator('#inquiry-subject')).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('[data-slot=dialog-close]')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#inquiry-subject')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(emptyButton).toBeFocused();

      // Native repeated activation is idempotent: one controlled dialog, no POST.
      await headerButton.focus();
      await headerButton.evaluate(button => {
        if (!(button instanceof HTMLButtonElement)) throw new Error('Expected the native inquiry create button');
        button.click(); button.click(); button.click();
      });
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await page.getByRole('button', { name: t.formCancel, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(headerButton).toBeFocused();
    }

    if (journey === 'back and delayed reload') {
      await page.goto(`/${locale}/account`);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/${locale}/account/inquiries$`));
      await headerButton.click();
      await expect(page.locator('#inquiry-subject')).toBeVisible();
      await page.keyboard.press('Escape');
      await delayedVisit(() => page.reload({ waitUntil: 'commit' }), 'reload');
      await headerButton.focus();
      await headerButton.press('Space');
      await expect(page.locator('#inquiry-subject')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(headerButton).toBeFocused();
    }
    expect(posts).toBe(0);
    expect(errors).toEqual([]);
    timeline.push({ phase: journey + ' complete', posts, errors });
    await info.attach('inquiry-bootstrap-timeline', { body: JSON.stringify(timeline, null, 2), contentType: 'application/json' });
  });
});
