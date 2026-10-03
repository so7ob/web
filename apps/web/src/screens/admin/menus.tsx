import { MenusClient } from "@/components/admin/menus/menus-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return <MenusClient me={data.user} locale={data.locale} />;
}
