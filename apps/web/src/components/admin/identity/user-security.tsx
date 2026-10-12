import { useEffect, useRef, useState } from "react";
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
import { apiGet, apiSend } from "../helpers";
import { identityError, Reason, Secret } from "./shared";
import type { Me, UserDetailResponse } from "../types";
import type { Locale } from "@/lib/i18n";
interface Session {
  id: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
}
export function UserSecurity({
  me,
  locale,
  data,
  onChanged,
}: {
  me: Me;
  locale: Locale;
  data: UserDetailResponse;
  onChanged: () => void;
}) {
  const t = identityCopy[locale],
    [sessions, setSessions] = useState<Session[]>([]),
    [operation, setOperation] = useState(""),
    [sessionId, setSessionId] = useState<string | undefined>(),
    [reason, setReason] = useState("account_support"),
    [currentPassword, setPassword] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    pending = useRef(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    if (!can(me, "users.sessions.manage")) return;
    let active = true;
    void apiGet<{ sessions: Session[] }>(
      `/api/admin/identity/users/${data.user.id}/sessions`,
    )
      .then((res) => {
        if (active) setSessions(res.sessions);
      })
      .catch((e) => {
        if (active) setError(identityError(e, locale));
      });
    return () => {
      active = false;
    };
  }, [data.user.id, me, locale, reload]);
  function open(op: string, id?: string) {
    setOperation(op);
    setSessionId(id);
    setError("");
    setMessage("");
    setSecret("");
    setPassword("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await apiSend<{
        temporaryPassword?: string;
        emailStatus?: string;
      }>(`/api/admin/identity/users/${data.user.id}/${operation}`, "POST", {
        reason,
        currentPassword,
        sessionId,
      });
      setPassword("");
      setReload((v) => v + 1);
      onChanged();
      if (res.temporaryPassword) setSecret(res.temporaryPassword);
      else {
        setMessage(
          res.emailStatus
            ? res.emailStatus === "queued"
              ? t.queued
              : t.needs_retry
            : t.ready,
        );
        setOperation("");
      }
    } catch (e) {
      setError(identityError(e, locale));
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  const state = data.user.credentialState as
    | "ready"
    | "temporary"
    | "setup_pending";
  return (
    <section className="rounded-2xl border bg-card p-5 space-y-4">
      <h2 className="font-semibold">
        {t.credentialState}: {t[state] ?? state}
      </h2>
      <p>
        {t.source}: {locale === "ar" ? data.role?.nameAr : data.role?.nameEn} (
        {data.user.roleKey})
      </p>
      <ul className="flex flex-wrap gap-2">
        {data.role?.permissions.map((p) => (
          <li key={p} className="rounded border p-1 text-xs break-all">
            {p}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {can(me, "users.credentials.reset") ? (
          <Button variant="outline" onClick={() => open("setup")}>
            {t.setup}
          </Button>
        ) : null}
        {can(me, "users.credentials.temporary") ? (
          <Button variant="outline" onClick={() => open("temporary")}>
            {t.reissue}
          </Button>
        ) : null}
      </div>
      {can(me, "users.sessions.manage") ? (
        <>
          <h3>
            {t.sessions} ({sessions.length})
          </h3>
          <Button variant="outline" onClick={() => open("revoke")}>
            {t.revokeAll}
          </Button>
          {sessions.map((s) => (
            <div
              className="border rounded-xl p-3 flex flex-wrap gap-3 justify-between"
              key={s.id}
            >
              <p className="break-all text-sm">
                {s.userAgent || "—"} ·{" "}
                {new Date(s.lastSeenAt).toLocaleString(locale)}
              </p>
              <Button variant="outline" onClick={() => open("revoke", s.id)}>
                {t.revoke}
              </Button>
            </div>
          ))}
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {error && !operation ? (
        <p role="alert" className="text-destructive break-all">
          {error}
        </p>
      ) : null}
      <Dialog
        open={!!operation}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setOperation("");
            setSecret("");
            setPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {operation === "temporary"
                ? t.reissue
                : operation === "setup"
                  ? t.setup
                  : t.revoke}
            </DialogTitle>
          </DialogHeader>
          {secret ? (
            <Secret value={secret} locale={locale} />
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <Reason locale={locale} value={reason} onChange={setReason} />
              {operation === "temporary" ||
              data.user.roleKey === "super_admin" ? (
                <label className="block">
                  {t.currentPassword}
                  <Input
                    required
                    autoComplete="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              ) : null}
              {error ? (
                <p role="alert" className="text-destructive break-all">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy}>
                {busy ? t.loading : t.confirm}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
