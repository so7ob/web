// Read contracts from both isolated applications; only synthetic login/read timestamps change.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const origins = {
  reference: "http://127.0.0.1:3107",
  target: "https://127.0.0.1:3198",
};
const routes = [
  "/api/account/profile",
  "/api/account/drafts",
  "/api/account/notifications",
  "/api/account/requests",
  "/api/account/requests/migrationrequest",
  "/api/account/inquiries",
  "/api/account/inquiries/migrationinquiry",
];
const browser = await chromium.launch({ headless: true });
const report = {
  sourceSHA: "5321b7fd11db421c83290b262f276811e5f04e5f",
  ignoredVolatileFields: [
    "lastLoginAt",
    "clientReadAt",
    "staffReadAt",
    "updatedAt",
  ],
  actors: {},
  comparisons: [],
};
const normalize = (value) =>
  Array.isArray(value)
    ? value.map(normalize)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .filter((k) => !report.ignoredVolatileFields.includes(k))
            .sort()
            .map((k) => [k, normalize(value[k])]),
        )
      : value;
try {
  for (const actor of ["owner", "other", "support"]) {
    report.actors[actor] = {};
    for (const [site, origin] of Object.entries(origins)) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
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
      if (!login.ok())
        throw new Error("Synthetic login failed: " + site + " " + actor);
      const rows = [];
      for (const route of routes) {
        const response = await context.request.get(origin + route);
        rows.push({
          route,
          status: response.status(),
          body: await response.json(),
        });
      }
      report.actors[actor][site] = rows;
      await context.close();
    }
    for (const route of routes) {
      const source = report.actors[actor].reference.find(
          (r) => r.route === route,
        ),
        target = report.actors[actor].target.find((r) => r.route === route);
      const same =
        JSON.stringify(normalize(source)) === JSON.stringify(normalize(target));
      report.comparisons.push({ actor, route, pass: same });
      console.log(JSON.stringify({ actor, route, pass: same }));
    }
  }
} finally {
  await browser.close();
  mkdirSync(".migration/business-contracts", { recursive: true });
  writeFileSync(
    ".migration/business-contracts/comparison.json",
    JSON.stringify(report, null, 2),
  );
}
if (report.comparisons.some((r) => !r.pass)) process.exitCode = 1;
