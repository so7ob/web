import { expect } from "@playwright/test";
import { test } from "./quota-fixture";
import AxeBuilder from "@axe-core/playwright";
import { getPortalContent } from "../../apps/web/src/content/portal";
import { createDataSource } from "@so7ob/server";
import { readFileSync, mkdirSync } from "node:fs";

// The reported regression was structural: one page separated its title from
// its description, while other pages independently positioned their controls.
// Assert the shared alignment in both writing directions and screen widths.
for (const locale of ["ar", "en"] as const)
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
      const db = await createDataSource().initialize();
      const emailId = `${prefix}-layout-${locale}-${mode}-${info.project.name}`;
      await db.query(
        "INSERT INTO EmailLog(id,`to`,subject,bodyText,status,createdAt) VALUES(?,?,?,'synthetic layout fixture','queued',UTC_TIMESTAMP(3))",
        [
          emailId,
          "long-synthetic-recipient-address-for-layout@example.invalid",
          "Synthetic outbox subject with enough text to verify that long content wraps inside the desktop workspace without hiding the status column",
        ],
      );
      let headingEdge: number | undefined;
      try {
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
            if (path === "outbox" && info.project.name === "desktop") {
              const scroller = list.locator('[data-slot="table-container"]');
              expect(
                await scroller.evaluate(
                  (el) => el.scrollWidth <= el.clientWidth,
                ),
                "four-column outbox fits the desktop workspace",
              ).toBe(true);
            }
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
          if (path === "users") {
            const search = page.getByRole("textbox", {
              name: getPortalContent(locale).admin.users.search,
              exact: true,
            });
            await search.fill(prefix + "-no-matching-layout-user");
            const empty = page.locator('[data-slot="empty-state"]');
            await expect(empty).toBeVisible();
            const box = (await empty.boundingBox())!;
            expect(
              box.x,
              "empty feedback stays inside the viewport",
            ).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(
              page.viewportSize()!.width,
            );
            await search.fill("");
            await expect(page.locator('[data-slot="table"]')).toBeVisible();
          }
        }
      } finally {
        await db.query("DELETE FROM EmailLog WHERE id=?", [emailId]);
        await db.destroy();
      }
    });
  }
