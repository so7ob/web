import {responsePolicy,responseDueSql} from "./response-policy.js";
import type { DataSource } from "typeorm";
import {
  can,
  dashboardAccess,
  REQUEST_STATUSES,
  type AdminDashboardData,
  type AuthUser,
} from "@so7ob/contracts";
import { AuthFault } from "../auth/persistence.js";
import { sqliteLike } from "../business/requests.js";
export class AdminDashboardService {
  constructor(private readonly db: DataSource) {}
  async suspended(actor: AuthUser) {
    if (!can(actor, "users.view")) throw new AuthFault(403, "forbidden");
    return Number(
      (
        await this.db.query(
          "SELECT COUNT(*) n FROM User WHERE status='suspended'",
        )
      )[0].n,
    );
  }
  statusCounts(d: AdminDashboardData) {
    return d.access.requests
      ? REQUEST_STATUSES.map((status) => ({
          status,
          count: d.statusGroups.find((g) => g.status === status)?._count ?? 0,
        }))
      : [];
  }
  days(d: AdminDashboardData) {
    if (!d.access.requests) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - 6 + i);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      return {
        date: day.toISOString().slice(0, 10),
        count: d.rangeRows.filter(
          (r) => new Date(r.createdAt) >= day && new Date(r.createdAt) < next,
        ).length,
      };
    });
  }
  async dashboard(
    actor: AuthUser,
    range: string | null,
  ): Promise<AdminDashboardData> {
    if (!can(actor, "admin.dashboard")) throw new AuthFault(403, "forbidden");
    const access = dashboardAccess(actor),
      rangeDays = range === "30" ? 30 : range === "90" ? 90 : 7;
    const count = async (sql: string, params: unknown[] = []) =>
      Number((await this.db.query(sql, params))[0].n);
    const users = access.users
      ? await this.db.query(
          "SELECT COUNT(*) total,SUM(status='active') active,SUM(status='pending_verification') pending FROM User",
        )
      : [{ total: 0, active: 0, pending: 0 }];
    const policy=await responsePolicy(this.db);
    const requestCounts = access.requests
      ? await this.db.query(
          `SELECT COUNT(*) open,SUM(status='awaiting_info') awaiting,SUM(${responseDueSql('')}<UTC_TIMESTAMP(3)) overdue FROM ProjectRequest WHERE archivedAt IS NULL AND status IN ('new','in_review','awaiting_info','in_progress','responded')`,[policy.hours],
        )
      : [{ open: 0, awaiting: 0, overdue: 0 }];
    const [
      openInquiries,
      publishedPages,
      draftPages,
      statusGroups,
      requests,
      audits,
      rangeRows,
    ] = await Promise.all([
      access.inquiries
        ? count(
            "SELECT COUNT(*) n FROM Inquiry WHERE archivedAt IS NULL AND status IN ('new','in_review','awaiting_info','responded')",
          )
        : 0,
      access.pages
        ? count("SELECT COUNT(*) n FROM Page WHERE status='published'")
        : 0,
      access.pages
        ? count(
            "SELECT COUNT(*) n FROM Page WHERE status IN ('draft','in_review')",
          )
        : 0,
      access.requests
        ? this.db.query(
            "SELECT status,COUNT(*) _count FROM ProjectRequest WHERE archivedAt IS NULL GROUP BY status",
          )
        : [],
      access.requests
        ? this.db.query(
            "SELECT p.id,p.refCode,p.name,p.status,p.serviceType,p.createdAt,u.name assigneeName FROM ProjectRequest p LEFT JOIN User u ON u.id=p.assigneeId WHERE p.archivedAt IS NULL ORDER BY p.createdAt DESC LIMIT 8",
          )
        : [],
      access.audit
        ? this.db.query(
            "SELECT a.id,a.action,a.entityType,a.entityId,a.actorEmail,a.createdAt,u.name actorName FROM AuditLog a LEFT JOIN User u ON u.id=a.actorId ORDER BY a.createdAt DESC LIMIT 10",
          )
        : [],
      access.requests
        ? this.db.query(
            "SELECT createdAt FROM ProjectRequest WHERE createdAt>=?",
            [new Date(Date.now() - rangeDays * 86400000)],
          )
        : [],
    ]);
    return {
      access,
      rangeDays,
      totalUsers: Number(users[0].total),
      activeUsers: Number(users[0].active ?? 0),
      pendingUsers: Number(users[0].pending ?? 0),
      openRequests: Number(requestCounts[0].open),
      awaitingInfo: Number(requestCounts[0].awaiting ?? 0),
      overdueReplies: Number(requestCounts[0].overdue ?? 0),
      openInquiries,
      publishedPages,
      draftPages,
      statusGroups: statusGroups.map(
        (r: { status: string; _count: string | number }) => ({
          status: r.status,
          _count: Number(r._count),
        }),
      ),
      recentRequests: requests.map(
        (r: {
          id: string;
          refCode: string;
          name: string;
          status: string;
          serviceType: string;
          createdAt: Date;
          assigneeName: string | null;
        }) => {
          const { assigneeName, ...safe } = r;
          return {
            ...safe,
            createdAt: r.createdAt.toISOString(),
            assignee: assigneeName === null ? null : { name: assigneeName },
          };
        },
      ),
      recentAudit: audits.map(
        (r: {
          id: string;
          action: string;
          entityType: string;
          entityId: string | null;
          actorEmail: string | null;
          createdAt: Date;
          actorName: string | null;
        }) => {
          const { actorName, ...safe } = r;
          return {
            ...safe,
            createdAt: r.createdAt.toISOString(),
            actor: actorName === null ? null : { name: actorName },
          };
        },
      ),
      rangeRows: rangeRows.map((r: { createdAt: Date }) => ({
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
  async search(actor: AuthUser, raw: string = "") {
    if (!can(actor, "admin.dashboard")) throw new AuthFault(403, "forbidden");
    const q = raw.trim().toLowerCase().slice(0, 100);
    const search = async (
      permission: Parameters<typeof can>[1],
      table: string,
      fields: string[],
      projection: string,
      where: string,
      order: string,
    ) => {
      if (q.length < 2 || !can(actor, permission)) return [];
      const terms = fields.map((field) => sqliteLike(field, q));
      return this.db.query(
        `SELECT ${projection} FROM ${table} WHERE ${where} AND (${terms.map((t) => t.sql).join(" OR ")}) ORDER BY ${order} DESC LIMIT 5`,
        terms.map((t) => t.value),
      );
    };
    const [users, requests, inquiries, pages] = await Promise.all([
      search(
        "users.view",
        "User",
        ["name", "email"],
        "id,name,email,status,roleKey",
        "1=1",
        "createdAt",
      ),
      search(
        "requests.view.all",
        "ProjectRequest",
        ["refCode", "name", "description"],
        "id,refCode,name,status",
        "archivedAt IS NULL",
        "lastActivityAt",
      ),
      search(
        "inquiries.view.all",
        "Inquiry",
        ["refCode", "email", "subject"],
        "id,refCode,email,subject,status",
        "archivedAt IS NULL",
        "createdAt",
      ),
      search(
        "pages.view",
        "Page",
        ["slug", "titleAr", "titleEn"],
        "id,slug,titleAr,titleEn,status",
        "status<>'archived'",
        "updatedAt",
      ),
    ]);
    return { ok: true, users, requests, inquiries, pages };
  }
}
