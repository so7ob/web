import { SettingsClient } from "@/components/admin/settings/settings-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return <SettingsClient me={data.user} locale={data.locale} />;
}
