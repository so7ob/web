// Read-only API baseline from the pinned, synthetic Website runtime. No remote endpoints.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const origin = "http://127.0.0.1:3107",
  browser = await chromium.launch({ headless: true });
const report = {
  sourceSHA: "5321b7fd11db421c83290b262f276811e5f04e5f",
  capturedAt: new Date().toISOString(),
  actors: {},
};
let ownerId;
try {
  for (const actor of ["admin", "ops", "owner"]) {
    const context = await browser.newContext();
    const { csrfToken } = await (
      await context.request.get(origin + "/api/auth/csrf")
    ).json();
    const login = await context.request.post(
      origin + "/api/auth/callback/credentials",
      {
        form: {
          email: actor + "@migration.example.invalid",
          password: "Synthetic-Migration-4829",
          csrfToken,
          json: "true",
        },
      },
    );
    if (!login.ok()) throw new Error("Synthetic reference login failed");
    if (!ownerId) {
      const found = await (
        await context.request.get(origin + "/api/admin/users?q=owner")
      ).json();
      ownerId = found.users.find(
        (u) => u.email === "owner@migration.example.invalid",
      ).id;
    }
    report.actors[actor] = [];
    for (const path of [
      "/api/admin/users",
      "/api/admin/users?q=owner",
      "/api/admin/users?role=client&status=active&sort=email&dir=asc",
      "/api/admin/users?sort=not-a-column&dir=asc",
      "/api/admin/users?page=2",
      "/api/admin/users/" + ownerId,
      "/api/admin/users/absent",
    ]) {
      const response = await context.request.get(origin + path);
      report.actors[actor].push({
        path,
        status: response.status(),
        body: await response.json(),
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
mkdirSync(".migration/admin-users-reference", { recursive: true });
writeFileSync(
  ".migration/admin-users-reference/contracts.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log("Captured 21 read contracts from isolated Website reference");
