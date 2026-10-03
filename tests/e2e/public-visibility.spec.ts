import { test, expect } from "@playwright/test";

for (const motion of ["reduce", "no-preference"] as const) {
  test.describe(`public hero with motion preference ${motion}`, () => {
    test.use({ contextOptions: { reducedMotion: motion } });
    for (const locale of ["ar", "en"] as const) {
      test(`${locale}: public heading and illustration become visibly opaque after hydration`, async ({
        page,
      }, info) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const response = await page.goto(`/${locale}`, {
          waitUntil: "networkidle",
        });
        expect(response?.status()).toBe(200);
        const heading = page.locator("h1").first();
        await expect(heading).toContainText(
          locale === "ar" ? "تُمطِرُ" : "Raining",
        );
        await expect
          .poll(() =>
            heading.evaluate((element) => {
              for (
                let parent: Element | null = element;
                parent;
                parent = parent.parentElement
              ) {
                const style = getComputedStyle(parent);
                if (
                  Number(style.opacity) < 0.99 ||
                  style.visibility !== "visible" ||
                  style.display === "none"
                )
                  return false;
              }
              return true;
            }),
          )
          .toBe(true);
        const section = heading.locator("xpath=ancestor::section[1]");
        await expect
          .poll(() =>
            section
              .locator(".relative.mx-auto > div")
              .last()
              .evaluate((element) => Number(getComputedStyle(element).opacity)),
          )
          .toBe(1);
        expect(
          await page.evaluate(
            () => matchMedia("(prefers-reduced-motion: reduce)").matches,
          ),
        ).toBe(motion === "reduce");
        await info.attach(`visible-hero-${locale}-${motion}`, {
          body: await page.screenshot(),
          contentType: "image/png",
        });
        expect(errors).toEqual([]);
      });
    }
  });
}
