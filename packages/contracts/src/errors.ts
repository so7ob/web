/** Additive error contract. Existing HTTP status, code and domain fields remain valid. */
export const ERROR_CATEGORIES = ['validation','authentication','authorization','unavailable','conflict','rate_limit','network','timeout','invalid_response','cancelled','internal'] as const;
export type ErrorCategory = typeof ERROR_CATEGORIES[number];
export interface ErrorEnvelope {
  ok: false;
  code: string;
  category: ErrorCategory;
  messageKey: string;
  requestId?: string;
  errorId?: string;
  errors?: Record<string,string>;
  retryAfterSec?: number;
}
export function errorCategory(status: number, code: string): ErrorCategory {
  if (code === 'cancelled') return 'cancelled';
  if (code === 'timeout') return 'timeout';
  if (code === 'network') return 'network';
  if (code === 'invalid_response') return 'invalid_response';
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 404 || status === 410) return 'unavailable';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limit';
  if (status >= 400 && status < 500) return 'validation';
  return 'internal';
}
export const TRACE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const DIAGNOSTIC_COMPONENTS = ['API','Web','Worker'] as const;
export const DIAGNOSTIC_LEVELS = ['warn','error','fatal'] as const;
export interface DiagnosticEvent {
  at: string;
  level: typeof DIAGNOSTIC_LEVELS[number];
  component: typeof DIAGNOSTIC_COMPONENTS[number];
  event: 'request_failed'|'render_failed'|'worker_failed'|'startup_failed'|'logging_degraded';
  code: string;
  requestId?: string;
  errorId: string;
  operation: string;
  method?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  revision: string;
  fingerprint: string;
  exception: string;
  reason: string;
  frames: string[];
  fields: string[];
}
export interface DiagnosticList {
 ok:true;rows:Array<{fingerprint:string;occurrences:number;firstAt:string;lastAt:string;event:DiagnosticEvent;state:'reviewing'|'resolved';reviewedAt:string|null}>;
 total:number;page:number;pageSize:number;retention:{days:number;rows:number};countScope:'retained_matching_events';
 processLoss?:{persistence:number;fallback:number};
}
