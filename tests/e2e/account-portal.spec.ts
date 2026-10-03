import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createDataSource, PayloadCipher, sha256 } from "@so7ob/server";
import { getPortalContent } from "../../apps/web/src/content/portal";
const fixture = () =>
  JSON.parse(readFileSync(".migration/e2e/run.json", "utf8")) as {
    prefix: string;
    password: string;
  };
async function assertPortalAxe(page: Page, locale: string, name: string) {
  const baseline = JSON.parse(
    readFileSync("tests/e2e/fixtures/account-axe-baseline.json", "utf8"),
  ).cases[`${page.viewportSize()!.width}:${locale}:${name}`] as Record<
    string,
    string[]
  >;
  const toast = page.locator(
    '[data-sonner-toast][data-front="true"][data-removed="false"]',
  );
  if (await toast.count()) {
    // Sonner mounts at opacity zero before its entrance completes. Hover pauses dismissal
    // while axe measures the visible notification, without altering its colors or DOM.
    await expect(toast).toHaveCSS("opacity", "1");
    await toast.hover();
    await expect(toast).toHaveAttribute("data-expanded", "true");
    // Hover expands every queued toast; wait for background text transitions too.
    await page.locator("[data-sonner-toaster]").evaluate(async (root) => {
      await Promise.all(
        root
          .getAnimations({ subtree: true })
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
  }
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const signature = (target: unknown) =>
    JSON.stringify(target).replace(
      /#radix-[^\s]*?-trigger-/g,
      "#radix-trigger-",
    );
  if (result.violations.length)
    await test.info().attach(`axe-${locale}-${name}`, {
      body: JSON.stringify(result.violations, null, 2),
      contentType: "application/json",
    });
  expect(
    result.violations
      .filter(
        (v) =>
          !(v.id in baseline) ||
          v.nodes.length > baseline[v.id].length ||
          v.nodes.some((n) => !baseline[v.id].includes(signature(n.target))),
      )
      .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
}
async function isolateScenarioQuota() {
  const db = await createDataSource().initialize();
  try {
    for (const key of ["login:127.0.0.1", "request:" + sha256("ip:127.0.0.1")])
      await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [
        sha256(key),
      ]);
  } finally {
    await db.destroy();
  }
}
// Scenarios share one loopback proxy, but each uses its own account. Quota rejection has separate tests.
test.beforeEach(isolateScenarioQuota);
test.afterEach(isolateScenarioQuota);
for (const locale of ["ar", "en"] as const)
  test(`${locale}: client portal preserves drafts, conversations, files, claims, profile and session controls`, async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(90000);
    const { prefix, password } = fixture(),
      actor = prefix + "portal" + info.project.name + locale,
      email = actor + "@example.invalid",
      portal = getPortalContent(locale),
      t = portal.account;
    const db = await createDataSource().initialize(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      if (request.failure()?.errorText !== "net::ERR_ABORTED")
        errors.push(
          new URL(request.url()).pathname + ": " + request.failure()?.errorText,
        );
    });
    try {
      const denied = await page.request.get(
        "/" + locale + "/account/requests",
        { maxRedirects: 0 },
      );
      expect(denied.status()).toBe(307);
      expect(denied.headers().location).toBe(
        "/" + locale + "/auth/login?next=/" + locale + "/account",
      );
      await page.goto("/" + locale + "/auth/login");
      await page.locator("#login-email").fill(email);
      await page.locator("#login-password").fill(password);
      await page.locator("form button[type=submit]").click();
      await expect(page).toHaveURL(baseURL + "/" + locale + "/account");
      await expect(
        page.getByRole("heading", { name: t.dashboard.title, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => localStorage.getItem("so7ob-request-draft")),
      ).toBeNull();
      const html = await (
        await page.request.get("/" + locale + "/account")
      ).text();
      expect(html).toContain(t.dashboard.title);
      expect(html).not.toContain("passwordHash");
      await page.reload();
      await assertPortalAxe(page, locale, "dashboard");
      // Keyboard-operated mobile drawer keeps focus and closes on Escape.
      if (info.project.name === "mobile") {
        const trigger = page
          .locator('main button[aria-haspopup="dialog"]')
          .first();
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
      await page.goto(
        "/" + locale + "/account/requests/new?service=web&type=quote",
      );
      await page
        .locator("#description")
        .fill(
          "Synthetic portal project " +
            info.project.name +
            " " +
            locale +
            " with accessible bilingual account workflows and retained attachments.",
        );
      await assertPortalAxe(page, locale, "requests-new");
      await page.locator("#name").fill("Portal Contact");
      await page.locator("#email").fill(email);
      await expect
        .poll(
          async () =>
            (await (await page.request.get("/api/account/drafts")).json()).draft
              ?.name,
        )
        .toBe("Portal Contact");
      await page.reload();
      await expect(page.locator("#name")).toHaveValue("Portal Contact");
      await expect(page.locator("#email")).toHaveValue("");
      await page.locator("#email").pressSequentially(email, { delay: 60 });
      await expect(page.locator("#description")).toHaveValue(
        /Synthetic portal project/,
      );
      const submitted = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/requests") && r.request().method() === "POST",
      );
      await page.locator("form button[type=submit]").click();
      const response = await submitted;
      expect(response.status()).toBe(201);
      const ref = (await response.json()).ref;
      await expect(
        page.getByRole("status").filter({ hasText: ref }),
      ).toBeVisible();
      expect(
        (await (await page.request.get("/api/account/drafts")).json()).draft,
      ).toBeNull();
      await page
        .getByRole("link", { name: t.requests.viewDetails, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: ref, exact: true }),
      ).toBeVisible();
      await assertPortalAxe(page, locale, "requests-migrationrequest");
      const requestId = page.url().split("/").pop()!;
      const text = "Synthetic portal client reply " + locale;
      await page
        .getByRole("textbox", { name: t.detail.replyPlaceholder })
        .fill(text);
      await page
        .getByRole("button", { name: t.detail.send, exact: true })
        .click();
      await expect(page.getByText(text, { exact: true })).toBeVisible();
      const uploaded = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/attachments") &&
          r.request().method() === "POST",
      );
      await page.locator("input[type=file]").setInputFiles({
        name: "portal.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nSynthetic portal bytes\n%%EOF\n"),
      });
      expect((await uploaded).status()).toBe(201);
      const attachment = page
        .locator('a[href^="/api/attachments/"]')
        .filter({ hasText: "portal.pdf" });
      await expect(attachment).toBeVisible();
      expect(
        await (
          await page.request.get((await attachment.getAttribute("href"))!)
        ).body(),
      ).toEqual(Buffer.from("%PDF-1.4\nSynthetic portal bytes\n%%EOF\n"));
      await page.goto("/" + locale + "/account/requests?awaiting=you");
      await expect(
        page.getByRole("tab", { name: t.dashboard.awaitingReply, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await page.goto("/" + locale + "/account/requests");
      await expect(page.getByText(ref, { exact: true })).toBeVisible();
      await assertPortalAxe(page, locale, "requests");
      await page.goto("/" + locale + "/account/inquiries");
      await expect(
        page
          .getByRole("button", { name: t.inquiries.create, exact: true })
          .first(),
      ).toBeVisible();
      await assertPortalAxe(page, locale, "inquiries");
      await page
        .getByRole("button", { name: t.inquiries.create, exact: true })
        .first()
        .click();
      await page
        .locator("#inquiry-subject")
        .fill("Synthetic portal inquiry " + locale);
      await page
        .locator("#inquiry-message")
        .fill("Synthetic question from the real client portal workflow.");
      const inquiryCreated = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/account/inquiries") &&
          r.request().method() === "POST",
      );
      await page.getByRole("dialog").locator("button[type=submit]").click();
      expect((await inquiryCreated).status()).toBe(201);
      await page
        .getByRole("button", { name: t.inquiries.createdOkOpen, exact: true })
        .click();
      await expect(page).toHaveURL(/\/account\/inquiries\/c[a-z0-9]+$/);
      await page.getByRole("textbox").fill("A further synthetic inquiry reply");
      await page.locator("form button[type=submit]").click();
      await expect(
        page.getByText("A further synthetic inquiry reply", { exact: true }),
      ).toBeVisible();
      await assertPortalAxe(page, locale, "inquiries-migrationinquiry");
      const claimId = prefix + "claim" + info.project.name + locale,
        claimRef =
          "S7-PORTAL-" + info.project.name.toUpperCase() + locale.toUpperCase(),
        claimEmail =
          prefix + "prior" + info.project.name + locale + "@example.invalid";
      await db.query(
        "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote','web','Prior synthetic project','synthetic','unspecified','flexible','Prior contact',?,'email',?)",
        [claimId, claimRef, claimEmail, locale],
      );
      await page.goto("/" + locale + "/account/requests?claim=open");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.locator("#claim-ref").fill(claimRef);
      const claimed = page.waitForResponse((r) =>
        r.url().endsWith("/api/account/requests/claim"),
      );
      await page.getByRole("dialog").locator("button[type=submit]").click();
      expect((await claimed).status()).toBe(200);
      const [job] = await db.query(
        "SELECT j.id,j.payload FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?",
        [claimEmail],
      );
      const link = new PayloadCipher(process.env.OUTBOX_KEY!)
        .decrypt(job.payload, job.id)
        .text.match(/https:\/\/[^\s]+/)![0];
      await page.goto(link);
      await expect(page).toHaveURL(
        new RegExp(
          "/" + locale + "/account/requests\\?claim=ok&ref=" + claimRef,
        ),
      );
      await expect(
        page.getByText(claimRef, { exact: true }).last(),
      ).toBeVisible();
      await db.query(
        "INSERT INTO Notification(id,userId,type,payload,link) VALUES(?,?,'reply_received',?,?)",
        [
          actor + "notice",
          actor,
          JSON.stringify({ ref }),
          "/" + locale + "/account/requests/" + requestId,
        ],
      );
      await page.goto("/" + locale + "/account/notifications");
      await page
        .getByRole("button", { name: t.notifications.markAllRead, exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await db.query("SELECT readAt FROM Notification WHERE id=?", [
                actor + "notice",
              ])
            )[0].readAt !== null,
        )
        .toBe(true);
      await assertPortalAxe(page, locale, "notifications");
      await page.goto("/" + locale + "/account/profile");
      await page.locator("#profile-name").fill("Updated Portal " + locale);
      await page.locator("#profile-phone").fill("+967 123456789");
      const saved = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/account/profile") &&
          r.request().method() === "PATCH",
      );
      await page.locator("form button[type=submit]").click();
      expect((await saved).status()).toBe(200);
      await page.reload();
      await expect(page.locator("#profile-name")).toHaveValue(
        "Updated Portal " + locale,
      );
      await assertPortalAxe(page, locale, "profile");
      await page.goto("/" + locale + "/account/security");
      await expect(page.locator("#security-current")).toBeVisible();
      await assertPortalAxe(page, locale, "security");
      await page.locator("#security-current").fill(password);
      await page.locator("#security-new").fill("Synthetic-New-Portal-5930");
      await page.locator("#security-confirm").fill("Mismatch");
      await page.locator("form button[type=submit]").click();
      await expect(page.locator("#security-confirm")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await page.locator("#security-confirm").fill("Synthetic-New-Portal-5930");
      await page.locator("form button[type=submit]").click();
      await expect(page).toHaveURL(baseURL + "/" + locale + "/auth/login");
      expect(
        await (await page.request.get("/api/auth/session")).json(),
      ).toEqual({});
      await page.locator("#login-email").fill(email);
      await page.locator("#login-password").fill("Synthetic-New-Portal-5930");
      await page.locator("form button[type=submit]").click();
      await expect(page).toHaveURL(baseURL + "/" + locale + "/account");
      await page.goto("/" + locale + "/account/security");
      const sessions = await (
        await page.request.get("/api/auth/sessions")
      ).json();
      expect(
        sessions.sessions.filter((s: { current: boolean }) => s.current),
      ).toHaveLength(1);
      await page
        .getByRole("button", { name: t.security.revoke, exact: true })
        .click();
      await expect(page).toHaveURL(baseURL + "/" + locale + "/auth/login");
      expect(errors).toEqual([]);
    } finally {
      await db.destroy();
    }
  });
test("profile language save navigates and reloads the protected screen in both directions", async ({
  page,
  baseURL,
}) => {
  const { prefix, password } = fixture();
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  expect(
    (
      await page.request.post("/api/auth/callback/credentials", {
        form: {
          email: prefix + "owner@example.invalid",
          password,
          csrfToken,
          json: "true",
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/ar/account/profile");
  for (const [locale, label, dir] of [
    ["en", "English", "ltr"],
    ["ar", "العربية", "rtl"],
  ]) {
    await page.locator("#profile-locale").click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await page.locator("form button[type=submit]").click();
    await expect(page).toHaveURL(baseURL + "/" + locale + "/account/profile");
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await page.reload();
    await expect(page.locator("#profile-locale")).toContainText(label);
    await expect(page.locator("#profile-email")).toHaveValue(
      prefix + "owner@example.invalid",
    );
  }
});
