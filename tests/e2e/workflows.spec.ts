import { expect } from "@playwright/test";
import { test } from "./quota-fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createDataSource, WorkflowEngine, transaction } from "@so7ob/server";
import type { WorkflowDefinition } from "@so7ob/contracts";
import { getPortalContent } from "../../apps/web/src/content/portal";
test.use({ contextOptions: { reducedMotion: "reduce" } });
for (const locale of ["ar", "en"] as const)
  test(`${locale}: workflow editor, queues, immediate transitions and shared conversation screens`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);
    const { prefix, password } = JSON.parse(
        readFileSync(".migration/e2e/run.json", "utf8"),
      ),
      suffix = randomBytes(4).toString("hex"),
      id = prefix + "workflow" + suffix;
    const t = (ar: string, en: string) => (locale === "ar" ? ar : en),
      portal = getPortalContent(locale),
      db = await createDataSource().initialize();
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
    const headers = { "x-csrf-token": csrfToken };
    let teamId = "",
      calendarId = "",
      flowId = "";
    const post = async (path: string, payload: unknown) => {
      const r = await page.request.post("/api/admin/workflows/" + path, {
        headers,
        data: { payload },
      });
      expect(r.status(), await r.text()).toBe(201);
      return r.json();
    };
    try {
      await page.goto(`/${locale}/admin/workflows`);
      await page
        .getByRole("button", { name: t("فرق العمل", "Teams"), exact: true })
        .click();
      await page
        .getByLabel(t("اسم الفريق بالعربية", "Team Arabic name"), {
          exact: true,
        })
        .fill("فريق قبول اصطناعي " + suffix);
      await page
        .getByLabel(t("اسم الفريق بالإنجليزية", "Team English name"), {
          exact: true,
        })
        .fill("Synthetic acceptance team " + suffix);
      await page
        .getByRole("checkbox", { name: "Synthetic admin", exact: true })
        .check();
      const teamResponse = page.waitForResponse(
        (r) =>
          r.url().endsWith("/workflows/teams") &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", {
          name: t("حفظ الفريق", "Save team"),
          exact: true,
        })
        .click();
      teamId = (await (await teamResponse).json()).id;
      expect(teamId).toBeTruthy();
      await page
        .getByRole("button", {
          name: t("ساعات العمل", "Business hours"),
          exact: true,
        })
        .click();
      const sunday = page.getByRole("group", {
        name: t("الأحد", "Sunday"),
        exact: true,
      });
      await sunday
        .getByRole("button", {
          name: t("إضافة فترة دوام", "Add working interval"),
          exact: true,
        })
        .click();
      await sunday.getByLabel(t("من", "From"), { exact: true }).fill("08:00");
      await sunday.getByLabel(t("إلى", "To"), { exact: true }).fill("16:00");
      const calendarResponse = page.waitForResponse(
        (r) =>
          r.url().endsWith("/workflows/calendars") &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", {
          name: t("حفظ إصدار التقويم", "Save calendar version"),
          exact: true,
        })
        .click();
      calendarId = (await (await calendarResponse).json()).id;
      expect(calendarId).toBeTruthy();
      const definition: WorkflowDefinition = {
        scope: "inquiries",
        nameAr: "مسار قبول " + suffix,
        nameEn: "Acceptance workflow " + suffix,
        initialStage: "intake",
        calendarVersionId: calendarId,
        stages: [
          {
            id: "intake",
            nameAr: "وارد",
            nameEn: "Intake",
            status: "new",
            visibility: "assigned",
            routing: { mode: "team_queue", teamId, userId: null },
            responseHours: 2,
            stageHours: 4,
            x: 30,
            y: 40,
          },
          {
            id: "review",
            nameAr: "معالجة",
            nameEn: "Review",
            status: "in_review",
            visibility: "assigned",
            routing: { mode: "round_robin", teamId, userId: null },
            responseHours: 2,
            stageHours: 4,
            x: 310,
            y: 40,
          },
          {
            id: "done",
            nameAr: "منجز",
            nameEn: "Complete",
            status: "closed",
            visibility: "assigned",
            routing: { mode: "person", teamId, userId: prefix + "admin" },
            responseHours: null,
            stageHours: null,
            x: 590,
            y: 40,
          },
        ],
        transitions: [
          {
            id: "take",
            from: "intake",
            to: "review",
            nameAr: "بدء المعالجة",
            nameEn: "Start review",
            trigger: "manual",
            action: "transition",
            actors: ["staff"],
            reasonRequired: true,
            match: "all",
            conditions: [],
          },
          {
            id: "finish",
            from: "review",
            to: "done",
            nameAr: "إنجاز",
            nameEn: "Finish",
            trigger: "staff_reply",
            action: "transition",
            actors: ["staff"],
            reasonRequired: false,
            match: "all",
            conditions: [],
          },
          {
            id: "reopen",
            from: "done",
            to: "review",
            nameAr: "إعادة فتح",
            nameEn: "Reopen",
            trigger: "manual",
            action: "transition",
            actors: ["staff"],
            reasonRequired: false,
            match: "all",
            conditions: [],
          },
        ],
      };
      flowId = (await post("drafts", { definition })).id;
      await page.reload();
      await page
        .getByLabel(t("المسار", "Workflow"), { exact: true })
        .selectOption(flowId);
      const graph = page.getByRole("region", {
        name: t("مخطط المسار", "Workflow diagram"),
      });
      const node = graph.getByRole("button", {
        name: new RegExp(t("وارد", "Intake")),
      });
      await node.focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Space");
      await page
        .getByLabel(t("اسم المسار بالإنجليزية", "Workflow English name"), {
          exact: true,
        })
        .fill("Acceptance workflow edited " + suffix);
      await page
        .getByLabel(
          t(
            "تطبيق المسار على المعاملات الجديدة",
            "Apply workflow to new conversations",
          ),
          { exact: true },
        )
        .selectOption("support");
      const published = page.waitForResponse(
        (r) =>
          r.url().endsWith("/workflows/publish") &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", {
          name: t(
            "نشر إصدار للمعاملات الجديدة",
            "Publish version for new conversations",
          ),
          exact: true,
        })
        .click();
      const publication = await published;
      expect(publication.status(), await publication.text()).toBe(201);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.migration/workflows/editor-${locale}-${info.project.name}.png`,
        fullPage: true,
      });
      await db.query(
        "INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale,clientId) VALUES(?,?,'Synthetic long conversation subject for responsive acceptance اختبار النصوص الطويلة','Synthetic',?,'support',?,?)",
        [
          id,
          "WF-" + suffix,
          prefix + "owner@example.invalid",
          locale,
          prefix + "owner",
        ],
      );
      await transaction(db, (r) =>
        new WorkflowEngine(db).initialize(r, "inquiries", id),
      );
      await db.query(
        "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote','systems','Synthetic long request content','synthetic','unspecified','flexible',?,?,'email',?)",
        [
          id + "request",
          "WR-" + suffix,
          "Synthetic long client name اختبار النصوص الطويلة",
          "synthetic-long-address@example.invalid",
          locale,
        ],
      );
      await transaction(db, (r) =>
        new WorkflowEngine(db).initialize(r, "requests", id + "request"),
      );
      for (const scope of ["requests", "inquiries"]) {
        await page.goto(`/${locale}/admin/${scope}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: portal.admin[scope as "requests" | "inquiries"].title,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("combobox", {
            name: t("الفريق", "Team"),
            exact: true,
          }),
        ).toBeVisible();
        {
          const ref = (scope === "inquiries" ? "WF-" : "WR-") + suffix;
          await page
            .getByLabel(t("البحث", "Search"), { exact: true })
            .fill(ref);
          await expect(
            page.locator("main").getByRole("link", { name: ref, exact: true }),
          ).toBeVisible();
        }
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
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `.migration/workflows/${scope}-${locale}-${info.project.name}.png`,
          fullPage: true,
        });
      }
      await page.goto(`/${locale}/admin/inquiries/${id}`);
      const stage = page.getByRole("combobox", {
        name: portal.admin.requests.changeStatus,
        exact: true,
      });
      await stage.click();
      await page
        .getByRole("option", {
          name: t("بدء المعالجة", "Start review"),
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel(t("سبب الانتقال", "Transition reason"), { exact: true })
        .fill("Synthetic transition reason");
      await dialog
        .getByRole("button", {
          name: portal.admin.requests.applyStatus,
          exact: true,
        })
        .click();
      await expect(dialog).toBeHidden();
      await expect(stage).toContainText(t("معالجة", "Review"));
      const reply = page.getByRole("tabpanel").getByRole("textbox");
      await reply.fill("Synthetic public reply draft");
      await page
        .getByRole("tab", {
          name: portal.admin.requests.internalNote,
          exact: true,
        })
        .click();
      await expect(reply).toHaveValue("");
      await reply.fill("Synthetic private draft");
      await page
        .getByRole("tab", { name: portal.admin.requests.reply, exact: true })
        .click();
      await expect(reply).toHaveValue("Synthetic public reply draft");
      const fileInput = page.locator("input[type=file]");
      await page.route("**/api/attachments", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"ok":false,"code":"internal_error"}',
        }),
      );
      await fileInput.setInputFiles({
        name: "synthetic-note.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Synthetic attachment"),
      });
      await expect(
        page.getByRole("status").filter({ hasText: "synthetic-note.txt" }),
      ).toBeVisible();
      await expect(reply).toHaveValue("Synthetic public reply draft");
      await page.unroute("**/api/attachments");
      await page
        .getByRole("status")
        .filter({ hasText: "synthetic-note.txt" })
        .getByRole("button")
        .click();
      await expect(
        page.getByRole("link", { name: /synthetic-note.txt/ }),
      ).toBeVisible();
      const sent = page.waitForResponse(
        (r) => r.url().endsWith("/messages") && r.request().method() === "POST",
      );
      await page
        .getByRole("tabpanel")
        .getByRole("button", { name: portal.account.detail.send, exact: true })
        .click();
      expect((await sent).status()).toBe(201);
      for (let n = 0; n < 10; n++) {
        if (!(await new WorkflowEngine(db).processOne())) break;
      }
      await page.reload();
      await expect(stage).toContainText(t("منجز", "Complete"));
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
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.migration/workflows/details-${locale}-${info.project.name}.png`,
        fullPage: true,
      });
    } finally {
      for (const table of [
        "WorkflowJob",
        "WorkflowEvent",
        "ConversationWorkflow",
      ])
        await db.query(`DELETE FROM ${table} WHERE recordId IN (?,?)`, [
          id,
          id + "request",
        ]);
      await db.query("DELETE FROM ProjectRequest WHERE id=?", [id + "request"]);
      await db.query("DELETE FROM Notification WHERE link LIKE ?", ["%/" + id]);
      await db.query("DELETE FROM AuditLog WHERE entityId=?", [id]);
      await db.query("DELETE FROM Attachment WHERE inquiryId=?", [id]);
      await db.query("DELETE FROM Inquiry WHERE id=?", [id]);
      if (flowId) {
        await db.query(
          "DELETE b FROM WorkflowBinding b JOIN WorkflowVersion v ON v.id=b.versionId WHERE v.workflowId=?",
          [flowId],
        );
        await db.query("DELETE FROM WorkflowVersion WHERE workflowId=?", [
          flowId,
        ]);
        await db.query("DELETE FROM Workflow WHERE id=?", [flowId]);
      }
      if (teamId) {
        await db.query("DELETE FROM WorkTeamMember WHERE teamId=?", [teamId]);
        await db.query("DELETE FROM WorkTeam WHERE id=?", [teamId]);
      }
      if (calendarId)
        await db.query("DELETE FROM WorkCalendar WHERE id=?", [calendarId]);
      await db.destroy();
    }
  });
