import type { AuthUser } from "./permissions.js";
import type { Block } from "./blocks.js";
export type AdminIdentity = Pick<
  AuthUser,
  "id" | "name" | "email" | "roleKey" | "locale" | "permissions"
>;
export interface AdminDashboardData {
  access: {
    users: boolean;
    requests: boolean;
    inquiries: boolean;
    pages: boolean;
    audit: boolean;
  };
  rangeDays: 7 | 30 | 90;
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  openRequests: number;
  awaitingInfo: number;
  openInquiries: number;
  publishedPages: number;
  draftPages: number;
  overdueReplies: number;
  statusGroups: Array<{ status: string; _count: number }>;
  recentRequests: Array<{
    id: string;
    refCode: string;
    name: string;
    status: string;
    serviceType: string;
    createdAt: string;
    assignee: { name: string } | null;
  }>;
  recentAudit: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    actorEmail: string | null;
    createdAt: string;
    actor: { name: string } | null;
  }>;
  rangeRows: Array<{ createdAt: string }>;
}
export interface AdminDashboardPresentation {
  chartBars: Array<{
    key: string;
    count: number;
    label: string | null;
    title: string;
  }>;
  requestDates: Record<string, string>;
  auditTimes: Record<string, string>;
}
export type AdminDashboardView = AdminDashboardData & {
  presentation: AdminDashboardPresentation;
};
export type AdminScreen =
  | "dashboard"
  | "pages"
  | "page-editor"
  | "page-preview"
  | "users"
  | "user-detail"
  | "requests"
  | "request-detail"
  | "inquiries"
  | "inquiry-detail"
  | "notifications"
  | "media"
  | "menus"
  | "settings"
  | "audit"
  | "outbox";
export interface AdminPayload {
  screen: AdminScreen;
  id?: string;
  dashboard?: AdminDashboardView;
  preview?: {
    blocks: Block[];
    locale: "ar" | "en";
    device: "desktop" | "tablet" | "mobile";
  };
}
export interface AdministrativeList {
  ok: boolean;
  total: number;
  page: number;
  pageSize: number;
  requests?: Array<Record<string, unknown>>;
  inquiries?: Array<Record<string, unknown>>;
  staff?: Array<{ id: string; name: string }>;
}
