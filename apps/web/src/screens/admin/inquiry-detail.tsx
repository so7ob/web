import { InquiryDetailClient } from "@/components/admin/inquiries/inquiry-detail-client";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return (
    <InquiryDetailClient
      me={data.user}
      locale={data.locale}
      inquiryId={data.admin.id!}
    />
  );
}
