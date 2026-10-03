import { AuditClient } from "@/components/admin/audit/audit-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return <AuditClient me={data.user} locale={data.locale} />;
}
