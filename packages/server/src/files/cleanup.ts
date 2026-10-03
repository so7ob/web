import { randomBytes } from "node:crypto";
import type { DataSource, QueryRunner } from "typeorm";
import { newId, transaction } from "../auth/persistence.js";
import { FileStore } from "./storage.js";
export class FileCleanupQueue {
  constructor(
    private readonly db: DataSource,
    private readonly files = new FileStore(),
  ) {}
  async enqueue(r: QueryRunner, storedName: string) {
    if (!r.isTransactionActive)
      throw new Error("File cleanup requires a business transaction");
    await r.query(
      "INSERT INTO FileCleanupJob(id,storedName) VALUES(?,?) ON DUPLICATE KEY UPDATE availableAt=IF(status='blocked',UTC_TIMESTAMP(3),availableAt),attempts=IF(status='blocked',0,attempts),lastError=IF(status='blocked',NULL,lastError),status=IF(status='blocked','queued',status)",
      [newId(), storedName],
    );
  }
  async processOne(): Promise<boolean> {
    const job = await transaction(this.db, async (r) => {
      await r.query(
        "UPDATE FileCleanupJob SET status=IF(attempts>=8,'failed','queued'),leaseToken=NULL,leaseUntil=NULL,lastError='worker_lost',updatedAt=UTC_TIMESTAMP(3) WHERE status='leased' AND leaseUntil<=UTC_TIMESTAMP(3)",
      );
      const [row] = await r.query(
        "SELECT id,storedName,attempts FROM FileCleanupJob WHERE status='queued' AND availableAt<=UTC_TIMESTAMP(3) AND attempts<8 ORDER BY availableAt,createdAt LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      if (!row) return null;
      const token = randomBytes(32).toString("hex");
      await r.query(
        "UPDATE FileCleanupJob SET status='leased',attempts=attempts+1,leaseToken=?,leaseUntil=TIMESTAMPADD(SECOND,60,UTC_TIMESTAMP(3)),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
        [token, row.id],
      );
      return { ...row, leaseToken: token, attempts: row.attempts + 1 };
    });
    if (!job) return false;
    await transaction(this.db, async (r) => {
      const [owned] = await r.query(
        "SELECT id FROM FileCleanupJob WHERE id=? AND leaseToken=? AND status='leased' AND leaseUntil>UTC_TIMESTAMP(3) FOR UPDATE",
        [job.id, job.leaseToken],
      );
      if (!owned) return;
      // Locking reads wait for an in-flight metadata commit whose acknowledgement was lost.
      // A snapshot read could mistake an uncommitted upload for an orphan and delete its bytes.
      const media = await r.query(
        "SELECT id FROM MediaItem WHERE storedName=? FOR UPDATE",
        [job.storedName],
      );
      const attachments = await r.query(
        "SELECT id FROM Attachment WHERE storedName=? FOR UPDATE",
        [job.storedName],
      );
      let status = "done",
        error: string | null = null;
      if (media.length || attachments.length) {
        status = "blocked";
        error = "file_still_referenced";
      } else
        try {
          await this.files.remove(job.storedName);
        } catch {
          status = job.attempts >= 8 ? "failed" : "queued";
          error = "file_delete_failed";
        }
      // Unlink is idempotent; a crash after deletion safely completes on retry (ENOENT).
      await r.query(
        "UPDATE FileCleanupJob SET status=?,lastError=?,leaseToken=NULL,leaseUntil=NULL,availableAt=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)),updatedAt=UTC_TIMESTAMP(3) WHERE id=? AND leaseToken=?",
        [
          status,
          error,
          Math.min(3600, 30 * 2 ** (job.attempts - 1)),
          job.id,
          job.leaseToken,
        ],
      );
    });
    return true;
  }
}
