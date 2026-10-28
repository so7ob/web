import { expect } from "@playwright/test";
import { test } from "./quota-fixture";
import { readFileSync, mkdirSync } from "node:fs";
import { createDataSource, AuditOperations, AuditReports } from "@so7ob/server";
import { auditCopy } from "../../apps/web/src/components/admin/audit/copy";
import AxeBuilder from "@axe-core/playwright";
for (const locale of ["ar", "en"] as const)
  test(`${locale}: audit rule management, explainable alert and printable report`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(90000);
    const t = auditCopy[locale],
      { prefix, password } = JSON.parse(
        readFileSync(".migration/e2e/run.json", "utf8"),
      ),
      db = await createDataSource().initialize(),
      ops = new AuditOperations(db);
    const [original] = await db.query(
      "SELECT * FROM AuditRule WHERE id='privilege'",
    );
    const { csrfToken } = await (
        await page.request.get("/api/auth/csrf")
      ).json(),
      headers = { "x-csrf-token": csrfToken };
    await page.request.post("/api/auth/callback/credentials", {
      form: {
        email: prefix + "admin@example.invalid",
        password,
        csrfToken,
        json: "true",
      },
    });
    try {
      await page.goto("/" + locale + "/admin/audit", {
        waitUntil: "networkidle",
      });
      await page
        .getByRole("tablist", { name: t.title, exact: true })
        .getByRole("tab", { name: t.rules, exact: true })
        .click();
      const form = page.locator("form").filter({
        has: page.getByRole("heading", { name: t.privilege, exact: true }),
      });
      await form.getByRole("checkbox", { name: t.enabled }).check();
      await form
        .getByRole("textbox", { name: t.rationale })
        .fill(
          locale === "ar"
            ? "تنبيه اصطناعي: منح دور إداري"
            : "Synthetic alert: administrative role granted",
        );
      await form.getByRole("button", { name: t.save, exact: true }).click();
      await expect
        .poll(async () =>
          Number(
            (
              await db.query(
                "SELECT enabled FROM AuditRule WHERE id='privilege'",
              )
            )[0].enabled,
          ),
        )
        .toBe(1);
      expect(
        (
          await page.request.patch("/api/admin/users/" + prefix + "support", {
            headers,
            data: { roleKey: "ops_manager" },
          })
        ).status(),
      ).toBe(200);
      const [backlog] = await db.query(
        "SELECT COUNT(*) count FROM AuditWork w JOIN AuditLog a ON a.id=w.eventId COLLATE utf8mb4_nopad_bin WHERE w.status='queued' AND w.availableAt<=UTC_TIMESTAMP(3)",
      );
      for (let n = 0; n < Number(backlog.count) && (await ops.processOne()); n++) {
        /* Bound real processing by this isolated database's ready work. */
      }
      const [alert] = await db.query(
        "SELECT * FROM AuditAlert WHERE ruleId='privilege' AND ruleRevision=? ORDER BY createdAt DESC LIMIT 1",
        [original.revision + 1],
      );
      expect(alert).toBeTruthy();
      await page
        .getByRole("tablist", { name: t.title, exact: true })
        .getByRole("tab", { name: t.alerts, exact: true })
        .click();
      await expect(page.getByText(alert.reason, { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: t.details, exact: true })
        .first()
        .click();
      const eventId = (
        await db.query("SELECT eventId FROM AuditAlertEvent WHERE alertId=?", [
          alert.id,
        ])
      )[0].eventId;
      await page.getByRole("button", { name: eventId, exact: true }).click();
      await expect(page.getByRole("dialog")).toContainText(t.roleKey);
      await page.keyboard.press("Escape");
      const response = await page.request.post("/api/v1/admin/audit/reports", {
        headers,
        data: {
          payload: {
            format: "html",
            scope: "selected",
            locale,
            timezone: "Asia/Aden",
            filters: { ids: [eventId], includeAccess: true },
          },
        },
      });
      expect(response.status()).toBe(201);
      const { id } = await response.json(),
        { dataDir } = JSON.parse(
          readFileSync(".migration/e2e/storage.json", "utf8"),
        );
      await new AuditReports(db, {
        ...process.env,
        DATA_DIR: dataDir,
      }).processOne();
      const html = await (
        await page.request.get(
          "/api/v1/admin/audit/reports/" + id + "/download",
        )
      ).text();
      expect(html).toContain(
        locale === "ar" ? "تقرير سجل التدقيق" : "Audit report",
      );
      expect(html).toContain(locale === "ar" ? "قبل" : "Before");
      const printContext = await browser.newContext();
      const printing = await printContext.newPage();
      try {
        await printing.setContent(html);
        await printing.emulateMedia({ media: "print" });
        expect(
          (
            await new AxeBuilder({ page: printing })
              .withTags(["wcag2a", "wcag2aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        const evidence = process.env.AUDIT_EVIDENCE_DIR;
        if (evidence && info.project.name === "desktop") {
          mkdirSync(evidence, { recursive: true });
          await printing.pdf({
            path: `${evidence}/print-${locale}.pdf`,
            format: "A4",
            printBackground: true,
          });
          await printing.screenshot({
            path: `${evidence}/print-${locale}.png`,
            fullPage: true,
          });
        }
      } finally {
        await printContext.close();
      }
    } finally {
      await db.query("UPDATE User SET roleKey=? WHERE id=?", [
        "support",
        prefix + "support",
      ]);
      await db.query(
        "DELETE ae FROM AuditAlertEvent ae JOIN AuditAlert a ON a.id=ae.alertId WHERE a.ruleId=? AND a.ruleRevision=?",
        [original.id, original.revision + 1],
      );
      await db.query(
        "DELETE FROM AuditAlert WHERE ruleId=? AND ruleRevision=?",
        [original.id, original.revision + 1],
      );
      await db.query(
        "UPDATE AuditRule SET enabled=?,revision=?,activatedAt=?,rationale=? WHERE id=?",
        [
          original.enabled,
          original.revision,
          original.activatedAt,
          original.rationale,
          original.id,
        ],
      );
      await db.query("DELETE FROM AuditReport WHERE userId=?", [
        prefix + "admin",
      ]);
      await db.destroy();
    }
  });
