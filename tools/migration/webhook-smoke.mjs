import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  createDataSource,
  assertSchema,
  WebhookQueue,
  WebhookCipher,
  transaction,
  sha256,
} from "@so7ob/server";
if (!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? ""))
  throw new Error("Compiled worker test requires isolated MariaDB");
const db = await createDataSource().initialize();
await assertSchema(db);
const prefix = "webhookprocess" + randomBytes(7).toString("hex"),
  key = randomBytes(32).toString("hex"),
  queue = new WebhookQueue(db, new WebhookCipher(key));
const ids = [];
let child;
let hold = false;
let count = 0;
let received;
const server = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    count++;
    received?.();
    if (!hold) {
      res.writeHead(200);
      res.end("accepted");
    }
  });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = "http://127.0.0.1:" + server.address().port;
async function enqueue(label) {
  const id = await transaction(db, (r) =>
    queue.enqueue(
      r,
      { url, body: JSON.stringify({ label }) },
      prefix,
      sha256(prefix + label),
    ),
  );
  ids.push(id);
  return id;
}
function worker() {
  child = spawn(process.execPath, ["apps/worker/dist/main.js", "--once"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      OUTBOX_KEY: key,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "2525",
      SMTP_FROM: "synthetic@example.invalid",
      SMTP_ALLOW_INSECURE_LOCAL: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.resume();
  child.stderr.resume();
  return child;
}
async function completed(process) {
  const result = await Promise.race([
    once(process, "exit"),
    delay(15000).then(() => {
      process.kill("SIGKILL");
      throw new Error("Worker test deadline");
    }),
  ]);
  assert.equal(result[0], 0);
}
try {
  for (const table of ["MailJob", "WebhookJob"])
    assert.equal(
      Number(
        (
          await db.query(
            `SELECT COUNT(*) n FROM ${table} WHERE status IN ('queued','retry','leased','sending')`,
          )
        )[0].n,
      ),
      0,
      "Refuse to consume unrelated jobs",
    );
  await db.query(
    "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      prefix,
      prefix,
      "quote",
      "web",
      "Synthetic process request",
      sha256(prefix),
      "unspecified",
      "flexible",
      "Synthetic",
      prefix + "@example.invalid",
      "email",
      "en",
    ],
  );
  const delivered = await enqueue("normal");
  await completed(worker());
  assert.equal(
    (await db.query("SELECT status FROM WebhookJob WHERE id=?", [delivered]))[0]
      .status,
    "sent",
  );
  assert.equal(count, 1);
  hold = true;
  const ambiguous = await enqueue("crash");
  const dispatched = new Promise((resolve) => {
    received = resolve;
  });
  const running = worker();
  await Promise.race([
    dispatched,
    delay(10000).then(() => {
      throw new Error("No webhook dispatch");
    }),
  ]);
  const exited = once(running, "exit");
  running.kill("SIGKILL");
  await exited;
  received = undefined;
  hold = false;
  await db.query(
    "UPDATE WebhookJob SET leaseUntil=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?",
    [ambiguous],
  );
  await completed(worker());
  assert.equal(
    (await db.query("SELECT status FROM WebhookJob WHERE id=?", [ambiguous]))[0]
      .status,
    "uncertain",
  );
  assert.equal(count, 2, "Restart must not send the ambiguous job again");
  process.stdout.write(
    JSON.stringify({
      test: "compiled worker webhook dispatch and SIGKILL recovery",
      passed: true,
      actualHttpDeliveries: count,
      ambiguousResends: 0,
    }) + "\n",
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  for (const id of ids)
    await db.query("DELETE FROM WebhookJob WHERE id=?", [id]);
  await db.query("DELETE FROM ProjectRequest WHERE id=?", [prefix]);
  await db.destroy();
}
