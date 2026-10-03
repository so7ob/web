// Target portal screenshots on the separately imported synthetic MariaDB fixture.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const origin = "https://127.0.0.1:3198",
  out = ".migration/account-target";
mkdirSync(out + "/screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const runs = [];
try {
  for (const width of [375, 1280])
    for (const locale of ["ar", "en"]) {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
        timezoneId: "Asia/Aden",
      });
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      const { csrfToken } = await (
        await context.request.get(origin + "/api/auth/csrf")
      ).json();
      const login = await context.request.post(
        origin + "/api/auth/callback/credentials",
        {
          headers: { "User-Agent": "" },
          form: {
            email: "owner@migration.example.invalid",
            password: "Synthetic-Migration-4829",
            csrfToken,
            json: "true",
          },
        },
      );
      if (!login.ok()) throw new Error("Synthetic source login failed");
      for (const suffix of [
        "",
        "/requests",
        "/requests/new",
        "/requests/migrationrequest",
        "/inquiries",
        "/inquiries/migrationinquiry",
        "/profile",
        "/security",
        "/notifications",
      ]) {
        const page = await context.newPage(),
          errors = [],
          failedRequests = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("requestfailed", (req) =>
          failedRequests.push({
            path: new URL(req.url()).pathname,
            error: req.failure()?.errorText,
          }),
        );
        const route = "/" + locale + "/account" + suffix,
          name = (suffix || "/dashboard").slice(1).replaceAll("/", "-");
        if (suffix === "/security") {
          const fixture = JSON.parse(
            readFileSync(
              "tests/e2e/fixtures/account-session-visual.json",
              "utf8",
            ),
          ).cases[`${width}:${locale}`];
          await page.clock.setFixedTime(new Date(fixture.instant));
          await page.route("**/api/auth/sessions", (route) =>
            route.request().method() === "GET"
              ? route.fulfill({
                  json: { ok: true, sessions: fixture.sessions },
                })
              : route.continue(),
          );
        }
        const response = await page.goto(origin + route, {
          waitUntil: "networkidle",
        });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path:
            out + "/screenshots/" + locale + "-" + name + "-" + width + ".png",
        });
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        runs.push({
          locale,
          width,
          name,
          route,
          status: response.status(),
          visualSessionFixture:
            suffix === "/security" ? "account-session-visual.json" : null,
          errors,
          failedRequests,
          axe: axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            targets: v.nodes.map((n) => n.target),
          })),
        });
        writeFileSync(
          out + "/report.json",
          JSON.stringify(
            {
              sourceSHA: "5321b7fd11db421c83290b262f276811e5f04e5f",
              browser: browser.version(),
              sessionFixture:
                "Blank login User-Agent matches the pinned source callback, which stores NULL; browser UA remains unchanged",
              height: 900,
              reducedMotion: "reduce",
              runs,
            },
            null,
            2,
          ) + "\n",
        );
        console.log(
          locale +
            " " +
            name +
            " " +
            width +
            ": " +
            response.status() +
            ", axe=" +
            axe.violations.length,
        );
        await page.close();
      }
      await context.close();
    }
} finally {
  await browser.close();
}
