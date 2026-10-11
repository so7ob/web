import type { AuditFilter, AuditEventV1 } from "./index.js";
/** JSON transport projections; storage entities and private file paths are never public contracts. */
export interface AuditReport {
  id: string;
  status: string;
  format: string;
  eventCount: number | null;
  resourceCount: number | null;
  createdAt: string;
  expiresAt: string | null;
  errorCode: string | null;
  checksum: string | null;
}
export interface AuditReviewCase {
  id: string;
  title: string;
  ownerId: string;
  state: string;
  held: boolean;
  revision: number;
  eventCount: number;
  closureReason: string | null;
}
export interface AuditRule {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  thresholdValue: number;
  windowSeconds: number;
  cooldownSeconds: number;
  severity: string;
  rationale: string;
  scope: string;
  revision: number;
}
export interface AuditAlert {
  id: string;
  name: string;
  ruleId: string;
  severity: string;
  reason: string;
  createdAt: string;
}
export interface AuditHealth {
  status: string;
  probes: {
    component: string;
    status: string;
    checkedAt: string;
    failures: number;
  }[];
  queues: { status: string; count: number; oldestSeconds: number }[];
  lastBusinessEventAt: string | null;
}
export interface AuditCaseDetail {
  case: AuditReviewCase;
  events: { eventId: string }[];
  history: {
    id: string;
    actorName: string;
    kind: string;
    body: string;
    createdAt: string;
  }[];
}

export interface AuditPreference { timezone: string; density: string; columns: string[] }
export interface AuditSavedView { id: string; name: string; filters: AuditFilter; createdAt?: string }
export interface AuditReportRequest { format: 'csv' | 'json' | 'html'; scope: 'page' | 'selected' | 'all'; locale: 'ar' | 'en'; timezone: string; filters: AuditFilter }
export interface AuditCaseRequest { title: string; ownerId: string; eventIds: string[] }
export interface AuditCaseUpdate { revision: number; state?: 'new' | 'reviewing' | 'closed'; note?: string; closureReason?: string; held?: boolean; ownerId?: string }
export type AuditRuleUpdate = Pick<AuditRule, 'revision' | 'enabled' | 'thresholdValue' | 'windowSeconds' | 'cooldownSeconds' | 'severity' | 'rationale' | 'scope'>;
export interface AuditPolicy { retentionDays: number | null; revision: number }
export interface AuditRelatedResponse { ok: true; rows: AuditEventV1[]; nextCursor: string | null }
export interface AuditDetailResponse { ok: true; event: AuditEventV1 }
export interface AuditReportManifest { reference: string; createdAt: string; snapshotAt: string; timezone: string; source: string; scope: string; filters: AuditFilter; eventCount: number; resourceCount: number; locale: 'ar' | 'en'; schemaVersion: number; eventIds: string[]; bytes: number; checksum: string; checksumAlgorithm: 'sha256'; integrityClaim: string }
