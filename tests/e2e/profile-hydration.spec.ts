import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("profile editing waits for hydration and persists the first edit with a delayed real route chunk", async ({
  page,
}, info) => {
  const { prefix, password } = JSON.parse(
    readFileSync(".migration/e2e/run.json", "utf8"),
  );
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
  const original = (
    await (await page.request.get("/api/account/profile")).json()
  ).user;
  let release!: () => void;
  const chunkGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/assets/profile-*.js", async (route) => {
    await chunkGate;
    await route.continue();
  });
  try {
    await page.goto("/ar/account/profile", { waitUntil: "commit" });
    await expect(page.locator("#profile-name")).toBeVisible();
    await expect(page.locator("#profile-name")).toBeDisabled();
    release();
    await expect(page.locator("#profile-name")).toBeEnabled();
    const name = "Hydrated profile " + info.project.name;
    await page.locator("#profile-name").fill(name);
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/account/profile") &&
        r.request().method() === "PATCH",
    );
    await page.locator("form button[type=submit]").click();
    const result = await saved;
    expect(result.status()).toBe(200);
    expect(result.request().postDataJSON().name).toBe(name);
    expect(
      (await (await page.request.get("/api/account/profile")).json()).user.name,
    ).toBe(name);
    await page.reload();
    await expect(page.locator("#profile-name")).toHaveValue(name);
    expect(errors).toEqual([]);
  } finally {
    release();
    await page.unroute("**/assets/profile-*.js");
    expect(
      (
        await page.request.patch("/api/account/profile", {
          headers: { "x-csrf-token": csrfToken },
          data: {
            name: original.name,
            phone: original.phone ?? "",
            company: original.company ?? "",
            locale: original.locale,
          },
        })
      ).status(),
    ).toBe(200);
  }
});
