import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createDataSource } from "../database/data-source.js";
import { transaction, sha256 } from "../auth/persistence.js";
import { WebhookQueue, WebhookCipher, processWebhook } from "./webhook.js";
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Isolated real MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name });
const prefix = "webhook" + randomBytes(8).toString("hex");
const cipher = new WebhookCipher(randomBytes(32).toString("hex"));
const queue = new WebhookQueue(db, cipher, 1000);
const ids = new Set<string>();
let url: string;
let status = 200;
let hang = false;
const bodies: string[] = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += String(chunk)));
  req.on("end", () => {
    bodies.push(body);
    if (hang) {
      req.socket.destroy();
      return;
    }
    res.writeHead(status);
    res.end("synthetic receiver");
  });
});
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  await db.query(
    "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,budget,timeline,name,email,preferredContact,locale,descriptionHash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      prefix,
      prefix,
      "quote",
      "web",
      "Synthetic webhook request",
      "unspecified",
      "flexible",
      "Synthetic",
      prefix + "@example.invalid",
      "email",
      "en",
      sha256("synthetic"),
    ],
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  url = "http://127.0.0.1:" + address.port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (db.isInitialized) {
    for (const id of ids)
      await db.query("DELETE FROM WebhookJob WHERE id=?", [id]);
    await db.query("DELETE FROM ProjectRequest WHERE id=?", [prefix]);
    await db.destroy();
  }
});
async function enqueue(label: string, target = url) {
  const id = await transaction(db, (r) =>
    queue.enqueue(
      r,
      { url: target, body: JSON.stringify({ synthetic: label }) },
      prefix,
      sha256(prefix + label),
    ),
  );
  ids.add(id);
  return id;
}
async function state(id: string) {
  const [row] = await db.query("SELECT * FROM WebhookJob WHERE id=?", [id]);
  return row;
}
describe("durable webhook delivery", () => {
  it("encrypts and deduplicates concurrent enqueue, rejecting conflicting payloads", async () => {
    const jobs = await Promise.all(
      Array.from({ length: 6 }, () => enqueue("dedupe")),
    );
    expect(new Set(jobs).size).toBe(1);
    const row = await state(jobs[0]);
    expect(row.payload).not.toContain(url);
    expect(cipher.decrypt(row.payload, row.id).body).toContain("dedupe");
    await expect(
      transaction(db, (r) =>
        queue.enqueue(
          r,
          { url, body: "different" },
          prefix,
          sha256(prefix + "dedupe"),
        ),
      ),
    ).rejects.toThrow("Conflicting");
    const [claimed] = await Promise.all([queue.claim(), queue.claim()]).then(
      (rows) => rows.filter(Boolean),
    );
    expect(claimed?.id).toBe(jobs[0]);
    await processWebhook(queue, claimed!);
    expect((await state(jobs[0])).status).toBe("sent");
    expect(
      (
        await db.query("SELECT notifiedAt FROM ProjectRequest WHERE id=?", [
          prefix,
        ])
      )[0].notifiedAt,
    ).toBeInstanceOf(Date);
  });
  it("recovers an abandoned reservation and fences the previous owner", async () => {
    const id = await enqueue("abandoned");
    const first = await queue.claim();
    expect(first?.id).toBe(id);
    await db.query(
      "UPDATE WebhookJob SET leaseUntil=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?",
      [id],
    );
    const second = await queue.claim();
    expect(second?.id).toBe(id);
    expect(second?.leaseToken).not.toBe(first?.leaseToken);
    expect(await queue.beginSend(first!)).toBe(false);
    await processWebhook(queue, second!);
    expect((await state(id)).status).toBe("sent");
  });
  it("does not redispatch an abandoned sending job", async () => {
    const id = await enqueue("sending");
    const claimed = await queue.claim();
    await queue.beginSend(claimed!);
    await db.query(
      "UPDATE WebhookJob SET leaseUntil=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?",
      [id],
    );
    expect(await queue.claim()).toBeNull();
    expect((await state(id)).status).toBe("uncertain");
    expect(await queue.finish(claimed!, "sent", null)).toBe(false);
  });
  it("records an ambiguous disconnect or HTTP 5xx without blind retry", async () => {
    for (const label of ["disconnect", "server-error"]) {
      hang = label === "disconnect";
      status = 503;
      const id = await enqueue(label);
      const claimed = await queue.claim();
      await processWebhook(queue, claimed!);
      expect((await state(id)).status).toBe("uncertain");
      expect(await queue.claim()).toBeNull();
    }
    hang = false;
    status = 200;
  });
  it("retries a provable connection refusal and caps attempts", async () => {
    const temporary = createServer();
    temporary.listen(0, "127.0.0.1");
    await once(temporary, "listening");
    const address = temporary.address();
    if (!address || typeof address === "string") throw new Error();
    const closed = "http://127.0.0.1:" + address.port;
    await new Promise<void>((resolve) => temporary.close(() => resolve()));
    const id = await enqueue("refused", closed);
    for (let n = 0; n < 4; n++) {
      await db.query(
        "UPDATE WebhookJob SET availableAt=UTC_TIMESTAMP(3) WHERE id=?",
        [id],
      );
      const claimed = await queue.claim();
      expect(claimed?.id).toBe(id);
      await processWebhook(queue, claimed!);
      expect((await state(id)).status).toBe(n === 3 ? "failed" : "retry");
    }
    expect((await state(id)).attempts).toBe(4);
    expect(await queue.claim()).toBeNull();
  });
  it("requires authenticated ciphertext and atomic business enqueue", async () => {
    const id = await enqueue("corrupt");
    await db.query("UPDATE WebhookJob SET payload='{}' WHERE id=?", [id]);
    await processWebhook(queue, (await queue.claim())!);
    expect((await state(id)).lastError).toBe("payload_invalid");
    expect(bodies).not.toContain(JSON.stringify({ synthetic: "corrupt" }));
  });
});
