import { PagesClient } from "@/components/admin/pages-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return <PagesClient me={data.user} locale={data.locale} />;
}
