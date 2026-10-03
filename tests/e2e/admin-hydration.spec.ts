import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test.use({
  contextOptions: { timezoneId: "Pacific/Honolulu", reducedMotion: "reduce" },
});
for (const locale of ["ar", "en"] as const) {
  test(`${locale}: administrative SSR labels survive a different browser clock and timezone`, async ({
    page,
  }) => {
    const { prefix, password } = JSON.parse(
      readFileSync(".migration/e2e/run.json", "utf8"),
    );
    const { csrfToken } = await (
      await page.request.get("/api/auth/csrf")
    ).json();
    expect(
      (
        await page.request.post("/api/auth/callback/credentials", {
          form: {
            email: prefix + "admin@example.invalid",
            password,
            csrfToken,
            json: "true",
          },
        })
      ).status(),
    ).toBe(200);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2031-01-01T00:00:00.000Z"));
    const response = await page.goto(`/${locale}/admin?range=90`, {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBe(200);
    await expect(page.locator("#main-content h1")).toBeVisible();
    const payload = await page.evaluate(() => window.__SO7OB__);
    if (payload.kind !== "admin" || !payload.admin.dashboard)
      throw new Error("Missing dashboard SSR payload");
    expect(payload.admin.dashboard.presentation.chartBars).toHaveLength(13);
    for (const label of Object.values(
      payload.admin.dashboard.presentation.auditTimes,
    ))
      await expect(
        page.getByText(label, { exact: true }).first(),
      ).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(errors).toEqual([]);
  });
}
