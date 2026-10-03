import { SecurityView } from "@/components/account/security-view";
import { useAccountView } from "./data";
export function Component() {
  const { locale, portal } = useAccountView();
  return (
    <SecurityView
      locale={locale}
      t={portal.account.security}
      authErrors={portal.auth.errors}
      authLabels={{
        currentPassword: portal.auth.currentPassword,
        newPassword: portal.auth.newPassword,
        confirmPassword: portal.auth.confirmPassword,
      }}
    />
  );
}
