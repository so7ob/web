import { expect, type Page } from "@playwright/test";
import { test } from "./quota-fixture";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { createDataSource } from "@so7ob/server";
import { SECTION_KEYS } from "@so7ob/contracts";
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
async function section(page: Page, name: string) {
  await page.locator(`a[href="?section=${name}"]`).click();
}
async function save(page: Page, locale: "ar" | "en") {
  const pending = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" && r.url().endsWith("/settings/checked"),
  );
  await page
    .getByRole("button", {
      name: getPortalContent(locale).admin.settings.save,
      exact: true,
    })
    .click();
  expect((await pending).status()).toBe(200);
  await expect(
    page.getByRole("button", {
      name: getPortalContent(locale).admin.settings.save,
      exact: true,
    }),
  ).toBeDisabled();
}
// The preview intentionally disables scripts. Run axe against its exact document in
// a separate test page, since axe's asynchronous frame scan needs script timers.
async function auditSettings(page: Page) {
  const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
  await expect(page.locator("iframe")).toHaveAttribute("title", /.+/);
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-same-origin");
  expect((await new AxeBuilder({ page }).exclude("iframe").withTags(tags).analyze()).violations).toEqual([]);
  const preview = await page.context().newPage();
  try {
    await preview.goto(new URL("/api/health/ready", page.url()).href);
    const markup = await page.locator("iframe").getAttribute("srcdoc");
    expect(markup).toBeTruthy();
    await preview.setContent(markup!);
    await preview.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page: preview }).withTags(tags).analyze()).violations).toEqual([]);
  } finally {
    await preview.close();
  }
}
test.use({ contextOptions: { reducedMotion: "reduce" } });
for (const locale of ["ar", "en"] as const)
  test(`${locale}: independent settings drafts, safe writes and site-wide appearance`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);
    const headers = await login(page),
      db = await createDataSource().initialize();
    const keys = Object.values(SECTION_KEYS).flat(),
      rows = await db.query(
        "SELECT * FROM SiteSetting WHERE `key` IN (" +
          keys.map(() => "?").join(",") +
          ")",
        keys,
      );
    try {
      expect(
        (
          await page.request.patch("/api/admin/settings", {
            headers,
            data: {
              "appearance.mode": "light",
              "appearance.primaryLight": "#0369a1",
              "appearance.fontAr": "ibm",
              "appearance.fontEn": "ibm",
            },
          })
        ).status(),
      ).toBe(200);
      await page.goto(`/${locale}/admin/settings`, {
        waitUntil: "networkidle",
      });
      await page.locator("#site-name-en").fill("Synthetic identity");
      await section(page, "contact");
      await page.locator("#contact-address").fill("Independent contact draft");
      await page.route("**/api/v1/public/view?**", (route) => route.abort());
      await section(page, "appearance");
      await page.locator("#appearance-mode").selectOption("dark");
      await page.locator("#appearance-primary-light").fill("#0f766e");
      await page.locator("#appearance-font-ar").selectOption("cairo");
      await page.locator("#appearance-font-en").selectOption("inter");
      await expect(page.locator("html")).toHaveAttribute(
        "data-color-mode",
        "light",
      );
      await save(page, locale);
      await expect(page.locator("html")).toHaveAttribute(
        "data-color-mode",
        "dark",
      );
      await section(page, "identity");
      await expect(page.locator("#site-name-en")).toHaveValue(
        "Synthetic identity",
      );
      await save(page, locale);
      await section(page, "contact");
      await expect(page.locator("#contact-address")).toHaveValue(
        "Independent contact draft",
      );
      await save(page, locale);
      await page
        .locator("#social-linkedin")
        .fill("https://example.invalid/company");
      await save(page, locale);
      await section(page, "sharing");
      await page
        .locator("#sharing-description-en")
        .fill("Synthetic search description");
      await save(page, locale);
      await page.unroute("**/api/v1/public/view?**");
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => getComputedStyle(document.body).fontFamily),
      ).toContain(locale === "ar" ? "Cairo" : "Inter");
      expect(
        await page.evaluate(
          (font) =>
            Array.from(document.fonts).some(
              (f) => f.family === font && f.status === "loaded",
            ),
          locale === "ar" ? "Cairo" : "Inter",
        ),
      ).toBe(true);
      const html = await (await page.request.get("/en")).text();
      expect(html).toContain("Synthetic identity");
      expect(html).toContain("Synthetic search description");
      expect(html).toContain("https://example.invalid/company");
      expect(html).toContain("Inter");
      expect(html).not.toContain("track.linkTtlDays");
      await section(page, "appearance");
      await page.locator("#appearance-primary-light").fill("not-a-color");
      await page
        .getByRole("button", {
          name: getPortalContent(locale).admin.settings.save,
          exact: true,
        })
        .click();
      await expect(page.locator('[role=alert][tabindex="-1"]')).toBeFocused();
      await expect(page.locator("#appearance-primary-light")).toHaveValue(
        "not-a-color",
      );
      await page.locator("#appearance-primary-light").fill("#0369a1");
      await page.route("**/api/v1/admin/settings/checked", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, code: "internal_error" }),
        }),
      );
      await page
        .getByRole("button", {
          name: getPortalContent(locale).admin.settings.save,
          exact: true,
        })
        .click();
      await expect(
        page.getByLabel(
          locale === "ar" ? "مسودة تعديلاتك المحفوظة" : "Your preserved draft",
        ),
      ).toHaveValue(/#0369a1/);
      await expect(page.locator("#appearance-primary-light")).toHaveValue(
        "#0369a1",
      );
      await expect(
        page.getByRole("button", {
          name: getPortalContent(locale).admin.settings.save,
          exact: true,
        }),
      ).toBeDisabled();
      await page.unroute("**/api/v1/admin/settings/checked");
      await page
        .getByRole("button", {
          name:
            locale === "ar"
              ? "إعادة تحميل مع الاحتفاظ بالمسودة"
              : "Reload and keep draft",
          exact: true,
        })
        .click();
      await expect(page.locator("#appearance-primary-light")).toHaveValue(
        "#0f766e",
      );
      await page
        .getByRole("button", {
          name:
            locale === "ar"
              ? "إزالة المسودة بعد المراجعة"
              : "Dismiss reviewed draft",
        })
        .click();
      for (const mode of ["light", "dark"]) {
        await page
          .getByLabel(locale === "ar" ? "وضع العرض" : "Color mode", {
            exact: true,
          })
          .selectOption(mode);
        await expect(page.locator("html")).toHaveAttribute(
          "data-color-mode",
          mode,
        );
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.locator("html")).toHaveAttribute(
          "data-color-mode",
          mode,
        );
        await page.locator("#appearance-mode").focus();
        await page.keyboard.press("Tab");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await auditSettings(page);
        mkdirSync(".migration/settings", { recursive: true });
        await page.screenshot({
          path: `.migration/settings/${locale}-${info.project.name}-${mode}.png`,
          fullPage: true,
        });
      }
      await page.goto(`/${locale}`, { waitUntil: "networkidle" });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator("html")).toHaveAttribute(
        "data-color-mode",
        "dark",
      );
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.goto(`/${locale}/account`, { waitUntil: "networkidle" });
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    } finally {
      await page.unroute("**/api/v1/admin/settings/checked").catch(() => {});
      await db.transaction(async (m) => {
        await m.query(
          "DELETE FROM SiteSetting WHERE `key` IN (" +
            keys.map(() => "?").join(",") +
            ")",
          keys,
        );
        for (const row of rows) {
          const columns = Object.keys(row);
          await m.query(
            "INSERT INTO SiteSetting (" +
              columns.map((k) => "`" + k + "`").join(",") +
              ") VALUES (" +
              columns.map(() => "?").join(",") +
              ")",
            columns.map((k) => row[k]),
          );
        }
      });
      await db.destroy();
      void headers;
    }
  });

