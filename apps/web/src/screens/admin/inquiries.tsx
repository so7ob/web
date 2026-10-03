import { InquiriesClient } from "@/components/admin/inquiries/inquiries-client";
import { useSearchParams } from "react-router-dom";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin(),
    [query] = useSearchParams();
  return (
    <InquiriesClient
      me={data.user}
      initialStatus={query.get("status") ?? undefined}
      locale={data.locale}
    />
  );
}
