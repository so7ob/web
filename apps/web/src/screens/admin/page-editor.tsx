import { PageEditor } from "@/components/admin/editor/page-editor";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return (
    <PageEditor me={data.user} locale={data.locale} pageId={data.admin.id!} />
  );
}
