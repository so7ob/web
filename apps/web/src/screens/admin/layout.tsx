import { Outlet } from "react-router-dom";
import { AdminShell } from "@/components/admin/admin-shell";
import { siteConfig } from "@/config/site";
import { useAdmin } from "./data";
export function Component() {
  const data = useAdmin();
  return (
    <div dir={data.locale === "ar" ? "rtl" : "ltr"}>
      <AdminShell
        me={data.user}
        locale={data.locale}
        siteName={
          data.locale === "ar"
            ? data.settings["site.nameAr"] || siteConfig.nameAr
            : data.settings["site.nameEn"] || siteConfig.nameEn
        }
      >
        <Outlet />
      </AdminShell>
    </div>
  );
}
