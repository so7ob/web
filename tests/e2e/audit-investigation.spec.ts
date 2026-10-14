import { expect } from "@playwright/test";
import { test } from "./quota-fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { createDataSource, AuditReports, AuditOperations } from "@so7ob/server";
import { auditCopy } from "../../apps/web/src/components/admin/audit/copy";
test.use({ contextOptions: { reducedMotion: "reduce" } });
for (const locale of ["ar", "en"] as const)
  test(`${locale}: real audit investigation, independent review, report, denial and accessibility`, async ({
    page,
    browser,
    baseURL,
  }, info) => {
    test.setTimeout(90000);
    const t = auditCopy[locale],
      { prefix, password } = JSON.parse(
        readFileSync(".migration/e2e/run.json", "utf8"),
      ),
      id = prefix + "audit" + randomBytes(4).toString("hex"),
      ref = "REQ-DEMO-104-" + locale + "-" + info.project.name,
      db = await createDataSource().initialize();
    const { csrfToken } = await (
        await page.request.get("/api/auth/csrf")
      ).json(),
      headers = { "x-csrf-token": csrfToken };
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
    await db.query(
      "INSERT INTO ProjectRequest(id,refCode,clientId,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,?,'quote','web','synthetic','synthetic','unspecified','flexible','Synthetic',?,'email',?)",
      [id, ref, prefix + "owner", prefix + "owner@example.invalid", locale],
    );
    try {
      for (const change of [{ priority: "high" }, { status: "in_review" }])
        expect(
          (
            await page.request.patch("/api/admin/requests/" + id, {
              headers,
              data: change,
            })
          ).status(),
        ).toBe(200);
      // Direct API reads are audited server-side; polling cannot fetch event bodies.
      const direct = await page.request.post(
        "/api/v1/admin/audit/events/search",
        { headers, data: { payload: { q: ref } } },
      );
      expect(direct.status()).toBe(201);
      const directEvent = (await direct.json()).rows[0].id;
      await page.request.get("/api/v1/admin/audit/events/" + directEvent);
      const accessCount = async () =>
        Number(
          (
            await db.query(
              "SELECT COUNT(*) n FROM AuditLog WHERE actorId=? AND action IN ('audit.opened','audit.detail_viewed')",
              [prefix + "admin"],
            )
          )[0].n,
        );
      const accesses = await accessCount();
      expect(accesses).toBeGreaterThanOrEqual(2);
      await page.request.get("/api/v1/admin/audit/events/" + directEvent);
      const probe = await page.request.post(
        "/api/v1/admin/audit/events/check",
        { headers, data: { payload: { q: ref } } },
      );
      const hint = await probe.json();
      expect(hint).toEqual({ ok: true, latestId: directEvent, count: 2 });
      expect(await accessCount()).toBe(accesses);
      await page.goto("/" + locale + "/admin/audit", {
        waitUntil: "networkidle",
      });
      await page.getByRole("textbox", { name: t.search }).fill(ref);
      await expect(page.locator("main")).toContainText(ref);
      await expect(
        page.getByRole("status").filter({ hasText: t.loading }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      const evidence = process.env.AUDIT_EVIDENCE_DIR;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        await page.screenshot({
          path: `${evidence}/after-${locale}-${info.project.name}.png`,
          fullPage: true,
        });
      }
      const search = await page.request.post(
        "/api/v1/admin/audit/events/search",
        { headers, data: { payload: { q: ref } } },
      );
      expect(search.headers()["cache-control"]).toContain("no-store");
      const results = await search.json();
      expect(results.stats.events).toBe(2);
      expect(
        results.rows.every((e: { correlationId: string }) => !!e.correlationId),
      ).toBe(true);
      const priority = results.rows.find(
        (e: { action: string }) => e.action === "request.priority_changed",
      );
      await page.goto("/" + locale + "/admin/audit?event=" + priority.id, {
        waitUntil: "networkidle",
      });
      const drawer = page.getByRole("dialog");
      await expect(drawer).toContainText(t.before);
      await expect(drawer).toContainText(t.normal);
      await expect(drawer).toContainText(t.high);
      await expect(drawer).toContainText(t.resourceTimeline);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (evidence)
        await page.screenshot({
          path: `${evidence}/detail-${locale}-${info.project.name}.png`,
          fullPage: true,
        });
      await drawer.getByRole("button", { name: t.flag, exact: true }).click();
      await expect(
        drawer.getByRole("button", { name: t.unflag }),
      ).toBeVisible();
      await drawer
        .getByRole("button", { name: t.createCase, exact: true })
        .click();
      await page
        .getByRole("textbox", { name: t.caseTitle })
        .fill("Synthetic review " + ref);
      await page
        .getByRole("button", { name: t.createCase, exact: true })
        .click();
      await page
        .getByRole("textbox", { name: t.note })
        .fill("مراجعة اصطناعية مستقلة — Synthetic review");
      await page.getByRole("button", { name: t.addNote }).click();
      await expect(
        page.getByText("مراجعة اصطناعية مستقلة — Synthetic review", {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("tablist", { name: t.title, exact: true })
        .getByRole("tab", { name: t.events, exact: true })
        .click();
      await page.getByRole("textbox", { name: t.search }).fill(ref);
      await expect(page.locator("main")).toContainText(ref);
      // Current result selection and export stay authorized in the server.
      const jobResponse = await page.request.post(
        "/api/v1/admin/audit/reports",
        {
          headers,
          data: {
            payload: {
              format: "json",
              scope: "all",
              locale,
              timezone: "Asia/Aden",
              filters: { q: ref },
            },
          },
        },
      );
      expect(jobResponse.status()).toBe(201);
      const job = await jobResponse.json();
      const { dataDir } = JSON.parse(
        readFileSync(".migration/e2e/storage.json", "utf8"),
      );
      const reports = new AuditReports(db, {
        ...process.env,
        DATA_DIR: dataDir,
      });
      await reports.processOne();
      const download = await page.request.get(
          "/api/v1/admin/audit/reports/" + job.id + "/download",
        ),
        manifest = await (
          await page.request.get(
            "/api/v1/admin/audit/reports/" + job.id + "/download?manifest=1",
          )
        ).json();
      expect(download.status()).toBe(200);
      const body = await download.body();
      expect(createHash("sha256").update(body).digest("hex")).toBe(
        manifest.checksum,
      );
      expect(JSON.parse(body.toString()).events).toHaveLength(2);
      expect(manifest.eventCount).toBe(2);
      await page
        .getByRole("tablist", { name: t.title, exact: true })
        .getByRole("tab", { name: t.reports, exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: /JSON/ }).first(),
      ).toBeVisible();
      await new AuditOperations(db).probe("e2e");
      await page
        .getByRole("tablist", { name: t.title, exact: true })
        .getByRole("tab", { name: t.health, exact: true })
        .click();
      await expect(page.getByText(t.probeHelp)).toBeVisible();
      await expect(
        page.getByText(t.unconfigured, { exact: true }),
      ).toBeVisible();
      const denied = await browser.newContext({
        baseURL: baseURL,
        ignoreHTTPSErrors: true,
      });
      try {
        const token = await (await denied.request.get("/api/auth/csrf")).json();
        await denied.request.post("/api/auth/callback/credentials", {
          form: {
            email: prefix + "owner@example.invalid",
            password,
            csrfToken: token.csrfToken,
            json: "true",
          },
        });
        for (const url of [
          "/api/v1/admin/audit/events/" + priority.id,
          "/api/v1/admin/audit/reports/" + job.id + "/download",
          "/api/v1/admin/audit/cases",
          "/api/v1/admin/audit/health",
        ])
          expect((await denied.request.get(url)).status()).toBe(403);
      } finally {
        await denied.close();
      }
      await page
        .getByRole("tablist", { name: t.title, exact: true })
        .getByRole("tab", { name: t.events, exact: true })
        .click();
      await page.getByRole("textbox", { name: t.search }).fill(ref);
      await expect(page.locator("main")).toContainText(ref);
      await page.route("**/api/v1/admin/audit/events/search", (route) =>
        route.abort(),
      );
      await page.getByRole("button", { name: t.refresh, exact: true }).click();
      await expect(page.getByText(t.stale)).toBeVisible();
      await expect(page.getByText(t.noMatch)).toHaveCount(0);
      await page.unroute("**/api/v1/admin/audit/events/search");
      await page.getByRole("button", { name: t.retry, exact: true }).click();
      await expect(page.getByText(t.stale)).toHaveCount(0);
      const detailButton = page
        .getByRole("button", {
          name:
            info.project.name === "mobile" ? t.details : t.details + " " + ref,
          exact: true,
        })
        .first();
      await detailButton.focus();
      await page.keyboard.press("Enter");
      await expect(drawer).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(detailButton).toBeFocused();
    } finally {
      await db.query(
        "DELETE FROM AuditCaseHistory WHERE caseId IN (SELECT id FROM AuditCase WHERE title=?)",
        ["Synthetic review " + ref],
      );
      await db.query(
        "DELETE FROM AuditCaseEvent WHERE caseId IN (SELECT id FROM AuditCase WHERE title=?)",
        ["Synthetic review " + ref],
      );
      await db.query("DELETE FROM AuditCase WHERE title=?", [
        "Synthetic review " + ref,
      ]);
      await db.query("DELETE FROM AuditReport WHERE userId=?", [
        prefix + "admin",
      ]);
      await db.destroy();
    }
  });
