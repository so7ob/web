import { expect } from "@playwright/test";
import { test } from "./quota-fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, mkdirSync } from "node:fs";

// The reported regression was structural: one page separated its title from
// its description, while other pages independently positioned their controls.
// Assert the shared alignment in both writing directions and screen widths.
for (const locale of ["ar", "en"])
  for (const mode of ["light", "dark"]) {
    test(`${locale}/${mode}: admin pages share heading and list geometry`, async ({
      page,
    }, info) => {
      test.setTimeout(120000);
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
      await page.addInitScript(
        (colorMode) => localStorage.setItem("so7ob-appearance-mode", colorMode),
        mode,
      );
      const folder = `.migration/design-system/refined/${locale}-${info.project.name}-${mode}`;
      mkdirSync(folder, { recursive: true });
      let headingEdge: number | undefined;
      for (const path of ["users", "settings", "outbox", ""]) {
        await page.goto(`/${locale}/admin${path ? "/" + path : ""}`);
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("html")).toHaveAttribute(
          "data-color-mode",
          mode,
        );
        const heading = page.locator('[data-slot="page-header"]');
        await expect(heading).toHaveCount(1);
        await expect(heading.locator("h1")).toBeVisible();
        const title = (await heading.locator("h1").boundingBox())!;
        const description = (await heading
          .locator(".ds-page-description")
          .boundingBox())!;
        const edge = locale === "ar" ? title.x + title.width : title.x;
        const descriptionEdge =
          locale === "ar" ? description.x + description.width : description.x;
        expect(
          Math.abs(edge - descriptionEdge),
          `${path}: title and description share their leading edge`,
        ).toBeLessThan(1);
        expect(description.y).toBeGreaterThan(title.y);
        headingEdge ??= edge;
        expect(
          Math.abs(edge - headingEdge),
          `${path}: heading stays aligned between pages`,
        ).toBeLessThan(1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (path === "users" || path === "outbox") {
          const list = page.locator('[data-slot="list-workspace"]');
          await expect(list).toBeVisible();
          await expect(list.locator('[data-slot="table"]')).toHaveCount(1);
          await expect(list.locator("th").first()).toHaveCSS(
            "font-size",
            "14px",
          );
        }
        const accessibility = await new AxeBuilder({ page })
          .exclude("iframe")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(accessibility.violations).toEqual([]);
        await page.screenshot({
          path: `${folder}/${path || "dashboard"}.png`,
          fullPage: true,
        });
      }
    });
  }
