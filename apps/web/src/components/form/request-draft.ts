import { BUDGET_TIERS, CONTACT_METHODS, CURRENCIES, LIMITS, REQUEST_TYPES, SERVICE_TYPES, TIMELINES, type ProjectRequestInput } from '@/lib/validation';
export const REQUEST_DRAFT_KEY = 'so7ob-request-session-draft-v1';
export const REQUEST_DRAFT_TTL = 30 * 60 * 1000;
export type RequestDraft = Partial<Omit<ProjectRequestInput, 'website' | 'locale' | 'startedAt'>>;
type Envelope = { owner: string; expiresAt: number; values: RequestDraft };
let memory: Envelope | null = null;
const enums = { requestType: REQUEST_TYPES, serviceType: SERVICE_TYPES, budget: BUDGET_TIERS, currency: ['', ...CURRENCIES], timeline: TIMELINES, preferredContact: CONTACT_METHODS };
const texts = { description: LIMITS.descriptionMax, name: LIMITS.nameMax, company: LIMITS.textMax, email: LIMITS.emailMax, phone: LIMITS.textMax, referenceUrl: LIMITS.urlMax };
/** Incomplete text is valid as a draft; unknown fields, objects and invalid option IDs are not. */
export function sanitizeRequestDraft(raw: unknown): RequestDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>, values: Record<string, string> = {};
  for (const [key, options] of Object.entries(enums)) if (typeof input[key] === 'string' && (options as readonly string[]).includes(input[key])) values[key] = input[key];
  for (const [key, max] of Object.entries(texts)) if (typeof input[key] === 'string') values[key] = input[key].slice(0, max);
  return values;
}
function valid(value: Envelope | null, owner: string): value is Envelope {
  return !!value && value.owner === owner && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() && value.expiresAt <= Date.now() + REQUEST_DRAFT_TTL;
}
/** Clear the previous identity even when the next route contains no public form. */
export function scopeRequestDraft(owner: string): void {
  if (memory?.owner !== owner) memory = null;
  try {
    const raw = sessionStorage.getItem(REQUEST_DRAFT_KEY);
    if (raw && (raw.length > 20000 || (JSON.parse(raw) as Envelope)?.owner !== owner)) sessionStorage.removeItem(REQUEST_DRAFT_KEY);
  } catch { /* Blocked/corrupt storage cannot be adopted by another owner. */ }
}
export function readRequestDraft(owner: string): { values: RequestDraft; available: boolean } {
  // Mounted/tab-memory input remains current; expiry limits recovery from storage after reload.
  if (memory?.owner !== owner) memory = null;
  try {
    const raw = sessionStorage.getItem(REQUEST_DRAFT_KEY);
    if (!memory && raw && raw.length <= 20000) {
      let stored: Envelope | null = null;
      try { stored = JSON.parse(raw) as Envelope; } catch { /* Ignore corrupt recovery data. */ }
      if (valid(stored, owner)) memory = { owner, expiresAt: stored.expiresAt, values: sanitizeRequestDraft(stored.values) };
    }
    if (!memory && raw) sessionStorage.removeItem(REQUEST_DRAFT_KEY);
    return { values: memory ? { ...memory.values } : {}, available: true };
  } catch { return { values: memory ? { ...memory.values } : {}, available: false }; }
}
export function writeRequestDraft(owner: string, values: unknown): boolean {
  memory = { owner, expiresAt: Date.now() + REQUEST_DRAFT_TTL, values: sanitizeRequestDraft(values) };
  try {
    const serialized = JSON.stringify(memory);
    sessionStorage.setItem(REQUEST_DRAFT_KEY, serialized);
    if (sessionStorage.getItem(REQUEST_DRAFT_KEY) !== serialized) throw new Error('Draft storage unavailable');
    return true;
  } catch { try { sessionStorage.removeItem(REQUEST_DRAFT_KEY); } catch { /* Blocked storage. */ } return false; }
}
export function clearRequestDraft(owner: string, submitted?: unknown): void {
  const matches = (values: unknown) => submitted === undefined || JSON.stringify(sanitizeRequestDraft(values)) === JSON.stringify(sanitizeRequestDraft(submitted));
  if (memory?.owner === owner && matches(memory.values)) memory = null;
  try {
    const raw = sessionStorage.getItem(REQUEST_DRAFT_KEY);
    if (raw) { const stored = JSON.parse(raw) as Envelope; if (stored.owner === owner && matches(stored.values)) sessionStorage.removeItem(REQUEST_DRAFT_KEY); }
  } catch { /* Storage can be blocked; the in-memory draft was still cleared. */ }
}

/** Explicit sign-out discards the tab draft regardless of its previous owner. */
export function forgetRequestDraft(): void {
  memory = null;
  try { sessionStorage.removeItem(REQUEST_DRAFT_KEY); } catch { /* Memory is still cleared. */ }
}
