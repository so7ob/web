import { expect } from "@playwright/test";
import { test } from "./quota-fixture";
import { readFileSync, mkdirSync } from "node:fs";
import { createDataSource, AuditOperations } from "@so7ob/server";
import { auditCopy } from "../../apps/web/src/components/admin/audit/copy";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["ar", "en"] as const)
  test(`${locale}: health and retention remain usable with mixed evidence collations`, async ({ page }, info) => {
    const t = auditCopy[locale],
      { prefix, password } = JSON.parse(readFileSync(".migration/e2e/run.json", "utf8")),
      db = await createDataSource().initialize();
    const [column] = await db.query("SELECT COLLATION_NAME name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AuditWork' AND COLUMN_NAME='eventId'");
    if (!/^utf8mb4_[a-z0-9_]+$/.test(column.name)) throw new Error("Unexpected fixture collation");
    try {
      await db.query("ALTER TABLE AuditWork MODIFY eventId VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL");
      await new AuditOperations(db).probe("worker");
      const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
      await page.request.post("/api/auth/callback/credentials", {
        form: { email: prefix + "admin@example.invalid", password, csrfToken, json: "true" },
      });
      await page.goto(`/${locale}/admin/audit`, { waitUntil: "networkidle" });
      const response = page.waitForResponse(r => r.url().endsWith("/api/v1/admin/audit/health"));
      await page.getByRole("navigation", { name: t.title, exact: true }).getByRole("button", { name: t.health, exact: true }).click();
      expect((await response).status()).toBe(200);
      const body = await (await response).json();
      expect(body.ok).toBe(true);
      expect(body.probes).toEqual(expect.arrayContaining([expect.objectContaining({ component: "worker", status: "healthy" })]));
      await expect(page.getByRole("heading", { name: t.writerHealth, exact: true })).toBeVisible();
      await expect(page.getByText(t.unconfigured, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: t.dryRun, exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status").filter({ hasText: t.unconfigured })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
      if (process.env.AUDIT_HEALTH_EVIDENCE_DIR) {
        mkdirSync(process.env.AUDIT_HEALTH_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: `${process.env.AUDIT_HEALTH_EVIDENCE_DIR}/health-${locale}-${info.project.name}.png`, fullPage: true });
      }
    } finally {
      await db.query(`ALTER TABLE AuditWork MODIFY eventId VARCHAR(255) CHARACTER SET utf8mb4 COLLATE ${column.name} NOT NULL`);
      await db.destroy();
    }
  });
