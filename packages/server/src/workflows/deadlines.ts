import type { WorkflowScope } from "@so7ob/contracts";
import { responseAnchorSql } from "../admin/response-policy.js";
export function conversationDueSql(scope: WorkflowScope, p = "p", hours = 24) {
  if (
    !/^[a-z]+$/i.test(p) ||
    !Number.isInteger(hours) ||
    hours < 1 ||
    hours > 720
  )
    throw new Error("Invalid deadline parameters");
  const legacy =
    scope === "requests"
      ? responseAnchorSql(p)
      : `(CASE WHEN ${p}.archivedAt IS NULL AND ${p}.status<>'closed' THEN CASE WHEN (SELECT im.authorType FROM InquiryMessage im WHERE im.inquiryId=${p}.id AND im.kind='message' ORDER BY im.createdAt DESC,im.id DESC LIMIT 1)='staff' THEN NULL ELSE COALESCE((SELECT im.createdAt FROM InquiryMessage im WHERE im.inquiryId=${p}.id AND im.kind='message' ORDER BY im.createdAt DESC,im.id DESC LIMIT 1),${p}.createdAt) END ELSE NULL END)`;
  return `(CASE WHEN EXISTS(SELECT 1 FROM ConversationWorkflow dw JOIN WorkflowVersion dv ON dv.id=dw.versionId WHERE dw.scope='${scope}' AND dw.recordId=${p}.id AND dv.legacy=0) THEN (SELECT dw.responseDueAt FROM ConversationWorkflow dw WHERE dw.scope='${scope}' AND dw.recordId=${p}.id) ELSE TIMESTAMPADD(HOUR,${hours},${legacy}) END)`;
}
