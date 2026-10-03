import { NotificationsView } from "@/components/account/notifications-view";
import { useAccountView } from "./data";
export function Component() {
  const { locale, portal } = useAccountView();
  return (
    <NotificationsView
      locale={locale}
      t={portal.account.notifications}
      authErrors={portal.auth.errors}
      statuses={portal.account.requests.statuses}
    />
  );
}
