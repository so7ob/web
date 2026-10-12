import { can } from "@so7ob/contracts";
import Link from "@/routing/link";
import { usePathname } from "@/routing/navigation";
import { Button } from "@/components/ui/button";
import { identityCopy, identityErrors } from "@/content/identity";
import { ApiError, apiErrorMessage, apiGet } from "../helpers";
import { getPortalContent } from "@/content/portal";
import type { Me } from "../types";
import type { Locale } from "@/lib/i18n";
export interface RoleOption {
  assignable?: boolean;
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  permissions: import("@so7ob/contracts").Permission[];
  grantablePermissions: import("@so7ob/contracts").Permission[];
  status: string;
  version: number;
  isSystem: boolean;
  userCount: number;
}
export function identityError(error: unknown, locale: Locale) {
  const known =
    error instanceof ApiError ? identityErrors[error.code] : undefined;
  const ref =
    error instanceof ApiError ? (error.errorId ?? error.requestId) : undefined;
  return known
    ? known[locale === "ar" ? 0 : 1] + (ref ? ` (${ref})` : "")
    : apiErrorMessage(error, getPortalContent(locale).auth.errors);
}
export function IdentityNav({ me, locale }: { me: Me; locale: Locale }) {
  const t = identityCopy[locale],
    path = usePathname();
  return (
    <nav
      aria-label={locale === "ar" ? "إدارة الهوية" : "Identity management"}
      className="flex flex-wrap gap-2"
    >
      {(["users", "roles", "permissions", "invitations"] as const)
        .filter((key) =>
          can(
            me,
            key === "users"
              ? "users.view"
              : key === "invitations"
                ? "invitations.manage"
                : "roles.view",
          ),
        )
        .map((key) => (
          <Button
            key={key}
            asChild
            variant={path?.endsWith("/" + key) ? "default" : "outline"}
            className="min-h-11"
          >
            <Link
              aria-current={path?.endsWith("/" + key) ? "page" : undefined}
              href={`/${locale}/admin/${key}`}
            >
              {t[key]}
            </Link>
          </Button>
        ))}
    </nav>
  );
}
export function Secret({ value, locale }: { value: string; locale: Locale }) {
  const t = identityCopy[locale];
  return (
    <div className="space-y-3 rounded-xl border border-brand p-4">
      <p>{t.secret}</p>
      <code dir="ltr" className="block break-all select-all">
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        onClick={() => void navigator.clipboard.writeText(value)}
      >
        {t.copy}
      </Button>
    </div>
  );
}
export function Reason({
  value,
  onChange,
  locale,
}: {
  value: string;
  onChange: (v: string) => void;
  locale: Locale;
}) {
  const t = identityCopy[locale];
  return (
    <label className="block space-y-2">
      {t.reason}
      <select
        className="block min-h-11 w-full rounded-lg border bg-background px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {(
          [
            "account_support",
            "security_response",
            "staff_change",
            "requested_by_user",
          ] as const
        ).map((key) => (
          <option key={key} value={key}>
            {t[key]}
          </option>
        ))}
      </select>
    </label>
  );
}

export async function loadRoleOptions(
  endpoint = "/api/admin/users/roles",
): Promise<RoleOption[]> {
  const result: RoleOption[] = [];
  for (let page = 1; ; page++) {
    const data = await apiGet<{ roles: RoleOption[]; pageSize: number }>(
      endpoint + "?page=" + page,
    );
    result.push(...data.roles);
    if (data.roles.length < data.pageSize) return result;
  }
}
