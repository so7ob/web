import { ProfileForm } from "@/components/account/profile-form";
import { useAccountView } from "./data";
export function Component() {
  const { locale, account, portal } = useAccountView();
  if (account.screen !== "profile") throw new Error("Invalid profile");
  return (
    <ProfileForm
      locale={locale}
      t={portal.account.profile}
      authErrors={portal.auth.errors}
      emailLabel={portal.auth.email}
      initial={account.profile}
    />
  );
}