test("identity media selection, favicon and published page sharing precedence", async ({
  page,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const headers = await login(page),
    db = await createDataSource().initialize();
  const keys = ["identity.logoEnLight", "identity.icon", "sharing.image"];
  const rows = await db.query(
    "SELECT * FROM SiteSetting WHERE `key` IN (?,?,?)",
    keys,
  );
  const prefix = "settings-media-" + Date.now(),
    ids: string[] = [];
  try {
    const sharp = (await import("sharp")).default;
    for (const color of ["#0369a1", "#6d28d9"]) {
      const buffer = await sharp({
        create: { width: 64, height: 64, channels: 4, background: color },
      })
        .png()
        .toBuffer();
      const uploaded = await page.request.post("/api/admin/media", {
        headers,
        multipart: {
          file: {
            name: prefix + "-" + ids.length + ".png",
            mimeType: "image/png",
            buffer,
          },
        },
      });
      expect(uploaded.status()).toBe(201);
      ids.push((await uploaded.json()).media.id);
    }
    await page.goto("/en/admin/settings?section=identity", {
      waitUntil: "networkidle",
    });
    for (const key of ["identity-logo-en-light", "identity-icon"]) {
      await page.locator("#" + key).click();
      await page
        .getByRole("button", {
          name:
            getPortalContent("en").admin.editor.mediaLibrary +
            ": " +
            prefix +
            "-0.png",
          exact: true,
        })
        .click();
    }
    await save(page, "en");
    await expect(page.locator("head link[rel=icon]")).toHaveAttribute(
      "href",
      "/api/media/" + ids[0],
    );
    await section(page, "sharing");
    await page.locator("#sharing-image").click();
    await page
      .getByRole("button", {
        name:
          getPortalContent("en").admin.editor.mediaLibrary +
          ": " +
          prefix +
          "-0.png",
        exact: true,
      })
      .click();
    await save(page, "en");
    expect(
      (
        await page.request.delete("/api/admin/media/" + ids[0], { headers })
      ).status(),
    ).toBe(409);
    const html = await (await page.request.get("/en")).text();
    expect(html).toContain('property="og:image"');
    expect(html).toContain("/api/media/" + ids[0]);
    await db.query(
      "INSERT INTO Page(id,slug,titleAr,titleEn,status,publishedSettings,publishedBlocksAr,publishedBlocksEn) VALUES(?,?,?,?,'published',?,'[]','[]')",
      [
        prefix,
        prefix,
        "صفحة اصطناعية",
        "Synthetic sharing page",
        JSON.stringify({
          slug: prefix,
          visibility: "public",
          titleAr: "صفحة اصطناعية",
          titleEn: "Synthetic sharing page",
          seoDescEn: "Published page description",
          ogMediaId: ids[1],
        }),
      ],
    );
    await db.query(
      "UPDATE Page SET publishedBlocksAr=?,publishedBlocksEn=? WHERE id=?",
      [
        JSON.stringify({
          schemaVersion: 1,
          blocks: [
            {
              id: "title",
              type: "heading",
              props: { text: "Published synthetic page" },
            },
          ],
        }),
        JSON.stringify({
          schemaVersion: 1,
          blocks: [
            {
              id: "title",
              type: "heading",
              props: { text: "Published synthetic page" },
            },
          ],
        }),
        prefix,
      ],
    );
    const pageHtml = await (await page.request.get("/en/" + prefix)).text();
    expect(pageHtml).toContain('content="Published page description"');
    expect(pageHtml).toMatch(
      new RegExp(
        'property="og:image" content="[^"]*/api/media/' + ids[1] + '"',
      ),
    );
    await page.getByLabel("Color mode", { exact: true }).selectOption("system");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-mode",
      "dark",
    );
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-mode",
      "light",
    );
  } finally {
    await db.query("DELETE FROM Page WHERE id=?", [prefix]);
    await db.query("DELETE FROM SiteSetting WHERE `key` IN (?,?,?)", keys);
    for (const row of rows) {
      const columns = Object.keys(row);
      await db.query(
        "INSERT INTO SiteSetting (" +
          columns.map((k) => "`" + k + "`").join(",") +
          ") VALUES (" +
          columns.map(() => "?").join(",") +
          ")",
        columns.map((k) => row[k]),
      );
    }
    for (const id of ids)
      await page.request
        .delete("/api/admin/media/" + id, { headers })
        .catch(() => {});
    await db.destroy();
  }
});

for (const locale of ["ar", "en"] as const)
  test(`${locale}: dark administrative surfaces remain readable and contained`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await login(page);
    await page.addInitScript(() =>
      localStorage.setItem("so7ob-appearance-mode", "dark"),
    );
    for (const screen of [
      "requests",
      "inquiries",
      "menus",
      "media",
      "workflows",
    ]) {
      await page.goto(`/${locale}/admin/${screen}`, {
        waitUntil: "networkidle",
      });
      await expect(page.locator("html")).toHaveAttribute(
        "data-color-mode",
        "dark",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, screen).toEqual([]);
    }
  });
