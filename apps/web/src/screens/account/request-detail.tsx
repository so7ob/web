import { RequestDetailView } from "@/components/account/request-detail-view";
import { ar } from "@/content/ar";
import { en } from "@/content/en";
import { useAccountView } from "./data";
export function Component() {
  const { locale, account, portal } = useAccountView();
  if (account.screen !== "request-detail") throw new Error("Invalid request");
  return (
    <RequestDetailView
      locale={locale}
      id={account.id}
      t={portal.account.requests}
      d={portal.account.detail}
      content={locale === "en" ? en : ar}
      authErrors={portal.auth.errors}
      priorities={portal.admin.requests.priorities}
    />
  );
}
