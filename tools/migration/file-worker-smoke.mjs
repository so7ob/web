// Compiled worker acceptance: real isolated MariaDB and an independently stored synthetic file.
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import {
  createDataSource,
  assertSchema,
  FileCleanupQueue,
  transaction,
} from "@so7ob/server";
if (!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? ""))
  throw new Error("Isolated test database required");
const db = await createDataSource().initialize();
await assertSchema(db);
const root = await mkdtemp(join(tmpdir(), "so7ob-file-worker-")),
  storedName = randomBytes(16).toString("hex") + ".pdf";
const children = new Set();
async function worker() {
  const child = spawn(
    process.execPath,
    ["apps/worker/dist/main.js", "--once"],
    {
      env: {
        ...process.env,
        DATA_DIR: root,
        NODE_ENV: "test",
        OUTBOX_KEY: randomBytes(32).toString("hex"),
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "9",
        SMTP_FROM: "synthetic@example.invalid",
        SMTP_ALLOW_INSECURE_LOCAL: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.add(child);
  child.stdout.resume();
  child.stderr.resume();
  const [exit] = await once(child, "exit");
  children.delete(child);
  assert.equal(exit, 0);
}
try {
  await mkdir(join(root, "uploads"), { mode: 0o700 });
  await writeFile(
    join(root, "uploads", storedName),
    "%PDF-1.4\nSynthetic worker cleanup\n",
  );
  await transaction(db, (r) => new FileCleanupQueue(db).enqueue(r, storedName));
  await db.query(
    "UPDATE FileCleanupJob SET status='leased',attempts=1,leaseToken=?,leaseUntil=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE storedName=?",
    ["a".repeat(64), storedName],
  );
  await worker();
  await assert.rejects(readFile(join(root, "uploads", storedName)), {
    code: "ENOENT",
  });
  assert.deepEqual(
    (
      await db.query(
        "SELECT status,attempts FROM FileCleanupJob WHERE storedName=?",
        [storedName],
      )
    )[0],
    { status: "done", attempts: 2 },
  );
  await worker();
  assert.equal(
    (
      await db.query("SELECT attempts FROM FileCleanupJob WHERE storedName=?", [
        storedName,
      ])
    )[0].attempts,
    2,
  );
  console.log(
    JSON.stringify({
      test: "compiled file cleanup worker",
      database: "real MariaDB",
      abandonedLeaseRecovered: true,
      actualBytesRemoved: true,
      restartIdempotent: true,
      passed: true,
    }),
  );
} finally {
  for (const child of children) child.kill("SIGTERM");
  await db.query("DELETE FROM FileCleanupJob WHERE storedName=?", [storedName]);
  await db.destroy();
  await rm(root, { recursive: true, force: true });
}
