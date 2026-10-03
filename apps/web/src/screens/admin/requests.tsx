import { RequestsClient } from "@/components/admin/requests/requests-client";
import { useSearchParams } from "react-router-dom";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin(),
    [query] = useSearchParams();
  return (
    <RequestsClient
      me={data.user}
      initialStatus={query.get("status") ?? undefined}
      initialOverdue={query.get("overdue") === "1"}
      locale={data.locale}
    />
  );
}
