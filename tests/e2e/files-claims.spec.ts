import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  createDataSource,
  FileCleanupQueue,
  FileStore,
  PayloadCipher,
  sha256,
} from "@so7ob/server";
const fixture = () =>
  JSON.parse(readFileSync(".migration/e2e/run.json", "utf8")) as {
    prefix: string;
    password: string;
  };
// Each scenario exercises several identities behind the same loopback proxy.
// Isolate its login quota; rate-limit boundaries have independent negative tests.
async function clearScenarioLoginQuota() {
  const db = await createDataSource().initialize();
  try {
    await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [
      sha256("login:127.0.0.1"),
    ]);
  } finally {
    await db.destroy();
  }
}
test.beforeEach(clearScenarioLoginQuota);
test.afterEach(clearScenarioLoginQuota);
async function login(page: Page, actor: string) {
  const { prefix, password } = fixture();
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
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
}
test("multipart uploads retain bytes, legacy errors and server file authorization", async ({
  page,
  baseURL,
}, info) => {
  const { prefix } = fixture(),
    db = await createDataSource().initialize(),
    id = prefix + "files" + info.project.name;
  const { dataDir } = JSON.parse(
    readFileSync(".migration/e2e/storage.json", "utf8"),
  );
  const bytes = Buffer.from("%PDF-1.4\nSynthetic HTTP attachment\n%%EOF\n");
  const upload = () =>
    page.request.post("/api/attachments", {
      headers: { Origin: baseURL! },
      multipart: {
        requestId: id,
        file: { name: "طلب.pdf", mimeType: "application/pdf", buffer: bytes },
      },
    });
  try {
    await db.query(
      "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId) VALUES(?,?,'quote','web','Synthetic HTTP files','synthetic','unspecified','flexible','Owner',?,'email','en',?)",
      [
        id,
        "S7-FILES-" + info.project.name,
        prefix + "owner@example.invalid",
        prefix + "owner",
      ],
    );
    expect((await upload()).status()).toBe(401);
    await login(page, "other");
    expect((await upload()).status()).toBe(403);
    await login(page, "owner");
    const result = await upload();
    expect(result.status()).toBe(201);
    const { attachment } = await result.json();
    const url = "/api/attachments/" + attachment.id;
    const download = await page.request.get(url);
    expect(download.status()).toBe(200);
    expect(await download.body()).toEqual(bytes);
    expect(download.headers()["cache-control"]).toBe("private, no-store");
    expect(download.headers()["x-content-type-options"]).toBe("nosniff");
    expect(download.headers()["content-disposition"]).toContain("attachment;");
    await login(page, "other");
    expect((await page.request.get(url)).status()).toBe(403);
    await login(page, "owner");
    const spoof = await page.request.post("/api/v1/attachments", {
      headers: { Origin: baseURL! },
      multipart: {
        requestId: id,
        file: {
          name: "spoof.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("<script>unsafe</script>"),
        },
      },
    });
    expect(spoof.status()).toBe(400);
    const oversized = await page.request.post("/api/attachments", {
      headers: { Origin: baseURL! },
      multipart: {
        requestId: id,
        file: {
          name: "large.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
        },
      },
    });
    expect(oversized.status()).toBe(400);
    expect((await oversized.json()).code).toBe("too_large");
    await db.query(
      "INSERT INTO RequestMessage(id,requestId,authorType,kind,body) VALUES(?,?,'staff','internal_note','Synthetic internal file')",
      [id + "note", id],
    );
    await db.query("UPDATE Attachment SET messageId=? WHERE id=?", [
      id + "note",
      attachment.id,
    ]);
    expect((await page.request.get(url)).status()).toBe(403);
    await login(page, "admin");
    expect((await page.request.get(url)).status()).toBe(200);
    const image = await sharp({
      create: { width: 3, height: 3, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await login(page, "owner");
    expect(
      (
        await page.request.post("/api/admin/media", {
          headers: { Origin: baseURL! },
          multipart: {
            file: {
              name: "synthetic.png",
              mimeType: "image/png",
              buffer: image,
            },
          },
        })
      ).status(),
    ).toBe(403);
    await login(page, "editor");
    const mediaResponse = await page.request.post("/api/v1/admin/media", {
      headers: { Origin: baseURL! },
      multipart: {
        altText: "نص بديل",
        file: { name: "synthetic.png", mimeType: "image/png", buffer: image },
      },
    });
    expect(mediaResponse.status()).toBe(201);
    const { media } = await mediaResponse.json();
    const publicFile = await page.request.get(media.url);
    expect(await publicFile.body()).toEqual(image);
    expect(publicFile.headers()["content-type"]).toContain("image/png");
    expect(publicFile.headers()["cache-control"]).toBe(
      "public, max-age=3600, must-revalidate",
    );
    expect(
      (
        await page.request.patch("/api/admin/media/" + media.id, {
          headers: { Origin: baseURL! },
          data: { altText: "Updated alternative", title: "Synthetic title" },
        })
      ).status(),
    ).toBe(200);
    const [record] = await db.query(
      "SELECT storedName FROM MediaItem WHERE id=?",
      [media.id],
    );
    expect(
      (
        await page.request.delete("/api/admin/media/" + media.id, {
          headers: { Origin: baseURL! },
        })
      ).status(),
    ).toBe(200);
    expect((await page.request.get(media.url)).status()).toBe(404);
    expect(await readFile(join(dataDir, "uploads", record.storedName))).toEqual(
      image,
    );
    await new FileCleanupQueue(
      db,
      new FileStore({ DATA_DIR: dataDir, NODE_ENV: "production" }),
    ).processOne();
    await expect(
      readFile(join(dataDir, "uploads", record.storedName)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await db.query("DELETE FROM FileCleanupJob WHERE storedName=?", [
      record.storedName,
    ]);
  } finally {
    await db.destroy();
  }
});
test("claim HTTP contracts bind the original email proof and charge malformed attempts before parsing", async ({
  page,
  baseURL,
}, info) => {
  const { prefix } = fixture(),
    db = await createDataSource().initialize(),
    id = prefix + "claim" + info.project.name,
    ref = "S7-CLAIM-" + info.project.name.toUpperCase();
  try {
    const unauthenticated = await page.request.get(
      "/api/account/claim-verify?locale=en",
      { maxRedirects: 0 },
    );
    expect(unauthenticated.status()).toBe(307);
    expect(unauthenticated.headers().location).toBe(
      "/en/account/requests?claim=login_required",
    );
    await db.query(
      "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote','web','Synthetic HTTP claim','synthetic','unspecified','flexible','Previous contact',?,'email','en')",
      [id, ref, prefix + "claim" + info.project.name + "@example.invalid"],
    );
    await login(page, "owner");
    await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [
      sha256("claim:" + prefix + "owner:127.0.0.1"),
    ]);
    const start = await page.request.post("/api/v1/account/requests/claim", {
      headers: { Origin: baseURL! },
      data: { refCode: ref },
    });
    expect(start.status()).toBe(200);
    expect(await start.json()).toEqual({ ok: true, message: "claim_sent" });
    const [job] = await db.query(
      "SELECT j.id,j.payload FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?",
      [prefix + "claim" + info.project.name + "@example.invalid"],
    );
    const mail = new PayloadCipher(process.env.OUTBOX_KEY!).decrypt(
      job.payload,
      job.id,
    );
    const proof = new URL(mail.text.match(/https:\/\/[^\s]+/)![0]);
    await login(page, "other");
    const wrong = await page.request.get(proof.pathname + proof.search, {
      maxRedirects: 0,
    });
    expect(wrong.headers().location).toContain("claim=invalid");
    await login(page, "owner");
    const success = await page.request.get(proof.pathname + proof.search, {
      maxRedirects: 0,
    });
    expect(success.status()).toBe(307);
    expect(success.headers().location).toContain("claim=ok&ref=" + ref);
    expect(
      (
        await page.request.get(proof.pathname + proof.search, {
          maxRedirects: 0,
        })
      ).headers().location,
    ).toContain("claim=invalid");
    for (let n = 0; n < 2; n++)
      expect(
        (
          await page.request.post("/api/account/requests/claim", {
            headers: { Origin: baseURL!, "Content-Type": "application/json" },
            data: "{",
          })
        ).status(),
      ).toBe(400);
    const limited = await page.request.post("/api/account/requests/claim", {
      headers: { Origin: baseURL! },
      data: { refCode: "missing" },
    });
    expect(limited.status()).toBe(429);
    expect(limited.headers()["retry-after"]).toBeTruthy();
  } finally {
    await db.destroy();
  }
});
