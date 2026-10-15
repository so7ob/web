import { expect, type Locator, type Page } from '@playwright/test';

type FocusWaiter = (option: Locator) => Promise<void>;
const exactFocus: FocusWaiter = async option => { await expect(option).toBeFocused(); };

// The injectable waiter lets the regression hold Radix's real deferred focus tasks.
export async function selectByKeyboard(page: Page, label: string, waitForFocus: FocusWaiter = exactFocus) {
  const option = page.getByRole('option', { name: label, exact: true });
  const options = page.getByRole('option');
  for (let index = 0; index < await options.count(); index++) {
    if (await option.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await waitForFocus(option); await page.keyboard.press('Enter');
}
