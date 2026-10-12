import { expect, type APIRequestContext } from "@playwright/test";
import { test } from "./quota-fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { createDataSource } from "@so7ob/server";
import { identityCopy } from "../../apps/web/src/content/identity";
async function login(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
  const result = await request.post("/api/auth/callback/credentials", {
    form: { email, password, csrfToken, json: "true" },
  });
  expect(result.status()).toBe(200);
  return { "x-csrf-token": csrfToken };
}
for (const locale of ["ar", "en"] as const)
  test(`${locale}: create role and direct account, force change and revoke live access`, async ({
    page,
    browser,
    baseURL,
  }, info) => {
    test.setTimeout(90000);
    const { prefix, password } = JSON.parse(
        readFileSync(".migration/e2e/run.json", "utf8"),
      ),
      t = identityCopy[locale],
      suffix = locale + info.project.name,
      key = "iam_" + suffix + "_" + prefix.slice(-10),
      email = prefix + suffix + "direct@example.invalid";
    const db = await createDataSource().initialize();
    const adminId = prefix + "iam" + suffix;
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt) SELECT ?,?,'Synthetic identity admin',passwordHash,'super_admin','active',UTC_TIMESTAMP(3) FROM User WHERE id=?",
      [adminId, adminId + "@example.invalid", prefix + "admin"],
    );
    const headers = await login(
      page.request,
      adminId + "@example.invalid",
      password,
    );
    try {
      // A real delayed route chunk must not expose an inert SSR action.
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let intercepted = 0;
      await page.route('**/assets/identity-*.js', async route => {
        intercepted++;
        await gate;
        await route.continue();
      });
      const createRole = page.getByRole("button", { name: t.createRole, exact: true });
      try {
        await page.goto(`/${locale}/admin/roles`, { waitUntil: 'commit' });
        await expect(createRole).toBeDisabled();
        await expect.poll(() => intercepted).toBeGreaterThan(0);
        release();
        await expect(createRole).toBeEnabled();
        await createRole.click();
      } finally {
        release();
        await page.unroute('**/assets/identity-*.js');
      }
      let dialog = page.getByRole("dialog");
      await dialog.getByLabel(t.key, { exact: true }).fill(key);
      await dialog
        .getByLabel(t.nameAr, { exact: true })
        .fill("دور قبول اصطناعي");
      await dialog
        .getByLabel(t.nameEn, { exact: true })
        .fill("Synthetic acceptance role");
      await dialog
        .getByRole("checkbox", {
          name:
            locale === "ar"
              ? "عرض لوحة الإدارة ومؤشراتها"
              : "View administration dashboard",
          exact: true,
        })
        .check();
      await dialog
        .getByRole("checkbox", {
          name: locale === "ar" ? "عرض قائمة المستخدمين" : "View users",
          exact: true,
        })
        .check();
      await dialog
        .getByRole("button", { name: t.preview, exact: true })
        .click();
      await expect(
        dialog.getByText(t.affected + ": 0", { exact: true }),
      ).toBeVisible();
      await page.screenshot({path:`.migration/iam/roles-${locale}-${info.project.name}.png`,fullPage:true});
      await dialog
        .getByRole("button", { name: t.confirm, exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await page.goto(`/${locale}/admin/users`);
      await page.getByRole("button", { name: t.add, exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog
        .getByLabel(t.name, { exact: true })
        .fill("Synthetic direct " + suffix);
      await dialog.getByLabel(t.email, { exact: true }).fill(email);
      await dialog.getByLabel(t.locale, { exact: true }).selectOption(locale);
      await dialog.getByLabel(t.role, { exact: true }).selectOption(key);
      const creation = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/admin/users/direct") &&
          r.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: t.save, exact: true }).click();
      const response = await creation;
      expect(response.status()).toBe(201);
      expect(response.headers()["cache-control"]).toBe("no-store");
      const created = await response.json();
      expect(created.temporaryPassword).toBeTruthy();
      await expect(
        dialog.getByRole("heading", { name: t.created }),
      ).toBeVisible();
      // Do not capture the one-time credential in screenshots or exported evidence.
      await dialog.getByRole("button", { name: t.cancel, exact: true }).click();
      await page.reload();
      await page
        .getByPlaceholder(
          locale === "ar"
            ? "ابحث بالاسم أو البريد…"
            : "Search by name or email…",
        )
        .count()
        .then(async (count) => {
          if (count)
            await page
              .getByPlaceholder(
                locale === "ar"
                  ? "ابحث بالاسم أو البريد…"
                  : "Search by name or email…",
              )
              .fill(email);
        });
      const listed = await (
        await page.request.get("/api/admin/users?role=" + key)
      ).json();
      expect(
        listed.users.some((u: { id: string }) => u.id === created.user.id),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `.migration/iam/users-${locale}-${info.project.name}.png`,
        fullPage: true,
      });
      const clientContext = await browser.newContext({
        baseURL,
        ignoreHTTPSErrors: true,
      });
      const client = clientContext.request;
      try {
        await login(client, email, created.temporaryPassword);
        for (const api of ["/api/", "/api/v1/"]) {
          const denied = await client.get(api + "admin/users");
          expect(denied.status()).toBe(403);
          expect((await denied.json()).code).toBe("password_change_required");
          expect((await client.get(api + "account/profile")).status()).toBe(
            403,
          );
        }
        const firstLogin = await clientContext.newPage();
        await firstLogin.goto(`/${locale}/admin/users`);
        await expect(firstLogin).toHaveURL(
          new RegExp(`/${locale}/auth/change-password`),
        );
        await firstLogin
          .getByLabel(t.currentPassword, { exact: true })
          .fill(created.temporaryPassword);
        await firstLogin
          .getByLabel(t.newPassword, { exact: true })
          .fill(password);
        expect(
          (await new AxeBuilder({ page: firstLogin }).analyze()).violations,
        ).toEqual([]);
        await firstLogin
          .getByRole("button", { name: t.change, exact: true })
          .click();
        await expect(firstLogin).toHaveURL(new RegExp(`/${locale}/auth/login`));
        await login(client, email, password);
        expect((await client.get("/api/admin/users")).status()).toBe(200);
        expect((await client.get("/api/admin/settings")).status()).toBe(403);
        expect(
          (
            await client.get("/api/account/requests/" + prefix + "owned")
          ).status(),
        ).toBe(404);
        const role = (
          await (
            await page.request.get("/api/admin/identity/roles/" + key)
          ).json()
        ).role;
        const changed = await page.request.patch(
          "/api/admin/identity/roles/" + key,
          { headers, data: { ...role, permissions: ["admin.dashboard"] } },
        );
        expect(changed.status()).toBe(200);
        expect((await client.get("/api/admin/users")).status()).toBe(403);
        const detail = await (
          await page.request.get("/api/admin/users/" + created.user.id)
        ).json();
        expect(
          detail.auditLog.some(
            (e: { action: string }) => e.action === "user.created",
          ),
        ).toBe(true);
      } finally {
        await clientContext.close();
      }
      await page.goto(`/${locale}/admin/permissions`);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toBeVisible();
      await page.screenshot({
        path: `.migration/iam/permissions-${locale}-${info.project.name}.png`,
        fullPage: true,
      });
      // Duplicate failure keeps the actual form and its values.
      await page.goto(`/${locale}/admin/users`);
      await page.getByRole("button", { name: t.add, exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog
        .getByLabel(t.name, { exact: true })
        .fill("Retained synthetic name");
      await dialog.getByLabel(t.email, { exact: true }).fill(email);
      await dialog.getByRole("button", { name: t.save, exact: true }).click();
      await expect(dialog.getByRole("alert")).toBeVisible();
      await expect(dialog.getByLabel(t.name, { exact: true })).toHaveValue(
        "Retained synthetic name",
      );
      await expect(dialog).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    } finally {
      await db.destroy();
    }
  });
