import { test, expect, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { createDataSource } from "@so7ob/server";
import { getPortalContent } from "../../apps/web/src/content/portal";
test.use({ contextOptions: { reducedMotion: "reduce" } });
const fixture = () =>
  JSON.parse(readFileSync(".migration/e2e/run.json", "utf8")) as {
    prefix: string;
    password: string;
  };
async function login(
  context: APIRequestContext,
  email: string,
  password: string,
) {
  const { csrfToken } = await (await context.get("/api/auth/csrf")).json();
  expect(
    (
      await context.post("/api/auth/callback/credentials", {
        form: { email, password, csrfToken, json: "true" },
      })
    ).status(),
  ).toBe(200);
  return { "x-csrf-token": csrfToken };
}
for (const locale of ["ar", "en"] as const) {
  test(`administrator routes, full editor and immediate published HTML (${locale})`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const { prefix, password } = fixture(),
      t = getPortalContent(locale),
      headers = await login(
        page.request,
        prefix + "admin@example.invalid",
        password,
      ),
      db = await createDataSource().initialize();
    const errors: string[] = [],
      failed: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400 && new URL(r.url()).pathname.startsWith("/api/"))
        failed.push(r.status() + " " + new URL(r.url()).pathname);
    });
    let pageId = "";
    const slug = prefix + "-cms-" + locale + "-" + info.project.name;
    try {
      for (const section of [
        "",
        "users",
        "requests",
        "inquiries",
        "notifications",
        "pages",
        "media",
        "menus",
        "settings",
        "audit",
        "outbox",
      ]) {
        const response = await page.goto(
          `/${locale}/admin${section ? "/" + section : ""}`,
          { waitUntil: "networkidle" },
        );
        expect(response?.status()).toBe(200);
        await expect(page.locator("#admin-shell")).toBeVisible();
        await expect(page.locator("#main-content h1").first()).toBeVisible();
        expect(await page.locator("html").getAttribute("dir")).toBe(
          locale === "ar" ? "rtl" : "ltr",
        );
        const content = await page.locator("#main-content").innerText();
        expect(content).not.toContain(t.auth.errors.generic);
      }
      await page.goto(`/${locale}/admin/users/${prefix}owner`);
      await expect(
        page
          .getByText(prefix + "owner@example.invalid", { exact: true })
          .first(),
      ).toBeVisible();
      const created = await page.request.post("/api/admin/pages", {
        headers,
        data: {
          slug,
          titleAr: "صفحة اختبار المحرر",
          titleEn: "Editor acceptance page",
          template: "blank-section",
        },
      });
      expect(created.status()).toBe(201);
      pageId = (await created.json()).page.id;
      await page.goto(`/${locale}/admin/pages/${pageId}/edit`, {
        waitUntil: "networkidle",
      });
      await expect(
        page.getByRole("button", { name: t.admin.editor.undo, exact: true }),
      ).toBeVisible();
      // The original quick palette is keyboard-accessible on both mobile and desktop.
      await page.keyboard.press("Control+/");
      const palette = page.getByRole("dialog", {
        name: t.admin.editor.quickAdd,
        exact: true,
      });
      await expect(palette).toBeVisible();
      await palette
        .getByPlaceholder(t.admin.editor.searchBlocks)
        .fill(locale === "ar" ? "عنوان" : "Heading");
      await palette
        .getByRole("option", {
          name: new RegExp(locale === "ar" ? "عنوان" : "Heading"),
        })
        .last()
        .click();
      await expect(palette).not.toBeVisible();
      if (info.project.name === "mobile")
        await expect(
          page.getByRole("dialog", {
            name: t.admin.editor.properties,
            exact: true,
          }),
        ).toBeVisible();
      const title = "Published " + locale + " " + info.project.name;
      const properties =
        info.project.name === "mobile"
          ? page.getByRole("dialog", {
              name: t.admin.editor.properties,
              exact: true,
            })
          : page;
      await properties.getByRole("textbox", { name: locale === "ar" ? "النص" : "Text", exact: true }).fill(title);
      if (info.project.name === "mobile") await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: t.admin.editor.undo, exact: true })
        .click();
      await page
        .getByRole("button", { name: t.admin.editor.redo, exact: true })
        .click();
      await expect
        .poll(
          async () => {
            const result = await (
              await page.request.get("/api/admin/pages/" + pageId)
            ).json();
            return result.page.draftBlocksAr + result.page.draftBlocksEn;
          },
          { timeout: 15000 },
        )
        .toContain(title);
      await page
        .getByRole("button", { name: t.admin.editor.publish, exact: true })
        .click();
      await expect
        .poll(async () => {
          const result = await (
            await page.request.get("/api/admin/pages/" + pageId)
          ).json();
          return result.page.status;
        })
        .toBe("published");
      const rendered = await page.request.get(`/${locale}/${slug}`);
      expect(rendered.status()).toBe(200);
      const html = await rendered.text();
      expect(html).toContain(title);
      expect(html).toContain('rel="canonical"');
      expect(html).toContain('property="og:title"');
      await page.goto(
        `/${locale}/admin/pages/${pageId}/preview?locale=${locale}&device=mobile`,
      );
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await page.goto(`/${locale}/admin`, { waitUntil: "networkidle" });
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      if (info.project.name === "mobile") {
        await page
          .getByRole("button", {
            name: locale === "ar" ? "فتح القائمة" : "Open menu",
          })
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
      }
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      await info.attach("admin-dashboard-axe", {
        body: JSON.stringify(axe.violations, null, 2),
        contentType: "application/json",
      });
      expect(
        axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      ).toEqual([]);
      await info.attach("admin-dashboard", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      expect(errors).toEqual([]);
      expect(failed).toEqual([]);
    } finally {
      if (pageId) {
        await db.query("DELETE FROM PageVersion WHERE pageId=?", [pageId]);
        await db.query("DELETE FROM Page WHERE id=?", [pageId]);
        await db.query("DELETE FROM AuditLog WHERE entityId=?", [pageId]);
        await db.query(
          "DELETE FROM Notification WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.slug'))=?",
          [slug],
        );
      }
      await db.destroy();
    }
  });
}
test("administrative screens and APIs preserve server authorization and reject unsafe mutations", async ({
  playwright,
  baseURL,
}) => {
  const { prefix, password } = fixture();
  const anonymous = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    }),
    client = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    }),
    editor = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    }),
    admin = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });
  let id = "";
  const db = await createDataSource().initialize();
  try {
    const redirect = await anonymous.get("/ar/admin", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers().location).toContain("/ar/auth/login");
    await login(client, prefix + "owner@example.invalid", password);
    const editorHeaders = await login(
        editor,
        prefix + "editor@example.invalid",
        password,
      ),
      adminHeaders = await login(
        admin,
        prefix + "admin@example.invalid",
        password,
      );
    expect(
      (await client.get("/ar/admin", { maxRedirects: 0 })).headers().location,
    ).toBe("/ar/account");
    expect(
      (await editor.get("/ar/admin/users", { maxRedirects: 0 })).headers()
        .location,
    ).toBe("/ar/admin");
    for (const route of [
      "pages",
      "settings",
      "menus",
      "dashboard",
      "search",
      "requests",
      "inquiries",
      "audit",
      "outbox",
    ])
      for (const version of ["/api/admin/", "/api/v1/admin/"]) {
        expect((await anonymous.get(version + route)).status()).toBe(401);
        expect((await client.get(version + route)).status()).toBe(403);
      }
    const made = await editor.post("/api/v1/admin/pages", {
      headers: editorHeaders,
      data: {
        slug: prefix + "-http-large",
        titleAr: "اختبار",
        titleEn: "Synthetic HTTP test",
      },
    });
    expect(made.status()).toBe(201);
    id = (await made.json()).page.id;
    for (const prefix of ["/api/admin", "/api/v1/admin"]) {
      for (const type of ["constructor", "__proto__", "hasOwnProperty"]) {
        const rejected = await editor.patch(prefix + "/pages/" + id, {
          headers: editorHeaders,
          data: { draftBlocksAr: JSON.stringify([{ id: "invalid", type, props: {} }]) },
        });
        expect(rejected.status()).toBe(400);
        expect((await rejected.json()).code).toBe("invalid_blocks");
      }
    }
    const large = JSON.stringify(
      Array.from({ length: 3 }, (_, i) => ({
        id: "large" + i,
        type: "text",
        props: {
          paragraphs: Array.from({ length: 20 }, () => "ع".repeat(4000)),
          align: "start",
          size: "base",
        },
      })),
    );
    expect(
      (
        await editor.patch("/api/v1/admin/pages/" + id, {
          headers: editorHeaders,
          data: { draftBlocksAr: large },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await editor.post("/api/admin/pages/" + id + "/publish", {
          headers: editorHeaders,
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.patch("/api/admin/pages/" + id, {
          data: { titleAr: "no CSRF" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.patch("/api/admin/pages/" + id, {
          headers: {
            ...adminHeaders,
            origin: "https://untrusted.example.invalid",
          },
          data: { titleAr: "bad origin" },
        })
      ).status(),
    ).toBe(403);
    const stamped = (await (await editor.get("/api/admin/pages/" + id)).json())
      .page.draftUpdatedAt;
    const concurrent = await Promise.all(
      ["One", "Two"].map((text) =>
        editor.patch("/api/admin/pages/" + id, {
          headers: editorHeaders,
          data: {
            draftUpdatedAt: stamped,
            draftBlocksAr: JSON.stringify([
              {
                id: "h",
                type: "heading",
                props: { text, level: 2, align: "start", injected: "not-public" },
                unknownTop: "not-public",
              },
            ]),
          },
        }),
      ),
    );
    expect(concurrent.map((r) => r.status()).sort()).toEqual([200, 409]);
    const normalized = (await (await editor.get("/api/admin/pages/" + id)).json()).page;
    expect(normalized.draftBlocksAr).not.toContain("not-public");
    expect(
      (
        await admin.post("/api/v1/admin/pages/" + id + "/publish", {
          headers: adminHeaders,
          data: {},
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await (
          await admin.get("/api/v1/admin/pages/" + id + "/versions")
        ).json()
      ).versions,
    ).toHaveLength(2);
  } finally {
    if (id) {
      const [row] = await db.query("SELECT slug FROM Page WHERE id=?", [id]);
      await db.query("DELETE FROM PageVersion WHERE pageId=?", [id]);
      await db.query("DELETE FROM Page WHERE id=?", [id]);
      await db.query("DELETE FROM AuditLog WHERE entityId=?", [id]);
      if (row)
        await db.query(
          "DELETE FROM Notification WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.slug'))=?",
          [row.slug],
        );
    }
    await db.destroy();
    for (const context of [anonymous, client, editor, admin])
      await context.dispose();
  }
});
