import { requestJson } from "@/lib/errors/transport";
export const AUDIT_API = "/api/v1/admin/audit";
export async function auditApi<T>(
  path: string,
  payload?: unknown,
  method = "POST",
  signal?: AbortSignal,
): Promise<T> {
  return (
    await requestJson<T>(
      AUDIT_API + path,
      {
        method,
        cache: "no-store",
        signal,
        ...(method === "GET" || method === "DELETE"
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ payload }),
            }),
      },
      { requireOk: true },
    )
  ).data;
}
