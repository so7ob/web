// Imported scalar/relationship contracts from Website SHA 5321b7f; no database client dependency.
export interface Models {
  Role: Role;
  User: User;
  AuthSession: AuthSession;
  AuthToken: AuthToken;
  UserInvite: UserInvite;
  EmailLog: EmailLog;
  ProjectRequest: ProjectRequest;
  RequestMessage: RequestMessage;
  RequestStatusEvent: RequestStatusEvent;
  RequestClaim: RequestClaim;
  SavedReply: SavedReply;
  RequestDraft: RequestDraft;
  Inquiry: Inquiry;
  InquiryMessage: InquiryMessage;
  Attachment: Attachment;
  MediaItem: MediaItem;
  Notification: Notification;
  AuditLog: AuditLog;
  Page: Page;
  PageVersion: PageVersion;
  PageRedirect: PageRedirect;
  MenuItem: MenuItem;
  SiteSetting: SiteSetting;
}
export interface Role {
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  permissions: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  users: User[];
  _count: Record<string, number>;
}
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone: string | null;
  company: string | null;
  locale: string;
  roleKey: string;
  status: string;
  emailVerifiedAt: Date | null;
  sessionsRevokedAt: Date | null;
  lastLoginAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  role: Role;
  authSessions: AuthSession[];
  authTokens: AuthToken[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  invitesSent: UserInvite[];
  inviteAccepted: UserInvite | null;
  clientRequests: ProjectRequest[];
  assignedRequests: ProjectRequest[];
  requestMessages: RequestMessage[];
  requestClaims: RequestClaim[];
  statusEvents: RequestStatusEvent[];
  inquiries: Inquiry[];
  assignedInquiries: Inquiry[];
  inquiryMessages: InquiryMessage[];
  attachments: Attachment[];
  mediaItems: MediaItem[];
  pageVersions: PageVersion[];
  requestDrafts: RequestDraft[];
  savedReplies: SavedReply[];
  settingsUpdated: SiteSetting[];
  _count: Record<string, number>;
}
export interface AuthSession {
  id: string;
  userId: string;
  fingerprint: string;
  userAgent: string | null;
  ipHash: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  user: User;
  _count: Record<string, number>;
}
export interface AuthToken {
  id: string;
  userId: string;
  tokenHash: string;
  type: string;
  resourceId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  user: User;
  _count: Record<string, number>;
}
export interface UserInvite {
  id: string;
  email: string;
  roleKey: string;
  tokenHash: string;
  invitedById: string | null;
  acceptedUserId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  invitedBy: User | null;
  invitee: User | null;
  _count: Record<string, number>;
}
export interface EmailLog {
  id: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  status: string;
  error: string | null;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface ProjectRequest {
  id: string;
  refCode: string;
  requestType: string;
  serviceType: string;
  description: string;
  budget: string;
  currency: string | null;
  timeline: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  preferredContact: string;
  referenceUrl: string | null;
  locale: string;
  descriptionHash: string;
  clientIpHash: string | null;
  userAgent: string | null;
  status: string;
  notifiedAt: Date | null;
  createdAt: Date;
  clientId: string | null;
  assigneeId: string | null;
  priority: string;
  resolutionNote: string | null;
  closedAt: Date | null;
  archivedAt: Date | null;
  lastActivityAt: Date;
  lastClientReplyAt: Date | null;
  lastStaffReplyAt: Date | null;
  clientReadAt: Date | null;
  staffReadAt: Date | null;
  updatedAt: Date;
  client: User | null;
  assignee: User | null;
  messages: RequestMessage[];
  attachments: Attachment[];
  statusHistory: RequestStatusEvent[];
  claim: RequestClaim | null;
  _count: Record<string, number>;
}
export interface RequestMessage {
  id: string;
  requestId: string;
  authorId: string | null;
  authorType: string;
  kind: string;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  request: ProjectRequest;
  author: User | null;
  _count: Record<string, number>;
}
export interface RequestStatusEvent {
  id: string;
  requestId: string;
  fromStatus: string | null;
  toStatus: string;
  changedById: string | null;
  note: string | null;
  createdAt: Date;
  request: ProjectRequest;
  changedBy: User | null;
  _count: Record<string, number>;
}
export interface RequestClaim {
  id: string;
  requestId: string;
  userId: string;
  status: string;
  createdAt: Date;
  verifiedAt: Date | null;
  request: ProjectRequest;
  user: User;
  _count: Record<string, number>;
}
export interface SavedReply {
  id: string;
  name: string;
  content: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  creator: User;
  _count: Record<string, number>;
}
export interface RequestDraft {
  id: string;
  userId: string;
  data: string;
  updatedAt: Date;
  user: User;
  _count: Record<string, number>;
}
export interface Inquiry {
  id: string;
  refCode: string;
  subject: string;
  name: string;
  email: string;
  category: string;
  status: string;
  priority: string;
  locale: string;
  clientId: string | null;
  assigneeId: string | null;
  closedAt: Date | null;
  archivedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
  client: User | null;
  assignee: User | null;
  messages: InquiryMessage[];
  attachments: Attachment[];
  _count: Record<string, number>;
}
export interface InquiryMessage {
  id: string;
  inquiryId: string;
  authorId: string | null;
  authorType: string;
  kind: string;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  inquiry: Inquiry;
  author: User | null;
  _count: Record<string, number>;
}
export interface Attachment {
  id: string;
  filename: string;
  storedName: string;
  mimeType: string;
  size: number;
  kind: string;
  uploaderId: string | null;
  requestId: string | null;
  inquiryId: string | null;
  messageId: string | null;
  createdAt: Date;
  uploader: User | null;
  request: ProjectRequest | null;
  inquiry: Inquiry | null;
  _count: Record<string, number>;
}
export interface MediaItem {
  id: string;
  filename: string;
  storedName: string;
  mimeType: string;
  size: number;
  altText: string | null;
  title: string | null;
  folder: string;
  uploadedById: string | null;
  createdAt: Date;
  uploadedBy: User | null;
  _count: Record<string, number>;
}
export interface Notification {
  id: string;
  userId: string;
  type: string;
  payload: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
  user: User;
  _count: Record<string, number>;
}
export interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  ipHash: string | null;
  createdAt: Date;
  actor: User | null;
  _count: Record<string, number>;
}
export interface Page {
  id: string;
  slug: string;
  isHome: boolean;
  order: number;
  visibility: string;
  allowedRoles: string;
  status: string;
  titleAr: string;
  titleEn: string;
  seoTitleAr: string | null;
  seoTitleEn: string | null;
  seoDescAr: string | null;
  seoDescEn: string | null;
  ogMediaId: string | null;
  draftBlocksAr: string;
  draftBlocksEn: string;
  draftUpdatedAt: Date | null;
  draftUpdatedById: string | null;
  publishedBlocksAr: string | null;
  publishedBlocksEn: string | null;
  publishedAt: Date | null;
  publishedById: string | null;
  sourceKey: string | null;
  seedVersion: number;
  editorTouchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  versions: PageVersion[];
  _count: Record<string, number>;
}
export interface PageVersion {
  id: string;
  pageId: string;
  locale: string;
  version: number;
  blocks: string;
  authorId: string | null;
  note: string | null;
  createdAt: Date;
  page: Page;
  author: User | null;
  _count: Record<string, number>;
}
export interface PageRedirect {
  id: string;
  fromSlug: string;
  toSlug: string;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface MenuItem {
  id: string;
  location: string;
  labelAr: string;
  labelEn: string;
  url: string | null;
  pageSlug: string | null;
  order: number;
  enabled: boolean;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface SiteSetting {
  key: string;
  value: string;
  updatedById: string | null;
  updatedAt: Date;
  updatedBy: User | null;
  _count: Record<string, number>;
}
