// Website 5321b7f: original authorization/status transition rules.
import { can, type AuthUser } from "./permissions.js";


export const REQUEST_STATUSES = ["new", "in_review", "awaiting_info", "in_progress", "responded", "closed", "cancelled"] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];


export const REQUEST_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];


/** انتقالات الحالات المسموحة ومن يملكها */
export const STATUS_TRANSITIONS: Record<RequestStatus, { to: RequestStatus[]; actor: "staff" | "client" | "any" }[]> = {
  new: [
    { to: ["in_review", "awaiting_info", "in_progress", "cancelled"], actor: "staff" },
    { to: ["cancelled"], actor: "client" },
  ],
  in_review: [
    { to: ["awaiting_info", "in_progress", "responded", "closed", "cancelled"], actor: "staff" },
    { to: ["cancelled"], actor: "client" },
  ],
  awaiting_info: [
    { to: ["in_progress", "responded", "closed", "cancelled"], actor: "staff" },
    { to: ["in_review"], actor: "client" }, // رد العميل يعيدها للمراجعة
    { to: ["cancelled"], actor: "client" },
  ],
  in_progress: [{ to: ["responded", "closed", "cancelled", "awaiting_info"], actor: "staff" }],
  responded: [{ to: ["in_progress", "closed", "awaiting_info", "cancelled"], actor: "staff" }],
  closed: [{ to: ["in_review"], actor: "staff" }], // إعادة فتح للطاقم فقط
  cancelled: [{ to: ["in_review"], actor: "staff" }],
};


export function canTransition(status: string, to: string, actor: "staff" | "client"): boolean {
  if (!REQUEST_STATUSES.includes(status as RequestStatus) || !REQUEST_STATUSES.includes(to as RequestStatus)) return false;
  return (STATUS_TRANSITIONS[status as RequestStatus] ?? []).some(
    (rule) => rule.to.includes(to as RequestStatus) && (rule.actor === "any" || rule.actor === actor)
  );
}


/** وصول العميل لطلبه أو الطاقم بصلاحية — لا مكان لحقول متصفح */
export function canAccessRequest(user: AuthUser, request: { clientId: string | null; assigneeId: string | null }): boolean {
  if (user.roleKey === "super_admin") return true;
  if (user.roleKey === "client") return request.clientId === user.id;
  return can(user, "requests.view.all");
}
