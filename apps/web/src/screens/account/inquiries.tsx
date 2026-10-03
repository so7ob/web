import { InquiriesView } from "@/components/account/inquiries-view";
import { useAccountView } from "./data";
export function Component() {
  const { locale, portal } = useAccountView();
  return (
    <InquiriesView
      locale={locale}
      t={portal.account.inquiries}
      authErrors={portal.auth.errors}
      searchLabel={portal.account.requests.search}
      searchPlaceholder={portal.account.requests.searchPlaceholder}
      clearSearchLabel={portal.account.requests.clearSearch}
    />
  );
}
