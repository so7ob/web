import { AccountDashboard } from "@/components/account/dashboard";
import { useAccountView } from "./data";
export function Component() {
  const { locale, user, account } = useAccountView();
  if (account.screen !== "dashboard") throw new Error("Invalid dashboard");
  return (
    <AccountDashboard locale={locale} user={user} data={account.dashboard} />
  );
}
