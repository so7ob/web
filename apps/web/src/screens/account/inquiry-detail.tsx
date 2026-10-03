import { InquiryDetailView } from "@/components/account/inquiry-detail-view";
import { ar } from "@/content/ar";
import { en } from "@/content/en";
import { useAccountView } from "./data";
export function Component() {
  const { locale, account, portal } = useAccountView();
  if (account.screen !== "inquiry-detail") throw new Error("Invalid inquiry");
  return (
    <InquiryDetailView
      locale={locale}
      id={account.id}
      t={portal.account.inquiries}
      authErrors={portal.auth.errors}
      siteName={(locale === "en" ? en : ar).meta.siteName}
    />
  );
}
