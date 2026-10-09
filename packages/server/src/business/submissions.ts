import { TrackService } from "../track/service.js";
import { randomInt } from "node:crypto";
import type { DataSource } from "typeorm";
import {
  validateProjectRequest,
  isBotLike,
  type AuthUser,
  type ProjectRequestInput,
} from "@so7ob/contracts";
import {
  AuthFault,
  audit,
  consumeRateLimit,
  newId,
  sha256,
  transaction,
} from "../auth/persistence.js";
import { fingerprint } from "../auth/rate-policy.js";
import { MailQueue } from "../queue/mail-queue.js";
import { PayloadCipher } from "../queue/crypto.js";
import { WebhookQueue, WebhookCipher } from "../queue/webhook.js";
import { newRequestStaffMail } from "../auth/email-templates.js";
import { insertRecord, lockOperation, notifyStaff } from "./persistence.js";
const refCode = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase().slice(-5)}${randomInt(
    36 ** 3,
  )
    .toString(36)
    .toUpperCase()
    .padStart(3, "0")}`;
export interface InquiryInput {
  subject?: unknown;
  message?: unknown;
  name?: unknown;
  email?: unknown;
  category?: unknown;
  locale?: unknown;
}
export class SubmissionService {
  constructor(
    private readonly db: DataSource,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}
  async request(
    raw: unknown,
    actor: AuthUser | null,
    ip: string,
    userAgent: string,
  ) {
    const parsed = validateProjectRequest(raw);
    if (!parsed.ok)
      throw new AuthFault(400, "invalid", { errors: parsed.errors });
    const data = parsed.data;
    if (isBotLike(data)) throw new AuthFault(400, "invalid");
    const ipHash = ip === "unknown" ? null : fingerprint("ip:" + ip);
    const rate = await consumeRateLimit(
      this.db,
      "request:" + (ipHash ?? "unknown"),
    );
    if (!rate.allowed)
      throw new AuthFault(429, "rate_limited", {
        retryAfterSec: rate.retryAfterSec,
      });
    // Source stores the submitted contact name/email even for signed-in users; ownership alone comes from the session.
    const email = data.email.trim().toLowerCase(),
      name = data.name,
      hash = fingerprint(data.description);
    const result = await transaction(this.db, async (r) => {
      await lockOperation(r, "request-duplicate:" + email + ":" + hash);
      const recent = await r.query(
        "SELECT id FROM ProjectRequest WHERE email=? AND descriptionHash=? AND createdAt>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE) LIMIT 1",
        [email, hash],
      );
      if (recent.length) throw new AuthFault(409, "duplicate");
      const id = newId(),
        code = refCode("S7");
      await insertRecord(r, "ProjectRequest", {
        id,
        refCode: code,
        clientId: actor?.id ?? null,
        requestType: data.requestType,
        serviceType: data.serviceType,
        description: data.description,
        budget: data.budget,
        currency: data.currency || null,
        timeline: data.timeline,
        name,
        company: data.company || null,
        email,
        phone: data.phone || null,
        preferredContact: data.preferredContact,
        referenceUrl: data.referenceUrl || null,
        locale: data.locale,
        clientIpHash: ipHash,
        userAgent: userAgent.slice(0, 200) || null,
        descriptionHash: hash,
      });
      await audit(
        r,
        "request.submitted",
        actor,
        { ref: code, authenticated: !!actor },
        "request",
        code,
        ip === "unknown" ? undefined : ip,
      );
      if (!actor)
        await r.query(
          "UPDATE AuditLog SET actorEmail=? WHERE entityType=? AND entityId=? AND action=?",
          [email, "request", code, "request.submitted"],
        );
      const staff = await notifyStaff(
        r,
        "new_request",
        { ref: code, name: actor?.name ?? name },
        "/ar/admin/requests/" + id,
      );
      const queue = new MailQueue(
        this.db,
        new PayloadCipher(this.env.OUTBOX_KEY),
      );
      for (const user of staff) {
        const mail = {
          to: user.email,
          ...newRequestStaffMail(user.locale, {
            refCode: code,
            name: actor?.name ?? name,
          }),
        };
        if (
          this.env.NODE_ENV !== "production" &&
          this.env.EMAIL_DEV_MODE === "true"
        )
          await insertRecord(r, "EmailLog", {
            id: newId(),
            to: mail.to,
            subject: mail.subject,
            bodyText: "",
            status: "dev_logged",
          });
        else
          await queue.enqueue(
            r,
            mail,
            sha256("request:" + id + ":staff:" + user.id),
          );
      }
      if (this.env.NOTIFY_WEBHOOK_URL) {
        const payload = notifyPayload({ ...data, email, name }, code);
        await new WebhookQueue(
          this.db,
          new WebhookCipher(this.env.OUTBOX_KEY),
        ).enqueue(
          r,
          {
            url: this.env.NOTIFY_WEBHOOK_URL,
            body: JSON.stringify({
              text: `طلب جديد ${code} — ${payload.serviceType} — ${payload.email}`,
              payload,
            }),
          },
          id,
          sha256("request-webhook:" + id),
        );
      }
      return { ok: true, ref: code, id };
    });
    return {ok:result.ok,ref:result.ref,trackUrl:await this.followup("request",result.id,data.locale,actor)};
  }
  async inquiry(
    raw: InquiryInput,
    actor: AuthUser | null,
    ip: string,
    portal = false,
  ): Promise<{ok:boolean;ref:string;id?:string;trackUrl?:string|null}> {
    if (portal) {
      if (!actor) throw new AuthFault(401, "unauthorized");
      raw = { ...raw, name: actor.name, email: actor.email };
    }
    const subject = String(raw.subject ?? "")
        .trim()
        .slice(0, 200),
      message = String(raw.message ?? "")
        .trim()
        .slice(0, 5000),
      name = String(raw.name ?? actor?.name ?? "")
        .trim()
        .slice(0, 100),
      email = String(raw.email ?? actor?.email ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 200);
    const category = [
        "general",
        "services",
        "pricing",
        "support",
        "other",
      ].includes(String(raw.category))
        ? String(raw.category)
        : "general",
      locale = raw.locale === "en" ? "en" : "ar";
    const errors: Record<string, string> = {};
    if (subject.length < 3) errors.subject = "required";
    if (message.length < 10) errors.message = "required";
    if (name.length < 2) errors.name = "required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
      errors.email = "invalidEmail";
    if (Object.keys(errors).length)
      throw new AuthFault(400, "invalid", { errors });
    const rate = await consumeRateLimit(
      this.db,
      portal ? "account-inquiry:" + actor!.id : "inquiry:" + ip,
    );
    if (!rate.allowed)
      throw new AuthFault(429, "rate_limited", {
        retryAfterSec: rate.retryAfterSec,
      });
    const result = await transaction(this.db, async (r) => {
      const id = newId(),
        code = refCode("IQ");
      await insertRecord(r, "Inquiry", {
        id,
        refCode: code,
        subject,
        status: "new",
        category,
        locale,
        name,
        email,
        clientId: actor?.id ?? null,
      });
      await insertRecord(r, "InquiryMessage", {
        id: newId(),
        inquiryId: id,
        authorId: actor?.id ?? null,
        authorType: "client",
        kind: "message",
        body: message,
      });
      await audit(
        r,
        "inquiry.submitted",
        actor,
        { ref: code, ...(portal ? { via: "portal" } : {}) },
        "inquiry",
        id,
        portal ? undefined : ip,
      );
      if (!actor)
        await r.query(
          "UPDATE AuditLog SET actorEmail=? WHERE entityType=? AND entityId=?",
          [email, "inquiry", id],
        );
      await notifyStaff(
        r,
        "new_inquiry",
        { ref: code, subject },
        `/${locale}/admin/inquiries`,
      );
      return { ok: true, ref: code, id };
    });
    return {ok:result.ok,ref:result.ref,...(portal ? {id:result.id} : {trackUrl:await this.followup("inquiry",result.id,locale,actor)})};
  }
  private async followup(scope:"request"|"inquiry",id:string,locale:string,actor:AuthUser|null):Promise<string|null> {
    try {
      if(!this.env.SITE_URL) return null;
      const service=new TrackService(this.db,new MailQueue(this.db,new PayloadCipher(this.env.OUTBOX_KEY)),this.env.SITE_URL);
      const link=await service.issue(scope,id,actor);
      return `/${locale === "en" ? "en" : "ar"}/track?t=${encodeURIComponent(link.token)}`;
    } catch { process.stderr.write("track_issue_deferred: unavailable\n"); return null; }
  }
}
function notifyPayload(data: ProjectRequestInput, code: string) {
  return {
    refCode: code,
    requestType: data.requestType,
    serviceType: data.serviceType,
    name: data.name,
    company: data.company || undefined,
    email: data.email,
    phone: data.phone || undefined,
    budget: data.budget,
    currency: data.currency || undefined,
    timeline: data.timeline,
    locale: data.locale,
    descriptionPreview: data.description.slice(0, 280),
  };
}
