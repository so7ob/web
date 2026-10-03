import { AdminDashboard } from "@/components/admin/dashboard";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  if (!data.admin.dashboard) throw new Error("Missing dashboard data");
  return <AdminDashboard data={data.admin.dashboard} locale={data.locale} />;
}
