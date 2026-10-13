import { expect, type Page } from "@playwright/test";
import { test } from "./quota-fixture";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { createDataSource } from "@so7ob/server";
import { getPortalContent } from "../../apps/web/src/content/portal";

async function login(page: Page) {
  const { prefix, password } = JSON.parse(
    readFileSync(".migration/e2e/run.json", "utf8"),
  );
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
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
  return { "x-csrf-token": csrfToken };
}

test.use({ contextOptions: { reducedMotion: "reduce" } });
for (const locale of ["ar", "en"] as const) {
  test(`${locale}: menu drafts, keyboard order, preview, validation and independent saves`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const headers = await login(page),
      t = getPortalContent(locale),
      tm = t.admin.menus;
    const db = await createDataSource().initialize();
    const snapshot = await db.query("SELECT * FROM MenuItem");
    try {
      for (const location of ["header", "footer"])
        expect(
          (
            await page.request.put("/api/admin/menus", {
              headers,
              data: {
                location,
                items: [
                  {
                    labelAr: "الرابط الأول",
                    labelEn: "First link",
                    url: "/ar/services",
                    enabled: true,
                  },
                  {
                    labelAr: "الرابط الثاني",
                    labelEn: "Second link",
                    pageSlug: "/",
                    enabled: true,
                  },
                ],
              },
            })
          ).status(),
        ).toBe(200);
      await page.goto(`/${locale}/admin/menus`, { waitUntil: "networkidle" });
      await expect(
        page.getByRole("button", { name: tm.save, exact: true }),
      ).toBeDisabled();
      await page.locator("#label-en-0").fill("Header draft");
      await page.getByRole("tab", { name: new RegExp(tm.footer) }).click();
      await page.locator("#label-en-0").fill("Footer draft");
      await page.getByRole("tab", { name: new RegExp(tm.header) }).click();
      await expect(page.locator("#label-en-0")).toHaveValue("Header draft");
      const save = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/v1/admin/menus/checked") &&
          r.request().method() === "PUT",
      );
      await page.getByRole("button", { name: tm.save, exact: true }).click();
      expect((await save).status()).toBe(200);
      await expect(
        page.getByRole("button", { name: tm.save, exact: true }),
      ).toBeDisabled();
      await page.getByRole("tab", { name: new RegExp(tm.footer) }).click();
      await expect(page.locator("#label-en-0")).toHaveValue("Footer draft");
      const down = page
        .getByRole("button", {
          name: new RegExp("^" + t.admin.editor.moveDown),
        })
        .first();
      await down.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#label-en-1")).toHaveValue("Footer draft");
      await page.getByRole("button", { name: "English", exact: true }).click();
      await expect(page.locator("[data-menu-preview] li")).toHaveText([
        "Second link",
        "Footer draft",
      ]);
      await page.locator("#enabled-1").click();
      await expect(page.locator("[data-menu-preview] li")).toHaveText([
        "Second link",
      ]);
      await page
        .getByRole("button", { name: new RegExp("^" + tm.remove + ":") })
        .last()
        .click();
      await page.getByRole("button", { name: tm.cancel, exact: true }).click();
      await expect(page.locator("[data-menu-item]")).toHaveCount(2);
      await page.getByRole("button", { name: tm.add, exact: true }).click();
      await expect(page.locator("#label-ar-2")).toBeFocused();
      await page.getByRole("button", { name: tm.save, exact: true }).click();
      await expect(
        page.getByText(tm.labelRequired, { exact: true }),
      ).toBeFocused();
      await page
        .locator("#label-ar-2")
        .fill("رابط إضافي لاختبار عرض التسميات الطويلة في القائمة");
      await page
        .locator("#label-en-2")
        .fill("An additional menu link with a long descriptive label");
      await page.locator("#page-slug-2").click();
      await page.getByRole("option").filter({ hasText: "(/)" }).click();
      await page.getByRole("button", { name: tm.save, exact: true }).click();
      await expect(
        page.getByRole("button", { name: tm.save, exact: true }),
      ).toBeDisabled();
      const persisted = await (
        await page.request.get("/api/admin/menus")
      ).json();
      expect(persisted.header[0].labelEn).toBe("Header draft");
      expect(
        persisted.footer.map((item: { labelEn: string }) => item.labelEn),
      ).toEqual([
        "Second link",
        "Footer draft",
        "An additional menu link with a long descriptive label",
      ]);
      expect(persisted.footer[1].enabled).toBe(false);
      expect(persisted.footer[2].pageSlug).toBe("");
      if (info.project.name === "desktop") {
        for (const toggle of await page
          .locator('button[aria-controls^="details-"]')
          .all()) {
          if ((await toggle.getAttribute("aria-expanded")) === "false")
            await toggle.click();
        }
        await page.evaluate(() => window.scrollTo(0, 500));
        const preview = await page
          .getByRole("complementary", { name: tm.preview })
          .boundingBox();
        const header = await page.locator("header.sticky").boundingBox();
        expect(preview!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
      }

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: new RegExp("^" + tm.remove + ":") })
        .last()
        .click();
      await page.getByRole("button", { name: tm.remove, exact: true }).click();
      await expect(page.locator("[data-menu-item]")).toHaveCount(2);
      await page.getByRole("button", { name: tm.save, exact: true }).click();
      await expect(
        page.getByRole("button", { name: tm.save, exact: true }),
      ).toBeDisabled();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      mkdirSync(".migration/menus", { recursive: true });
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
        timeout: 10000,
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.migration/menus/${locale}-${info.project.name}.png`,
        fullPage: true,
      });
    } finally {
      await db.transaction(async (manager) => {
        await manager.query("DELETE FROM MenuItem");
        for (const row of snapshot) {
          const keys = Object.keys(row);
          await manager.query(
            "INSERT INTO MenuItem (" +
              keys.map((key) => "`" + key + "`").join(",") +
              ") VALUES (" +
              keys.map(() => "?").join(",") +
              ")",
            keys.map((key) => row[key]),
          );
        }
      });
      await db.destroy();
    }
  });

  test(`${locale}: menu loading errors and uncertain saves preserve draft without retrying`, async ({
    page,
  }) => {
    await login(page);
    const tm = getPortalContent(locale).admin.menus;
    await page.route("**/api/admin/menus", (route) =>
      route.fulfill({
        status: 503,
        json: {
          ok: false,
          code: "internal_error",
          errorId: "synthetic-menu-load",
        },
      }),
    );
    await page.goto(`/${locale}/admin/menus`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: tm.save, exact: true }),
    ).toBeDisabled();
    await page.unroute("**/api/admin/menus");
    await page.getByRole("button", { name: tm.retry, exact: true }).click();
    await page.locator("#label-en-0").fill("Preserved failure draft");
    let writes = 0;
    await page.route("**/api/v1/admin/menus/checked", (route) => {
      writes++;
      return route.fulfill({
        status: 503,
        json: {
          ok: false,
          code: "internal_error",
          errorId: "synthetic-menu-write",
        },
      });
    });
    await page.getByRole("button", { name: tm.save, exact: true }).click();
    await expect(
      page.getByText(tm.refreshNeeded, { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#label-en-0")).toHaveValue(
      "Preserved failure draft",
    );
    await expect(
      page.getByRole("button", { name: tm.save, exact: true }),
    ).toBeDisabled();
    await page.getByRole("tab", { name: new RegExp(tm.footer) }).click();
    await page.getByRole("tab", { name: new RegExp(tm.header) }).click();
    await expect(page.locator("#label-en-0")).toHaveValue(
      "Preserved failure draft",
    );
    await page
      .getByRole("button", { name: tm.reviewSaved, exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: tm.unsaved, exact: true }),
    ).toHaveValue(/Preserved failure draft/);
    await page.getByRole("button", { name: tm.cancel, exact: true }).click();
    expect(writes).toBe(1);
    await expect(page.locator("#label-en-0")).toHaveValue(
      "Preserved failure draft",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}
