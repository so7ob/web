import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import type { DataSource, QueryRunner } from "typeorm";
import { transaction, newId } from "../auth/persistence.js";
import { QueueError } from "./crypto.js";
export interface WebhookInput {
  url: string;
  body: string;
}
export interface ClaimedWebhook {
  id: string;
  payload: string;
  requestId: string | null;
  leaseToken: string;
  attempts: number;
  maxAttempts: number;
}
export class WebhookCipher {
  private readonly key: Buffer;
  constructor(secret = process.env.OUTBOX_KEY) {
    if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret))
      throw new QueueError("Independent OUTBOX_KEY required");
    this.key = Buffer.from(secret, "hex");
  }
  private serialize(input: WebhookInput) {
    const url = new URL(input.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      typeof input.body !== "string" ||
      input.body.length > 200000
    )
      throw new QueueError("Invalid webhook payload");
    return JSON.stringify({ url: input.url, body: input.body });
  }
  digest(input: WebhookInput) {
    return createHmac("sha256", this.key)
      .update(this.serialize(input))
      .digest("hex");
  }
  encrypt(input: WebhookInput, id: string) {
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from("so7ob-webhook:v1:" + id));
    const body = Buffer.concat([
      cipher.update(this.serialize(input), "utf8"),
      cipher.final(),
    ]);
    return JSON.stringify({
      v: 1,
      nonce: nonce.toString("base64"),
      body: body.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    });
  }
  decrypt(payload: string, id: string): WebhookInput {
    try {
      const p = JSON.parse(payload);
      if (p.v !== 1) throw new Error();
      const cipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(p.nonce, "base64"),
      );
      cipher.setAAD(Buffer.from("so7ob-webhook:v1:" + id));
      cipher.setAuthTag(Buffer.from(p.tag, "base64"));
      const input = JSON.parse(
        Buffer.concat([
          cipher.update(Buffer.from(p.body, "base64")),
          cipher.final(),
        ]).toString("utf8"),
      );
      this.serialize(input);
      return input;
    } catch {
      throw new QueueError("Webhook payload authentication failed");
    }
  }
}
export class WebhookQueue {
  constructor(
    private readonly db: DataSource,
    readonly cipher = new WebhookCipher(),
    readonly leaseMs = 60000,
  ) {
    if (leaseMs < 100) throw new QueueError("Invalid webhook lease");
  }
  async enqueue(
    r: QueryRunner,
    input: WebhookInput,
    requestId: string,
    key: string,
  ) {
    if (!r.isTransactionActive || !/^[a-f0-9]{64}$/.test(key))
      throw new QueueError("Transactional enqueue and hashed key required");
    const id = newId(),
      digest = this.cipher.digest(input);
    await r.query(
      "INSERT INTO WebhookJob(id,dedupeKey,payload,payloadDigest,requestId) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id",
      [id, key, this.cipher.encrypt(input, id), digest, requestId],
    );
    const [job] = await r.query(
      "SELECT id,payloadDigest,requestId FROM WebhookJob WHERE dedupeKey=? FOR UPDATE",
      [key],
    );
    if (job.payloadDigest !== digest || job.requestId !== requestId)
      throw new QueueError("Conflicting webhook deduplication key");
    return job.id as string;
  }
  async claim(): Promise<ClaimedWebhook | null> {
    return transaction(this.db, async (r) => {
      await r.query(
        "UPDATE WebhookJob SET status='uncertain',lastError='worker_lost_after_dispatch',leaseToken=NULL,leaseUntil=NULL,updatedAt=UTC_TIMESTAMP(3) WHERE status='sending' AND leaseUntil<=UTC_TIMESTAMP(3)",
      );
      await r.query(
        "UPDATE WebhookJob SET status=IF(attempts>=maxAttempts,'failed','retry'),lastError='worker_lost_before_dispatch',leaseToken=NULL,leaseUntil=NULL,availableAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE status='leased' AND leaseUntil<=UTC_TIMESTAMP(3)",
      );
      const [row] = await r.query(
        "SELECT id,payload,requestId,attempts,maxAttempts FROM WebhookJob WHERE status IN ('queued','retry') AND availableAt<=UTC_TIMESTAMP(3) AND attempts<maxAttempts ORDER BY availableAt,createdAt,id LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      if (!row) return null;
      const job = {
        ...row,
        attempts: row.attempts + 1,
        leaseToken: randomBytes(32).toString("hex"),
      };
      await r.query(
        "UPDATE WebhookJob SET status='leased',attempts=attempts+1,leaseToken=?,leaseUntil=TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3)),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
        [job.leaseToken, this.leaseMs * 1000, job.id],
      );
      return job;
    });
  }
  async heartbeat(job: ClaimedWebhook) {
    const result = await this.db.query(
      "UPDATE WebhookJob SET leaseUntil=TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3)) WHERE id=? AND leaseToken=? AND status IN ('leased','sending') AND leaseUntil>UTC_TIMESTAMP(3)",
      [this.leaseMs * 1000, job.id, job.leaseToken],
    );
    return result.affectedRows === 1;
  }
  async beginSend(job: ClaimedWebhook) {
    const result = await this.db.query(
      "UPDATE WebhookJob SET status='sending',updatedAt=UTC_TIMESTAMP(3) WHERE id=? AND leaseToken=? AND status='leased' AND leaseUntil>UTC_TIMESTAMP(3)",
      [job.id, job.leaseToken],
    );
    return result.affectedRows === 1;
  }
  async finish(
    job: ClaimedWebhook,
    outcome: "sent" | "retry" | "failed" | "uncertain",
    code: string | null,
  ) {
    if (code !== null && !/^[a-z0-9_]{1,80}$/.test(code))
      throw new QueueError("Only redacted errors allowed");
    const status =
      outcome === "retry" && job.attempts >= job.maxAttempts
        ? "failed"
        : outcome;
    return transaction(this.db, async (r) => {
      const result = await r.query(
        "UPDATE WebhookJob SET status=?,lastError=?,leaseToken=NULL,leaseUntil=NULL,availableAt=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)),updatedAt=UTC_TIMESTAMP(3) WHERE id=? AND leaseToken=? AND status IN ('leased','sending') AND (?<>'sent' OR status='sending') AND leaseUntil>UTC_TIMESTAMP(3)",
        [
          status,
          code,
          Math.min(3600, 30 * 2 ** (job.attempts - 1)),
          job.id,
          job.leaseToken,
          status,
        ],
      );
      if (result.affectedRows !== 1) return false;
      if (status === "sent" && job.requestId)
        await r.query(
          "UPDATE ProjectRequest SET notifiedAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
          [job.requestId],
        );
      return true;
    });
  }
}
export async function processWebhook(
  queue: WebhookQueue,
  job: ClaimedWebhook,
): Promise<void> {
  let input: WebhookInput;
  try {
    input = queue.cipher.decrypt(job.payload, job.id);
  } catch {
    await queue.finish(job, "failed", "payload_invalid");
    return;
  }
  if (!(await queue.beginSend(job))) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let pending = Promise.resolve();
  let lost = false;
  const interval = setInterval(
    () => {
      pending = pending
        .then(async () => {
          if (!(await queue.heartbeat(job))) {
            lost = true;
            controller.abort();
          }
        })
        .catch(() => {
          lost = true;
          controller.abort();
        });
    },
    Math.max(50, Math.floor(queue.leaseMs / 3)),
  );
  let outcome: "sent" | "failed" | "retry" | "uncertain" = "uncertain";
  let code: string | null = "http_ambiguous";
  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: input.body,
      signal: controller.signal,
      redirect: "error",
    });
    await response.body?.cancel();
    if (response.ok) {
      outcome = "sent";
      code = null;
    } else {
      outcome =
        response.status >= 500 || response.status === 429
          ? "uncertain"
          : "failed";
      code = "http_" + response.status;
    }
  } catch (error) {
    const cause =
      error && typeof error === "object" && "cause" in error
        ? error.cause
        : null;
    const errorCode =
      cause && typeof cause === "object" && "code" in cause ? cause.code : null;
    if (
      ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(String(errorCode))
    ) {
      outcome = "retry";
      code = "connection_before_dispatch";
    }
  } finally {
    clearTimeout(timeout);
    clearInterval(interval);
    await pending;
  }
  // A DB failure after acceptance must not be reclassified as a transport failure.
  if (!lost) await queue.finish(job, outcome, code);
}
