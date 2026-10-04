import { PreviewShell } from "@/components/admin/preview-shell";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin(),
    preview = data.admin.preview;
  if (!preview) throw new Error("Missing preview data");
  return (
    <PreviewShell
      pageId={data.admin.id!}
      blocks={preview.blocks}
      nodes={preview.nodes}
      locale={preview.locale}
      uiLocale={data.locale}
      initialDevice={preview.device}
    />
  );
}
