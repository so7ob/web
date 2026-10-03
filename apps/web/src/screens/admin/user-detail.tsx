import { UserDetailClient } from "@/components/admin/users/user-detail-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return <UserDetailClient locale={data.locale} userId={data.admin.id!} />;
}
