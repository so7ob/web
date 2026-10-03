import { NewRequestView } from "@/components/account/new-request-view";
import { ar } from "@/content/ar";
import { en } from "@/content/en";
import { useAccountView } from "./data";
export function Component() {
  const { locale, portal } = useAccountView();
  return (
    <NewRequestView
      locale={locale}
      content={locale === "en" ? en : ar}
      t={portal.account.requests}
      heading={portal.account.nav.newRequest}
    />
  );
}
