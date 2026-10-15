import { expect, type Locator, type Page } from '@playwright/test';

/** Establish the base pointer state without changing focus, styles or hover rules. */
export async function movePointerOutside(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox(), viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('Pointer normalization requires a visible control and viewport');
  const neutral = [
    { x: 0, y: 0 }, { x: viewport.width - 1, y: 0 },
    { x: 0, y: viewport.height - 1 }, { x: viewport.width - 1, y: viewport.height - 1 },
  ].find(point => point.x < box.x || point.x > box.x + box.width || point.y < box.y || point.y > box.y + box.height);
  if (!neutral) throw new Error('No neutral viewport corner outside the measured control');
  await page.mouse.move(neutral.x, neutral.y);
  await expect.poll(() => control.evaluate(element => element.matches(':hover'))).toBe(false);
}
