import { IdentityWorkspace } from "@/components/admin/identity/workspace";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return (
    <IdentityWorkspace
      me={data.user}
      locale={data.locale}
      screen={data.admin.screen as "roles" | "permissions" | "invitations"}
    />
  );
}
