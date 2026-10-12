import { useRef, useState } from "react";
import { can } from "@so7ob/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { identityCopy } from "@/content/identity";
import { apiSend, ApiError } from "../helpers";
import { identityError, Secret, type RoleOption } from "./shared";
import type { Locale } from "@/lib/i18n";
import type { Me } from "../types";
export function CreateUser({
  me,
  locale,
  roles,
  onCreated,
}: {
  me: Me;
  locale: Locale;
  roles: RoleOption[];
  onCreated: () => void;
}) {
  const t = identityCopy[locale],
    pending = useRef(false),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [emailError, setEmailError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    locale,
    roleKey: "client",
    status: "active",
    method: "temporary",
    currentPassword: "",
  });
  const [result, setResult] = useState<{
    temporaryPassword?: string;
    emailStatus: string;
  } | null>(null);
  if (!can(me, "users.provision")) return null;
  const change = (key: keyof typeof form, value: string) =>
    setForm({ ...form, [key]: value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setEmailError("");
    try {
      const res = await apiSend<{
        temporaryPassword?: string;
        emailStatus: string;
      }>("/api/admin/users/direct", "POST", form);
      setResult(res);
      setForm({ ...form, currentPassword: "" });
      onCreated();
    } catch (err) {
      setError(identityError(err, locale));
      if (
        err instanceof ApiError &&
        ["email_taken", "invite_pending", "invalid"].includes(err.code)
      )
        setEmailError(identityError(err, locale));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        className="min-h-11"
        onClick={() => {
          setResult(null);
          setError("");
          setOpen(true);
        }}
      >
        {t.add}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) {
            setOpen(v);
            if (!v) {
              setResult(null);
              setForm({
                name: "",
                email: "",
                phone: "",
                company: "",
                locale,
                roleKey: "client",
                status: "active",
                method: "temporary",
                currentPassword: "",
              });
            }
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{result ? t.created : t.add}</DialogTitle>
          </DialogHeader>
          {result ? (
            <div className="space-y-4">
              {result.temporaryPassword ? (
                <Secret value={result.temporaryPassword} locale={locale} />
              ) : (
                <p role="status">
                  {result.emailStatus === "queued" ? t.queued : t.needs_retry}
                </p>
              )}
              <Button
                onClick={() => {
                  setOpen(false);
                  setResult(null);
                }}
              >
                {t.cancel}
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {(["name", "email", "phone", "company"] as const).map((key) => (
                <label key={key} className="block space-y-1">
                  {t[key]}
                  <Input
                    required={key === "name" || key === "email"}
                    type={key === "email" ? "email" : "text"}
                    value={form[key]}
                    maxLength={
                      key === "phone" ? 20 : key === "email" ? 200 : 120
                    }
                    onChange={(e) => change(key, e.target.value)}
                    aria-invalid={key === "email" && !!emailError}
                  />
                  {key === "email" && emailError ? (
                    <span className="text-sm text-destructive">
                      {emailError}
                    </span>
                  ) : null}
                </label>
              ))}
              <label className="block">
                {t.locale}
                <select
                  className="block min-h-11 w-full border rounded-lg"
                  aria-label={t.locale}
                  value={form.locale}
                  onChange={(e) => change("locale", e.target.value)}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="block">
                {t.role}
                <select
                  className="block min-h-11 w-full border rounded-lg"
                  aria-label={t.role}
                  value={form.roleKey}
                  onChange={(e) => change("roleKey", e.target.value)}
                >
                  {roles
                    .filter(
                      (r) =>
                        r.assignable !== false &&
                        r.status === "active" &&
                        (can(me, "users.roles") || r.key === "client"),
                    )
                    .map((r) => (
                      <option value={r.key} key={r.key}>
                        {locale === "ar" ? r.nameAr : r.nameEn}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                {t.status}
                <select
                  className="block min-h-11 w-full border rounded-lg"
                  aria-label={t.status}
                  value={form.status}
                  onChange={(e) => change("status", e.target.value)}
                >
                  <option value="active">{t.active}</option>
                  <option value="suspended">{t.suspended}</option>
                </select>
              </label>
              <label className="block">
                {t.method}
                <select
                  className="block min-h-11 w-full border rounded-lg"
                  aria-label={t.method}
                  value={form.method}
                  onChange={(e) => change("method", e.target.value)}
                >
                  <option value="temporary">{t.temporary}</option>
                  <option value="link">{t.link}</option>
                </select>
              </label>
              {form.roleKey === "super_admin" ? (
                <label className="block">
                  {t.currentPassword}
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={form.currentPassword}
                    onChange={(e) => change("currentPassword", e.target.value)}
                    required
                  />
                </label>
              ) : null}
              {error ? (
                <p role="alert" className="text-destructive text-sm break-all">
                  {error}
                </p>
              ) : null}
              <Button disabled={busy} type="submit">
                {busy ? t.loading : t.save}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
