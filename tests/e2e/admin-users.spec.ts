import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createDataSource, PayloadCipher, sha256 } from "@so7ob/server";
const fixture = () =>
  JSON.parse(readFileSync(".migration/e2e/run.json", "utf8")) as {
    prefix: string;
    password: string;
  };
async function login(
  context: APIRequestContext,
  email: string,
  password: string,
) {
  const { csrfToken } = await (await context.get("/api/auth/csrf")).json();
  expect(
    (
      await context.post("/api/auth/callback/credentials", {
        form: { email, password, csrfToken, json: "true" },
      })
    ).status(),
  ).toBe(200);
  return { "x-csrf-token": csrfToken };
}
test("administration legacy and v1 contracts preserve projections, filters and separate operation permissions", async ({
  playwright,
  baseURL,
}, info) => {
  const { prefix, password } = fixture(),
    db = await createDataSource().initialize(),
    subject = prefix + "adminsubject" + info.project.name;
  const admin = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    }),
    ops = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    }),
    client = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });
  try {
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt) SELECT ?,?,'Synthetic admin subject',passwordHash,'client','active',UTC_TIMESTAMP(3) FROM User WHERE id=?",
      [subject, subject + "@example.invalid", prefix + "owner"],
    );
    expect((await admin.get("/api/admin/users")).status()).toBe(401);
    const adminHeaders = await login(
        admin,
        prefix + "admin@example.invalid",
        password,
      ),
      opsHeaders = await login(ops, prefix + "ops@example.invalid", password);
    await login(client, prefix + "owner@example.invalid", password);
    for (const api of ["/api/admin/users", "/api/v1/admin/users"]) {
      const denied = await client.get(api);
      expect(denied.status()).toBe(403);
      expect(await denied.json()).toEqual({ ok: false, code: "forbidden" });
      const result = await ops.get(api + "?q=" + subject);
      expect(result.status()).toBe(200);
      expect(result.headers()["cache-control"]).toBe("no-store");
      const body = await result.json();
      expect(body).toMatchObject({
        ok: true,
        total: 1,
        pageSize: 20,
        users: [{ id: subject, emailVerified: true }],
      });
      expect(JSON.stringify(body)).not.toMatch(
        /passwordHash|fingerprint|sessionsRevokedAt/,
      );
      expect((await ops.get(api + "/absent")).status()).toBe(404);
      const profile = await (await ops.get(api + "/" + subject)).json();
      expect(profile).toMatchObject({
        ok: true,
        user: { id: subject },
        stats: { totalRequests: 0, openRequests: 0 },
      });
      expect(profile.user).not.toHaveProperty("passwordHash");
      expect(
        (
          await ops.patch(api + "/" + subject, {
            headers: opsHeaders,
            data: { name: "Should not commit", roleKey: "super_admin" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await ops.patch(api + "/" + subject, {
            headers: opsHeaders,
            data: { status: "suspended" },
          })
        ).status(),
      ).toBe(403);
      const saved = await ops.patch(api + "/" + subject, {
        headers: opsHeaders,
        data: { phone: " 123456 ", company: " Synthetic company " },
      });
      expect(saved.status()).toBe(200);
      expect(await saved.json()).toMatchObject({
        ok: true,
        user: { phone: "123456", company: "Synthetic company" },
      });
      expect(
        (
          await admin.patch(api + "/" + subject, {
            data: { name: "CSRF denied" },
          })
        ).status(),
      ).toBe(403);
      const invalid = await admin.patch(api + "/" + subject, {
        headers: adminHeaders,
        data: { passwordHash: "invalid" },
      });
      expect(invalid.status()).toBe(400);
      expect(await invalid.json()).toEqual({ ok: false, code: "invalid" });
    }
    expect(
      (await db.query("SELECT roleKey FROM User WHERE id=?", [subject]))[0]
        .roleKey,
    ).toBe("client");
  } finally {
    await Promise.all([admin.dispose(), ops.dispose(), client.dispose()]);
    await db.destroy();
  }
});
test("invitation HTTP admission counts malformed input and delivers a single-use encrypted proof", async ({
  playwright,
  baseURL,
}, info) => {
  const { prefix, password } = fixture(),
    db = await createDataSource().initialize(),
    context = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });
  const email = prefix + "invite" + info.project.name + "@example.invalid",
    bucket = sha256("invite:" + prefix + "admin");
  try {
    await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [bucket]);
    const headers = await login(
      context,
      prefix + "admin@example.invalid",
      password,
    );
    const created = await context.post("/api/v1/admin/users", {
      headers,
      data: { email, roleKey: "support" },
    });
    expect(created.status()).toBe(201);
    expect(await created.json()).toEqual({ ok: true, emailStatus: "queued" });
    const duplicate = await context.post("/api/admin/users", {
      headers,
      data: { email, roleKey: "support" },
    });
    expect(duplicate.status()).toBe(409);
    expect(await duplicate.json()).toEqual({
      ok: false,
      code: "invite_pending",
    });
    const [job] = await db.query(
      "SELECT j.id,j.payload,e.bodyText FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?",
      [email],
    );
    expect(job.bodyText).toBe("");
    const mail = new PayloadCipher().decrypt(job.payload, job.id),
      raw = new URL(mail.text.match(/https:\/\/\S+/)![0]).searchParams.get(
        "token",
      )!;
    for (const path of ["/api/admin/users", "/api/v1/admin/users"]) {
      const malformed = await context.post(path, {
        headers: { ...headers, "content-type": "application/json" },
        data: "{broken",
      });
      expect(malformed.status()).toBe(400);
      expect(await malformed.json()).toEqual({ ok: false, code: "invalid" });
    }
    const invalid = await context.post("/api/admin/users", {
      headers,
      data: { email: "invalid" },
    });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toEqual({ ok: false, code: "invalid" });
    const limited = await context.post("/api/v1/admin/users", {
      headers,
      data: { email },
    });
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
    const accept = await context.post("/api/auth/invite", {
      headers,
      data: {
        token: raw,
        name: "Accepted via HTTP",
        password: "Synthetic-invitation-5813",
      },
    });
    expect(accept.status()).toBe(201);
    const replay = await context.post("/api/auth/invite", {
      headers,
      data: {
        token: raw,
        name: "Repeated",
        password: "Synthetic-invitation-5813",
      },
    });
    expect(replay.status()).toBe(400);
    const [user] = await db.query(
      "SELECT roleKey,emailVerifiedAt FROM User WHERE email=?",
      [email],
    );
    expect(user.roleKey).toBe("support");
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
  } finally {
    await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [bucket]);
    await context.dispose();
    await db.destroy();
  }
});
