import { NotificationsClient } from "@/components/admin/notifications/notifications-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return <NotificationsClient me={data.user} locale={data.locale} />;
}
