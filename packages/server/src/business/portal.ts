import {notificationAccessSql,workflowAccessSql} from '../workflows/access.js';
import { can } from "@so7ob/contracts";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import type { DataSource } from "typeorm";
import type {
  AccountDashboardData,
  AccountProfileData,
  AuthUser,
} from "@so7ob/contracts";
import { AuthFault } from "../auth/persistence.js";
export class PortalService {
  constructor(private readonly db: DataSource) {}
  async dashboard(
    user: AuthUser,
    locale: "ar" | "en" = "ar",
  ): Promise<AccountDashboardData> {
    // The source account dashboard shows owned records for clients and assigned records for staff.
    const scope = !can(user, "requests.view.all") ? "clientId" : "assigneeId";
    const inquiryScope=!can(user,'inquiries.view.all')?'clientId':'assigneeId';
    const [[requests], [inquiries], [notifications], recent] =
      await Promise.all([
        this.db.query(
          `SELECT COUNT(*) totalRequests,COALESCE(SUM(archivedAt IS NULL AND status IN ('new','in_review','awaiting_info','in_progress','responded')),0) openRequests,COALESCE(SUM(archivedAt IS NULL AND lastStaffReplyAt IS NOT NULL AND (lastClientReplyAt IS NULL OR lastStaffReplyAt>lastClientReplyAt)),0) awaitingReply FROM ProjectRequest WHERE ${scope}=? AND (${can(user,'requests.view.all')?workflowAccessSql(user,'requests','ProjectRequest'):'1=1'})`,
          [user.id],
        ),
        this.db.query(
          `SELECT COUNT(*) totalInquiries,COALESCE(SUM(archivedAt IS NULL AND status IN ('new','in_review','awaiting_info','responded')),0) openInquiries FROM Inquiry WHERE ${inquiryScope}=? AND (${can(user,'inquiries.view.all')?workflowAccessSql(user,'inquiries','Inquiry'):'1=1'})`,
          [user.id],
        ),
        this.db.query(
          `SELECT COUNT(*) unreadNotifications FROM Notification WHERE userId=? AND readAt IS NULL AND (${notificationAccessSql(user)})`,
          [user.id],
        ),
        this.db.query(
          `SELECT id,refCode,serviceType,status,lastActivityAt FROM ProjectRequest WHERE ${scope}=? AND (${can(user,'requests.view.all')?workflowAccessSql(user,'requests','ProjectRequest'):'1=1'}) ORDER BY lastActivityAt DESC LIMIT 5`,
          [user.id],
        ),
      ]);
    return {
      totalRequests: Number(requests.totalRequests),
      openRequests: Number(requests.openRequests),
      awaitingReply: Number(requests.awaitingReply),
      totalInquiries: Number(inquiries.totalInquiries),
      openInquiries: Number(inquiries.openInquiries),
      unreadNotifications: Number(notifications.unreadNotifications),
      recent: recent.map(
        (r: {
          id: string;
          refCode: string;
          serviceType: string;
          status: string;
          lastActivityAt: Date;
        }) => ({
          ...r,
          lastActivityAt: r.lastActivityAt.toISOString(),
          lastActivityLabel: formatDistanceToNow(r.lastActivityAt, {
            addSuffix: true,
            locale: locale === "en" ? enUS : ar,
          }),
        }),
      ),
    };
  }
  async profile(user: AuthUser): Promise<AccountProfileData> {
    const [row] = await this.db.query(
      "SELECT email,name,phone,company,locale,emailVerifiedAt FROM User WHERE id=?",
      [user.id],
    );
    if (!row) throw new AuthFault(401, "unauthorized");
    return {
      email: row.email,
      name: row.name,
      phone: row.phone ?? "",
      company: row.company ?? "",
      userLocale: row.locale === "en" ? "en" : "ar",
      emailVerified: !!row.emailVerifiedAt,
    };
  }
}
