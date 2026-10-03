import { UsersClient } from "@/components/admin/users/users-client";
import { useSearchParams } from "react-router-dom";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin(),
    [query] = useSearchParams();
  return (
    <UsersClient
      me={data.user}
      initialQ={(query.get("q") ?? "").slice(0, 100)}
      initialStatus={query.get("status") ?? undefined}
      locale={data.locale}
    />
  );
}
