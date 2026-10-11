import {
  AUDIT_CATALOG,
  type AuditValue,
  type AuditChange,
} from "@so7ob/contracts";
const privateFields = new Set([
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "secret",
  "authorization",
  "cookie",
  "content",
  "description",
  "referenceUrl",
  "phone",
  "email",
  "body",
  "note",
  "resolutionNote",
  "url",
]);
const nested = new Set([
  "id",
  "labelAr",
  "labelEn",
  "pageSlug",
  "enabled",
  "order",
  "ar",
  "en",
  "status",
  "priority",
  "name",
  "value",
]);
export const catalog = (action: string) =>
  Object.hasOwn(AUDIT_CATALOG, action) ? AUDIT_CATALOG[action] : undefined;
export function text(value: unknown, max = 255): string | null {
  return typeof value === "string"
    ? value.replace(/\p{Cc}/gu, "").slice(0, max)
    : null;
}
export function parse(value: unknown): Record<string, unknown> | null {
  try {
    const result = typeof value === "string" ? JSON.parse(value) : value;
    return result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
export function safeContext(
  action: string,
  raw: unknown,
): Record<string, unknown> {
  const data = parse(raw),
    entry = catalog(action);
  if (!data || !entry) return {};
  const out: Record<string, unknown> = {};
  for (const key of entry.context) {
    if (!Object.hasOwn(data, key)) continue;
    const value = data[key];
    if (
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      out[key] = value;
    else if (typeof value === "string" && key !== "reason")
      out[key] = text(value, 180);
    else if (
      key === "reason" &&
      typeof value === "string" &&
      /^[a-z_]{1,64}$/.test(value)
    )
      out[key] = value;
    else if (Array.isArray(value))
      out[key] = value
        .slice(0, 100)
        .filter((v) => typeof v === "string")
        .map((v) => text(v, 80));
  }
  return out;
}
function valueAt(
  value: unknown,
  present: boolean,
  redact: boolean,
): AuditValue {
  if (!present) return { state: "missing" };
  if (redact) return { state: "redacted" };
  if (value === null) return { state: "null" };
  if (value === "" || (Array.isArray(value) && value.length === 0))
    return { state: "empty" };
  if (value instanceof Date)
    return { state: "value", value: value.toISOString() };
  if (
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return { state: "value", value };
  if (typeof value === "string")
    return {
      state: "value",
      value: text(value, 500)!,
      ...(value.length > 500 ? { truncated: true } : {}),
    };
  if (Array.isArray(value) && value.every((v) => typeof v === "string"))
    return {
      state: "value",
      value: value.slice(0, 100).map((v) => text(v, 100)!),
      ...(value.length > 100 || value.some((v) => v.length > 100)
        ? { truncated: true }
        : {}),
    };
  return { state: "redacted" };
}
export function diff(
  action: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): {
  changes: AuditChange[];
  changesTruncated: boolean;
  safeFields: Record<string, AuditValue>;
} {
  const changes: AuditChange[] = [],
    safeFields: Record<string, AuditValue> = {};
  function walk(
    path: string,
    a: unknown,
    b: unknown,
    hasA: boolean,
    hasB: boolean,
    depth: number,
  ) {
    const key = path.split(".").at(-1)!,
      redact =
        privateFields.has(key) ||
        /password|secret|token|cookie|authorization/i.test(key);
    const object = (v: unknown) =>
      v !== null && typeof v === "object" && !(v instanceof Date);
    if (
      !redact &&
      depth < 4 &&
      (object(a) || object(b)) &&
      !(
        Array.isArray(a) &&
        a.every((v) => typeof v === "string") &&
        Array.isArray(b) &&
        b.every((v) => typeof v === "string")
      )
    ) {
      const aa = object(a) ? (a as Record<string, unknown>) : {},
        bb = object(b) ? (b as Record<string, unknown>) : {};
      for (const k of [
        ...new Set([...Object.keys(aa), ...Object.keys(bb)]),
      ].slice(0, 100))
        if (nested.has(k) || /^\d{1,2}$/.test(k))
          walk(
            path + "." + k,
            aa[k],
            bb[k],
            Object.hasOwn(aa, k),
            Object.hasOwn(bb, k),
            depth + 1,
          );
      return;
    }
    const av = valueAt(a, hasA, redact),
      bv = valueAt(b, hasB, redact);
    safeFields[path] = bv;
    if (hasA !== hasB || JSON.stringify(a) !== JSON.stringify(b))
      changes.push({ path, before: av, after: bv });
  }
  for (const key of catalog(action)?.fields ?? [])
    if (Object.hasOwn(before, key) || Object.hasOwn(after, key))
      walk(
        key,
        before[key],
        after[key],
        Object.hasOwn(before, key),
        Object.hasOwn(after, key),
        0,
      );
  return {
    changes: changes.slice(0, 100),
    changesTruncated: changes.length > 100,
    safeFields,
  };
}
export function safeChanges(action: string, raw: unknown): AuditChange[] {
  if (!Array.isArray(raw)) return [];
  const fields = catalog(action)?.fields ?? [];
  return raw.slice(0, 100).flatMap((change) => {
    if (
      !change ||
      typeof change !== "object" ||
      typeof change.path !== "string" ||
      !fields.includes(change.path.split(".")[0]) ||
      !/^\w+(?:\.\w+){0,4}$/.test(change.path) ||
      change.path
        .split(".")
        .slice(1)
        .some((key: string) => !nested.has(key) && !/^\d{1,2}$/.test(key))
    )
      return [];
    const clean = (v: unknown): AuditValue => {
      const val = parse(v);
      if (!val) return { state: "unrecorded" };
      if (
        ["missing", "null", "empty", "redacted", "unrecorded"].includes(
          String(val.state),
        )
      )
        return { state: val.state as "missing" };
      const result = valueAt(
        val.value,
        Object.hasOwn(val, "value"),
        change.path
          .split(".")
          .some(
            (k: string) =>
              privateFields.has(k) ||
              /password|secret|token|cookie|authorization/i.test(k),
          ),
      );
      return result.state === "value" && val.truncated === true
        ? { ...result, truncated: true }
        : result;
    };
    return [
      {
        path: change.path,
        before: clean(change.before),
        after: clean(change.after),
      },
    ];
  });
}
