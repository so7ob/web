/** Browser-safe account rendering contracts; no database entities or secrets. */
export interface AccountDashboardData {
  openRequests: number;
  awaitingReply: number;
  unreadNotifications: number;
  openInquiries: number;
  totalInquiries: number;
  totalRequests: number;
  recent: Array<{
    id: string;
    refCode: string;
    serviceType: string;
    status: string;
    lastActivityAt: string;
    lastActivityLabel: string;
  }>;
}
export interface AccountProfileData {
  email: string;
  name: string;
  phone: string;
  company: string;
  userLocale: "ar" | "en";
  emailVerified: boolean;
}
export type AccountScreen =
  | "dashboard"
  | "requests"
  | "new-request"
  | "request-detail"
  | "inquiries"
  | "inquiry-detail"
  | "profile"
  | "security"
  | "notifications";
export type AccountPayload =
  | { screen: "dashboard"; dashboard: AccountDashboardData }
  | { screen: "profile"; profile: AccountProfileData }
  | { screen: "request-detail" | "inquiry-detail"; id: string }
  | {
      screen:
        | "requests"
        | "new-request"
        | "inquiries"
        | "security"
        | "notifications";
    };
export interface AccountIdentity {
  name: string;
  email: string;
  roleKey: string;
  emailVerified: boolean;
}
