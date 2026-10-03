import type { DataSource } from "typeorm";
import type { AuthUser } from "@so7ob/contracts";
import type { ProjectRequest, RequestClaim } from "../database/models.js";
import {
  AuthFault,
  audit,
  consumeRateLimit,
  newId,
  sha256,
  transaction,
} from "./persistence.js";
import { issueToken, consumeToken, TOKEN_TTL } from "./tokens.js";
import { claimRequestMail } from "./email-templates.js";
import { MailQueue } from "../queue/mail-queue.js";
import { PayloadCipher } from "../queue/crypto.js";
import { insertRecord } from "../business/persistence.js";
class InvalidClaim extends Error {}
export class ClaimService {
  private readonly attempts = new WeakMap<object, { id: string; ip: string }>();
  constructor(
    private readonly db: DataSource,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}
  async reserveAttempt(user: AuthUser, ip: string) {
    const result = await consumeRateLimit(
      this.db,
      "claim:" + user.id + ":" + ip,
      {
        shortMax: 3,
        shortWindowMs: 600000,
        dailyMax: 10,
        dailyWindowMs: 86400000,
      },
    );
    if (!result.allowed)
      throw new AuthFault(429, "rate_limited", {
        retryAfterSec: result.retryAfterSec,
      });
    const permit = {};
    this.attempts.set(permit, { id: user.id, ip });
    return permit;
  }
  async begin(user: AuthUser, rawRef: unknown, ip: string, permit?: object) {
    const reservation = permit ? this.attempts.get(permit) : undefined;
    if (reservation?.id === user.id && reservation.ip === ip)
      this.attempts.delete(permit!);
    else await this.reserveAttempt(user, ip);
    const refCode = String(rawRef ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 30);
    if (!refCode) throw new AuthFault(400, "invalid");
    const generic = { ok: true, message: "claim_sent" };
    return transaction(this.db, async (r) => {
      const [request]: ProjectRequest[] = await r.query(
        "SELECT * FROM ProjectRequest WHERE refCode=? AND clientId IS NULL AND archivedAt IS NULL FOR UPDATE",
        [refCode],
      );
      if (!request) return generic;
      const [account] = await r.query(
        "SELECT id FROM User WHERE id=? AND status<>'suspended' FOR UPDATE",
        [user.id],
      );
      if (!account) return generic;
      const [previous]: RequestClaim[] = await r.query(
        "SELECT * FROM RequestClaim WHERE requestId=? FOR UPDATE",
        [request.id],
      );
      if (previous?.status === "verified") return generic;
      if (previous && previous.userId !== user.id) {
        const live = await r.query(
          "SELECT id FROM AuthToken WHERE userId=? AND type='request_claim' AND resourceId=? AND usedAt IS NULL AND expiresAt>UTC_TIMESTAMP(3)",
          [previous.userId, request.id],
        );
        if (live.length) return generic;
      }
      await r.query(
        "INSERT INTO RequestClaim(id,requestId,userId,status) VALUES(?,?,?,'pending') ON DUPLICATE KEY UPDATE userId=VALUES(userId),status='pending',createdAt=UTC_TIMESTAMP(3),verifiedAt=NULL",
        [newId(), request.id, user.id],
      );
      const token = await issueToken(r, user.id, "request_claim", request.id);
      const url = new URL("/api/account/claim-verify", this.env.SITE_URL);
      url.searchParams.set("token", token.raw);
      url.searchParams.set("ref", refCode);
      const locale = request.locale === "en" ? "en" : "ar";
      const mail = {
        to: request.email,
        ...claimRequestMail(locale, { url: url.href, refCode }),
      };
      const dev =
        this.env.NODE_ENV !== "production" &&
        this.env.EMAIL_DEV_MODE === "true";
      if (dev)
        await insertRecord(r, "EmailLog", {
          id: newId(),
          to: mail.to,
          subject: mail.subject,
          bodyText: "",
          status: "dev_logged",
        });
      else
        await new MailQueue(
          this.db,
          new PayloadCipher(this.env.OUTBOX_KEY),
        ).enqueue(r, mail, sha256("request-claim:" + sha256(token.raw)));
      await audit(
        r,
        "request.claimed",
        user,
        {
          ref: refCode,
          stage: "requested",
          emailStatus: dev ? "dev_logged" : "queued",
        },
        "request",
        request.id,
        ip,
      );
      await insertRecord(r, "Notification", {
        id: newId(),
        userId: user.id,
        type: "account",
        payload: JSON.stringify({ ref: refCode, stage: "claim_requested" }),
      });
      return { ...generic, ...(dev ? { devVerifyUrl: url.href } : {}) };
    });
  }
  async complete(
    user: AuthUser,
    rawToken: string,
    rawRef: string,
  ): Promise<string | null> {
    try {
      return await transaction(this.db, async (r) => {
        const [request]: ProjectRequest[] = await r.query(
          "SELECT * FROM ProjectRequest WHERE refCode=? FOR UPDATE",
          [rawRef.toUpperCase()],
        );
        if (!request) return null;
        const consumed = await consumeToken(r, rawToken, "request_claim", {
          userId: user.id,
          resourceId: request.id,
        });
        if (!consumed) return null;
        const changed = await r.query(
          "UPDATE ProjectRequest SET clientId=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=? AND clientId IS NULL AND archivedAt IS NULL",
          [user.id, request.id],
        );
        const claim = await r.query(
          "UPDATE RequestClaim SET status='verified',verifiedAt=UTC_TIMESTAMP(3) WHERE requestId=? AND userId=? AND status='pending' AND createdAt>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL ? MICROSECOND)",
          [request.id, user.id, TOKEN_TTL.request_claim * 1000],
        );
        if (changed.affectedRows !== 1 || claim.affectedRows !== 1)
          throw new InvalidClaim();
        await insertRecord(r, "RequestMessage", {
          id: newId(),
          requestId: request.id,
          authorType: "system",
          kind: "system",
          body: "claim_linked:" + user.id,
        });
        await audit(
          r,
          "request.claimed",
          user,
          { ref: request.refCode, stage: "verified" },
          "request",
          request.id,
        );
        return request.refCode;
      });
    } catch (error) {
      if (error instanceof InvalidClaim) return null;
      throw error;
    }
  }
}
