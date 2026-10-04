import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { getPortalContent } from "../../apps/web/src/content/portal";
import { createDataSource } from "@so7ob/server";
const fixture = () =>
  JSON.parse(readFileSync(".migration/e2e/run.json", "utf8")) as {
    prefix: string;
    password: string;
  };
test("the original public request form validates, preserves its draft and confirms a real persisted submission", async ({
  page,
}, info) => {
  const { prefix } = fixture();
  const locale = info.project.name === "mobile" ? "ar" : "en";
  const email = prefix + "public" + info.project.name + "@example.invalid";
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/" + locale + "/contact?type=quote&service=web");
  await expect(page.locator("#serviceType")).toHaveValue("web");
  await page.locator("form button[type=submit]").click();
  await expect(page.locator("#description")).toBeFocused();
  await expect(page.locator("#description")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page
    .locator("#description")
    .pressSequentially(
      "Synthetic requirements for a bilingual project, with accessible customer workflows and retained records.",
      { delay: 25 },
    );
  await page.locator("#name").fill("Synthetic public contact");
  await page.locator("#email").fill(email);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("so7ob-request-draft") ?? "{}").email,
      ),
    )
    .toBe(email);
  const submitted = page.waitForResponse(
    (r) => r.url().endsWith("/api/requests") && r.request().method() === "POST",
  );
  await page.locator("form button[type=submit]").click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.ref).toMatch(/^S7-[A-Z0-9]{8}$/);
  expect(body.trackUrl).toMatch(new RegExp("^/"+locale+"/track\\?t="));
  await expect(page.getByRole("button",{name:getPortalContent(locale).track.openTracking,exact:true})).toBeVisible();
  await expect(page.getByRole("status")).toContainText(body.ref);
  const db = await createDataSource().initialize();
  try {
    const [row] = await db.query(
      "SELECT id,email,clientId,serviceType,requestType FROM ProjectRequest WHERE refCode=?",
      [body.ref],
    );
    expect(row.email).toBe(email);
    expect(row.clientId).toBeNull();
    expect(row.serviceType).toBe("web");
    expect(row.requestType).toBe("quote");
    const token=new URL(body.trackUrl,"https://synthetic.invalid").searchParams.get("t")!;
    const [tracking]=await db.query("SELECT tokenHash,requestId FROM TrackLink WHERE requestId=?",[row.id]);
    expect(tracking.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(tracking.requestId).toBe(row.id);

    expect(
      (
        await db.query(
          "SELECT id FROM Notification WHERE userId=? AND link=?",
          [prefix + "admin", "/ar/admin/requests/" + row.id],
        )
      ).length,
    ).toBe(1);
  } finally {
    await db.destroy();
  }
  expect(
    await page.evaluate(() => localStorage.getItem("so7ob-request-draft")),
  ).toBeNull();
  expect(errors).toEqual([]);
});
test("legacy and v1 account contracts enforce ownership, CSRF and field projection", async ({
  page,
  baseURL,
}, info) => {
  const { prefix, password } = fixture();
  const origin = new URL(baseURL!).origin;
  const login = async (actor: string) => {
    const { csrfToken } = await (
      await page.request.get("/api/auth/csrf")
    ).json();
    expect(
      (
        await page.request.post("/api/auth/callback/credentials", {
          form: {
            email: prefix + actor + "@example.invalid",
            password,
            csrfToken,
            json: "true",
          },
        })
      ).status(),
    ).toBe(200);
  };
  expect((await page.request.get("/api/account/profile")).status()).toBe(401);
  await login("owner");
  const invalidInquiry=await page.request.post('/api/inquiries',{headers:{Origin:origin},data:{subject:'',message:'',name:'',email:''}});
  expect(invalidInquiry.status()).toBe(400);expect((await invalidInquiry.json()).errors).toEqual({subject:'required',message:'required',name:'required',email:'invalidEmail'});
  const profile = await (
    await page.request.get("/api/v1/account/profile")
  ).json();
  expect(profile.user.id).toBe(prefix + "owner");
  expect(profile.user).not.toHaveProperty("passwordHash");
  const denied = await page.request.patch("/api/account/profile", {
    headers: { Origin: "https://attacker.example.invalid" },
    data: { name: "Injected" },
  });
  expect(denied.status()).toBe(403);
  const updated = await page.request.patch("/api/v1/account/profile", {
    headers: { Origin: origin },
    data: { name: "Browser Owner", roleKey: "super_admin" },
  });
  expect(updated.status()).toBe(200);
  expect(
    (await (await page.request.get("/api/account/profile")).json()).user
      .roleKey,
  ).toBe("client");
  const description = "Draft for " + info.project.name;
  expect(
    (
      await page.request.put("/api/account/drafts", {
        headers: { Origin: origin },
        data: { description, clientId: prefix + "other", email: "excluded" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await page.request.get("/api/v1/account/drafts")).json()).draft,
  ).toEqual({ description });
  await login("other");
  expect(
    (await (await page.request.get("/api/account/drafts")).json()).draft,
  ).toBeNull();
  const result = await page.request.post("/api/v1/inquiries", {
    headers: { Origin: origin },
    data: {
      subject: "Synthetic browser inquiry",
      message: "A sufficiently detailed browser inquiry",
      name: "Submitted inquiry contact",
      email: prefix + "inquiry" + info.project.name + "@example.invalid",
      clientId: prefix + "owner",
    },
  });
  expect(result.status()).toBe(201);
  const ref = (await result.json()).ref;
  const db = await createDataSource().initialize();
  try {
    const [row] = await db.query(
      "SELECT clientId FROM Inquiry WHERE refCode=?",
      [ref],
    );
    expect(row.clientId).toBe(prefix + "other");
  } finally {
    await db.destroy();
  }
});
test("conversation endpoints reject cross-account access, hide staff notes and serialize repeated replies", async ({
  page,
  baseURL,
}, info) => {
  const { prefix, password } = fixture();
  const db = await createDataSource().initialize();
  const id = prefix + "conversation" + info.project.name;
  const ref = "S7-" + info.project.name.toUpperCase();
  const login = async (actor: string) => {
    const { csrfToken } = await (
      await page.request.get("/api/auth/csrf")
    ).json();
    expect(
      (
        await page.request.post("/api/auth/callback/credentials", {
          form: {
            email: prefix + actor + "@example.invalid",
            password,
            csrfToken,
            json: "true",
          },
        })
      ).status(),
    ).toBe(200);
  };
  try {
    await db.query(
      "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId,status) VALUES(?,?,'quote','web','Synthetic conversation',?,'unspecified','flexible','Synthetic owner',?,'email','en',?,'awaiting_info')",
      [
        id,
        ref,
        "synthetic",
        prefix + "owner@example.invalid",
        prefix + "owner",
      ],
    );
    await db.query(
      "INSERT INTO RequestMessage(id,requestId,authorType,kind,body) VALUES(?,?,'staff','internal_note','INTERNAL API NOTE')",
      [id + "note", id],
    );
    await login("other");
    expect(
      (await page.request.get("/api/account/requests/" + id)).status(),
    ).toBe(403);
    await login("owner");
    const detail = await (
      await page.request.get("/api/v1/account/requests/" + id)
    ).json();
    expect(JSON.stringify(detail)).not.toContain("INTERNAL API NOTE");
    const forbidden = await page.request.post(
      "/api/account/requests/" + id + "/messages",
      {
        headers: { Origin: baseURL! },
        data: { body: "Try a private note", kind: "internal_note" },
      },
    );
    expect(forbidden.status()).toBe(403);
    const sent = await Promise.all(
      Array.from({ length: 4 }, () =>
        page.request.post("/api/v1/account/requests/" + id + "/messages", {
          headers: { Origin: baseURL! },
          data: { body: "Synthetic client reply" },
        }),
      ),
    );
    for (const response of sent) expect(response.status()).toBe(201);
    const messages = await Promise.all(sent.map((r) => r.json()));
    expect(new Set(messages.map((m) => m.message.id)).size).toBe(1);
    const updated = await (
      await page.request.get("/api/account/requests/" + id)
    ).json();
    expect(updated.request.status).toBe("in_review");
    expect(
      (
        await (
          await page.request.get("/api/account/requests", {
            params: { q: ref },
          })
        ).json()
      ).requests.some((r: { id: string }) => r.id === id),
    ).toBe(true);
    expect(
      (
        await page.request.patch("/api/account/requests/" + id, {
          headers: { Origin: baseURL! },
          data: { action: "cancel" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post("/api/account/requests/" + id + "/messages", {
          headers: { Origin: baseURL! },
          data: { body: "Closed reply" },
        })
      ).status(),
    ).toBe(409);
    const inquiry = await page.request.post("/api/v1/account/inquiries", {
      headers: { Origin: baseURL! },
      data: {
        subject: "Browser portal inquiry",
        message: "Synthetic authenticated inquiry content",
        name: "Spoofed",
        email: "spoofed@example.invalid",
      },
    });
    expect(inquiry.status()).toBe(201);
    const inquiryId = (await inquiry.json()).id;
    const [stored] = await db.query(
      "SELECT email,clientId FROM Inquiry WHERE id=?",
      [inquiryId],
    );
    expect(stored.email).toBe(prefix + "owner@example.invalid");
    expect(stored.clientId).toBe(prefix + "owner");
    await login("other");
    expect(
      (await page.request.get("/api/account/inquiries/" + inquiryId)).status(),
    ).toBe(404);
  } finally {
    await db.destroy();
  }
});
