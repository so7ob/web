import { Outlet, useRouteLoaderData } from "react-router-dom";
import type { PublicView } from "@so7ob/contracts";
import { AccountShell } from "@/components/account/account-shell";
import { Toaster } from "@/components/ui/sonner";
import { getPortalContent } from "@/content/portal";
import { localeMeta } from "@/lib/i18n";
export function Component() {
  const data = useRouteLoaderData<PublicView>("root");
  if (!data || data.kind !== "account") throw new Error("Invalid account view");
  const { locale, user } = data,
    portal = getPortalContent(locale);
  return (
    <div dir={localeMeta[locale].dir}>
      <AccountShell
        locale={locale}
        nav={portal.account.nav}
        auth={{
          pendingTitle: portal.auth.pendingVerification,
          pendingBody: portal.auth.pendingVerificationBody,
        }}
        user={user}
      >
        <Outlet />
      </AccountShell>
      <Toaster richColors position="top-center" dir={localeMeta[locale].dir} />
    </div>
  );
}
