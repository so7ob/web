import { RequestsView } from "@/components/account/requests-view";
import { useAccountView } from "./data";
export function Component() {
  const { locale, portal } = useAccountView();
  return (
    <RequestsView
      locale={locale}
      t={portal.account.requests}
      authErrors={portal.auth.errors}
      awaitingLabel={portal.account.dashboard.awaitingReply}
      allLabel={portal.account.dashboard.viewAll}
    />
  );
}
