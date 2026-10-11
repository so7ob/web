import { AsyncLocalStorage } from "node:async_hooks";
export interface AuditContext {
  correlationId?: string;
  errorId?: string;
  source: "api" | "worker" | "system";
}
export const auditContext = new AsyncLocalStorage<AuditContext>();
export const auditWriterHealth = {
  failures: 0,
  lastFailureAt: null as string | null,
};
