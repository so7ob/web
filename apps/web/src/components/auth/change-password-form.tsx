import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/components/admin/helpers";
import { identityError } from "@/components/admin/identity/shared";
import { identityCopy } from "@/content/identity";
import { AuthCard } from "./auth-card";
import type { Locale } from "@/lib/i18n";
export function ChangePasswordForm({ locale }: { locale: Locale }) {
  const t = identityCopy[locale],
    [currentPassword, setCurrent] = useState(""),
    [newPassword, setNew] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    pending = useRef(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    if (
      new TextEncoder().encode(newPassword).length > 72 ||
      newPassword.length < 8 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/\d/.test(newPassword) ||
      newPassword === currentPassword
    ) {
      setError(t.passwordPolicy);
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      await apiSend("/api/auth/change-password", "POST", {
        currentPassword,
        newPassword,
      });
      window.location.assign(`/${locale}/auth/login`);
    } catch (e) {
      setError(identityError(e, locale));
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  return (
    <AuthCard title={t.changeTitle}>
      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          {t.currentPassword}
          <Input
            required
            autoComplete="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="block">
          {t.newPassword}
          <Input
            required
            autoComplete="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </label>
        <p>{t.passwordPolicy}</p>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? t.loading : t.change}
        </Button>
      </form>
    </AuthCard>
  );
}
