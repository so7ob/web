import { expect } from "@playwright/test";
import { test } from "./quota-fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { createDataSource, WorkflowAdministration, sha256 } from "@so7ob/server";
import { legacyWorkflow, type AuthUser } from "@so7ob/contracts";

test.use({ contextOptions: { reducedMotion: "reduce" } });
for (const locale of ["ar", "en"] as const)
  test(`${locale}: customer creates a workflow request, reads and refreshes the list, then opens details`, async ({ page }, info) => {
    const { prefix, password } = JSON.parse(readFileSync(".migration/e2e/run.json", "utf8"));
    const actorId = prefix + "list107" + info.project.name + locale;
    const email = actorId + "@example.invalid";
    const stage = { nameAr: "مرحلة اختبار القائمة", nameEn: "List acceptance stage" };
    const db = await createDataSource().initialize();
    const admin = new WorkflowAdministration(db);
    const root: AuthUser = { id: prefix + "admin", email: prefix + "admin@example.invalid", name: "Synthetic admin", roleKey: "super_admin", status: "active", locale, emailVerified: true, permissions: [] };
    const [binding] = await db.query("SELECT versionId FROM WorkflowBinding WHERE scope='requests' AND selector='web'");
    let flowId = "", calendarId = "", requestId = "";
    try {
      // This account belongs to this scenario; portal acceptance changes its own passwords.
      await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt,locale) VALUES(?,?,?,?,'client','active',UTC_TIMESTAMP(3),?)", [actorId, email, "Synthetic list client", await bcrypt.hash(password, 12), locale]);
      calendarId = (await admin.calendar(root, { timezone: "Asia/Aden", week: Array.from({ length: 7 }, () => [{ start: "00:00", end: "24:00" }]), exceptions: [] })).id;
      const definition = legacyWorkflow("requests");
      definition.nameEn = "Synthetic request list acceptance";
      definition.calendarVersionId = calendarId;
      Object.assign(definition.stages[0], stage);
      flowId = (await admin.save(root, { definition })).id;
      const version = await admin.publish(root, { id: flowId, revision: 0, selector: "web" });
      const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
      expect((await page.request.post("/api/auth/callback/credentials", { form: { email, password, csrfToken, json: "true" } })).status()).toBe(200);
      await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [sha256("request:" + sha256("ip:127.0.0.1"))]);
      await page.goto(`/${locale}/account/requests/new?service=web&type=quote`);
      // Type at human speed so the production minimum-fill protection remains active.
      await page.locator("#description").pressSequentially(`Synthetic workflow list regression ${info.project.name} ${locale}: preserve my request and public stage.`, { delay: 35 });
      await page.locator("#name").fill("Synthetic list client");
      await page.locator("#email").fill(email);
      // Check the unchanged request form with its normal protections enabled.
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      const submitted = page.waitForResponse(r => r.url().endsWith("/api/requests") && r.request().method() === "POST");
      await page.locator("form button[type=submit]").click();
      const response = await submitted;
      expect(response.status(), await response.text()).toBe(201);
      const { ref } = await response.json();
      await expect(page.getByRole("status").filter({ hasText: ref })).toBeVisible();
      const [stored] = await db.query("SELECT p.id,p.clientId,w.versionId FROM ProjectRequest p JOIN ConversationWorkflow w ON w.recordId=p.id AND w.scope='requests' WHERE p.refCode=?", [ref]);
      requestId = stored.id;
      expect(stored).toMatchObject({ clientId: actorId, versionId: version.id });
      for (const refresh of [false, true]) {
        const loaded = page.waitForResponse(r => new URL(r.url()).pathname === "/api/account/requests");
        if (refresh) await page.reload();
        else await page.goto(`/${locale}/account/requests`);
        const listResponse = await loaded;
        expect(listResponse.status()).toBe(200);
        const list = await listResponse.json();
        const row = list.requests.find((r: { id: string }) => r.id === requestId);
        expect(row.workflowStage).toEqual({ ...stage, status: "new" });
        expect(JSON.stringify(row)).not.toMatch(/versionId|teamId|visibility|routing/);
        await expect(page.getByRole("link", { name: ref, exact: true })).toBeVisible();
        await expect(page.getByText(stage[locale === "ar" ? "nameAr" : "nameEn"], { exact: true })).toBeVisible();
      }
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      const detailLink = page.getByRole("link", { name: ref, exact: true });
      await detailLink.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/account/requests/${requestId}$`));
      await expect(page.getByRole("heading", { name: ref, exact: true })).toBeVisible();
      await expect(page.locator("dl").getByText(stage[locale === "ar" ? "nameAr" : "nameEn"], { exact: true })).toBeVisible();
      await info.attach("synthetic-request-list-details", { body: await page.screenshot(), contentType: "image/png" });
      expect((await db.query("SELECT COUNT(*) n FROM ProjectRequest WHERE id=? AND clientId=?", [requestId, actorId]))[0].n).toBe("1");
    } finally {
      if (binding) await db.query("UPDATE WorkflowBinding SET versionId=? WHERE scope='requests' AND selector='web'", [binding.versionId]);
      else await db.query("DELETE FROM WorkflowBinding WHERE scope='requests' AND selector='web'");
      // Only this scenario's synthetic records are removed. Global teardown owns the request and outbox.
      if (flowId) {
        for (const table of ["WorkflowJob", "WorkflowEvent", "ConversationWorkflow"])
          await db.query(`DELETE FROM ${table} WHERE versionId IN (SELECT id FROM WorkflowVersion WHERE workflowId=?)`, [flowId]);
        await db.query("DELETE FROM WorkflowVersion WHERE workflowId=?", [flowId]);
        await db.query("DELETE FROM Workflow WHERE id=?", [flowId]);
      }
      if (calendarId) await db.query("DELETE FROM WorkCalendar WHERE id=?", [calendarId]);
      await db.destroy();
    }
  });
