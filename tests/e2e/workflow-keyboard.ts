import { expect, type Locator, type Page } from '@playwright/test';

type FocusWaiter = (option: Locator) => Promise<void>;
const exactFocus: FocusWaiter = async option => { await expect(option).toBeFocused(); };

// The injectable waiter lets the regression hold Radix's real deferred focus tasks.
export async function selectByKeyboard(page: Page, label: string, waitForFocus: FocusWaiter = exactFocus) {
  const option = page.getByRole('option', { name: label, exact: true });
  const options = page.getByRole('option', { disabled: false });
  await expect(option).toBeVisible();
  await expect.poll(() => page.getByRole('listbox').evaluate(listbox => listbox.contains(document.activeElement))).toBe(true);
  const targetIndex = await option.evaluate(element =>
    Array.from(element.closest('[role="listbox"]')!.querySelectorAll('[role="option"]'))
      .filter(node => node.getAttribute('aria-disabled') !== 'true').indexOf(element),
  );
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  // The selected current-stage item may be disabled, so its enabled index is -1.
  let current = await options.evaluateAll(nodes => nodes.findIndex(node => node === document.activeElement));
  while (current !== targetIndex) {
    const next = current + (current < targetIndex ? 1 : -1);
    await page.keyboard.press(next > current ? 'ArrowDown' : 'ArrowUp');
    // Radix schedules focus with setTimeout; key dispatch alone is not completion.
    await waitForFocus(options.nth(next));
    current = next;
  }
  await expect(option).toBeFocused(); await page.keyboard.press('Enter');
}
