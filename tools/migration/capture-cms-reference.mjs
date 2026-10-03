// Frozen behavior of the executable source on its own synthetic SQLite database.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const origin = "http://127.0.0.1:3107",
  browser = await chromium.launch({ headless: true }),
  report = {
    sourceSHA: "5321b7fd11db421c83290b262f276811e5f04e5f",
    capturedAt: new Date().toISOString(),
    cases: [],
  },
  created = [];
try {
  const context = await browser.newContext();
  const { csrfToken } = await (
    await context.request.get(origin + "/api/auth/csrf")
  ).json();
  await context.request.post(origin + "/api/auth/callback/credentials", {
    form: {
      email: "admin@migration.example.invalid",
      password: "Synthetic-Migration-4829",
      csrfToken,
      json: "true",
    },
  });
  async function call(name, method, path, data) {
    const res = await context.request.fetch(origin + path, {
        method,
        data,
        headers: { Origin: origin },
      }),
      body = await res.json();
    report.cases.push({ name, method, path, status: res.status(), body });
    return body;
  }
  await call("reserved slug", "POST", "/api/admin/pages", {
    slug: "admin",
    titleEn: "Synthetic",
  });
  const page = await call("create template", "POST", "/api/admin/pages", {
    slug: "migration-cms-" + Date.now().toString(36),
    titleAr: "صفحة اختبار",
    titleEn: "Synthetic CMS",
    template: "blank-section",
  });
  if (!page.ok) throw new Error("Synthetic page creation failed");
  const id = page.page.id;
  created.push(id);
  const path = "/api/admin/pages/" + id;
  const current = await call("draft detail", "GET", path);
  await call("invalid block", "PATCH", path, {
    draftBlocksEn: '[{"id":"bad","type":"unknown"}]',
  });
  await call("stale draft", "PATCH", path, {
    draftUpdatedAt: "2020-01-01T00:00:00.000Z",
    draftBlocksEn: "[]",
  });
  await call("publish", "POST", path + "/publish", {});
  await call("versions", "GET", path + "/versions");
  await call("restore draft only", "POST", path + "/versions/1/restore", {});
  await call(
    "missing restore source behavior",
    "POST",
    path + "/versions/999/restore",
    {},
  );
  await call("renamed published page", "PATCH", path, {
    slug: page.page.slug + "-new",
    seoTitleEn: "Changed synthetic SEO",
  });
  await call("duplicate block IDs", "PATCH", path, {
    draftBlocksAr: JSON.stringify([
      { id: "same", type: "text", props: { paragraphs: ["one"] } },
      { id: "same", type: "text", props: { paragraphs: ["two"] } },
    ]),
  });
  await call("archive", "DELETE", path);
  await call("archived detail", "GET", path);
  report.templateBlocks = {
    ar: current.page.draftBlocksAr,
    en: current.page.draftBlocksEn,
  };
  await context.close();
} finally {
  await browser.close();
  // Delete only this capture's synthetic records, after recording the actual archive behavior.
  const db = new DatabaseSync(".migration/baseline/data/reference.db");
  db.exec("PRAGMA foreign_keys=ON");
  for (const id of created) {
    const page = db.prepare("SELECT slug FROM Page WHERE id=?").get(id);
    if (page) {
      db.prepare("DELETE FROM PageRedirect WHERE toSlug=?").run(page.slug);
      db.prepare("DELETE FROM AuditLog WHERE entityType=? AND entityId=?").run(
        "page",
        id,
      );
      db.prepare(
        "DELETE FROM Notification WHERE type='content_published' AND payload LIKE ?",
      ).run("%" + page.slug.replace(/-new$/, "") + "%");
      db.prepare("DELETE FROM PageVersion WHERE pageId=?").run(id);
      db.prepare("DELETE FROM Page WHERE id=?").run(id);
    }
  }
  db.close();
  mkdirSync(".migration/cms-reference", { recursive: true });
  writeFileSync(
    ".migration/cms-reference/contracts.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log("Captured " + report.cases.length + " CMS reference operations");
