// Alternating warm runs on two isolated synthetic copies; no production endpoint.
import { chromium } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
const sites = {
  reference: "http://127.0.0.1:3107",
  target: "https://127.0.0.1:3198",
};
const routes = [
  "/ar/account",
  "/en/account/requests",
  "/ar/account/requests/new",
  "/en/account/requests/migrationrequest",
  "/ar/account/inquiries",
  "/en/account/inquiries/migrationinquiry",
  "/en/account/profile",
  "/ar/account/security",
  "/en/account/notifications",
  "/api/account/requests",
  "/api/account/requests/migrationrequest",
  "/api/account/inquiries",
];
const browser = await chromium.launch({ headless: true }),
  contexts = {};
const report = {
  conditions: {
    rounds: 5,
    requestsPerRound: 50,
    concurrency: 1,
    viewport: [1280, 900],
    compression:
      "gzip level 6 of initial script response bodies; unique cold browser context per sample",
    latencyThreshold: "larger of 10% and 20ms",
    javascriptThreshold: 1.05,
    scope:
      "nine account screens and three scoped read APIs; same host and synthetic fixture; source HTTP, target loopback HTTPS; alternating warm runs",
  },
  runs: [],
  comparison: [],
};
try {
  for (const [site, origin] of Object.entries(sites)) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    contexts[site] = context;
    if (site === "target") {
      const deadline = Date.now() + 30000;
      for (;;) {
        const ready = await context.request
          .get(origin + "/api/health/ready")
          .catch(() => null);
        const ok = ready?.status() === 200;
        await ready?.dispose();
        if (ok) break;
        if (Date.now() > deadline)
          throw new Error("Target readiness timed out");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const { csrfToken } = await (
      await context.request.get(origin + "/api/auth/csrf")
    ).json();
    const login = await context.request.post(
      origin + "/api/auth/callback/credentials",
      {
        form: {
          email: "owner@migration.example.invalid",
          password: "Synthetic-Migration-4829",
          csrfToken,
          json: "true",
        },
      },
    );
    if (!login.ok()) throw new Error("Synthetic login failed");
  }
  for (const route of routes) {
    for (const [site, origin] of Object.entries(sites))
      for (let n = 0; n < 5; n++) {
        const r = await contexts[site].request.get(origin + route);
        await r.dispose();
      }
    for (let round = 0; round < 5; round++)
      for (const [site, origin] of round % 2
        ? Object.entries(sites).reverse()
        : Object.entries(sites)) {
        const times = [];
        for (let n = 0; n < 50; n++) {
          const start = performance.now(),
            response = await contexts[site].request.get(origin + route);
          await response.body();
          if (response.status() !== 200) throw new Error("Unexpected status");
          times.push(performance.now() - start);
          await response.dispose();
        }
        times.sort((a, b) => a - b);
        let bytes = null;
        if (!route.startsWith("/api/")) {
          const fresh = await browser.newContext({
            ignoreHTTPSErrors: true,
            storageState: await contexts[site].storageState(),
            viewport: { width: 1280, height: 900 },
            reducedMotion: "reduce",
          });
          await fresh.route("**/*", (r) =>
            new URL(r.request().url()).origin === origin
              ? r.continue()
              : r.abort(),
          );
          const page = await fresh.newPage(),
            bodies = [];
          page.on("response", (r) => {
            if (r.request().resourceType() === "script") bodies.push(r.body());
          });
          await page.goto(origin + route, { waitUntil: "networkidle" });
          bytes = (await Promise.all(bodies)).reduce(
            (sum, b) => sum + gzipSync(b, { level: 6 }).length,
            0,
          );
          await fresh.close();
        }
        const row = {
          site,
          route,
          round: round + 1,
          p50: times[24],
          p95: times[47],
          initialJavaScriptGzipBytes: bytes,
        };
        report.runs.push(row);
        console.log(JSON.stringify(row));
      }
    const average = (site, key) => {
      const rows = report.runs.filter(
        (r) => r.site === site && r.route === route,
      );
      return rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
    };
    const row = { route };
    for (const metric of [
      "p50",
      "p95",
      ...(!route.startsWith("/api/") ? ["initialJavaScriptGzipBytes"] : []),
    ]) {
      const reference = average("reference", metric),
        target = average("target", metric);
      row[metric] = {
        reference,
        target,
        pass:
          metric === "initialJavaScriptGzipBytes"
            ? target <= reference * 1.05
            : target - reference <= Math.max(reference * 0.1, 20),
      };
    }
    report.comparison.push(row);
  }
} finally {
  for (const ctx of Object.values(contexts)) await ctx.close();
  await browser.close();
  mkdirSync(".migration/account-performance", { recursive: true });
  writeFileSync(
    ".migration/account-performance/comparison.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
if (
  report.comparison.some((row) =>
    Object.values(row).some((v) => typeof v === "object" && !v.pass),
  )
)
  process.exitCode = 1;
