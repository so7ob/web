import { OutboxClient } from "@/components/admin/outbox/outbox-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return <OutboxClient me={data.user} locale={data.locale} />;
}
