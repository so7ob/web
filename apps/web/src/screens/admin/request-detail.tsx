import { RequestDetailClient } from "@/components/admin/requests/request-detail-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return (
    <RequestDetailClient
      me={data.user}
      locale={data.locale}
      requestId={data.admin.id!}
    />
  );
}
