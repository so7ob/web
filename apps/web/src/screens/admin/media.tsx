import { MediaClient } from "@/components/admin/media/media-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return <MediaClient me={data.user} locale={data.locale} />;
}
