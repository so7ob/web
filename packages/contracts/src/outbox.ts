/** Public operational metadata only. Never add mail payloads or provider responses. */
export const OUTBOX_STATUSES = ['queued','retry','leased','sending','sent','failed','uncertain','dev_logged','unknown'] as const;
export type OutboxStatus = typeof OUTBOX_STATUSES[number];
export interface OutboxEmail {
  id: string; to: string; subject: string; status: OutboxStatus; createdAt: string;
  bodyText: ''; bodyHtml: null; error: null;
  attempts: number | null; nextAttemptAt: string | null; errorCode: string | null;
}
export interface OutboxResponse {
  ok: boolean; emails: OutboxEmail[]; total: number; page: number; pageSize: number;
}
