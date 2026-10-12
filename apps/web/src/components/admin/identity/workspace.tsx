import { useEffect, useRef, useState } from "react";
import { can, PERMISSION_CATALOG, type Permission } from "@so7ob/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "@/routing/link";
import { identityCopy } from "@/content/identity";
import { apiGet, apiSend } from "../helpers";
import { IdentityNav, identityError, type RoleOption } from "./shared";
import type { Me } from "../types";
import type { Locale } from "@/lib/i18n";
const blank: RoleOption = {
  key: "",
  nameAr: "",
  nameEn: "",
  descriptionAr: "",
  descriptionEn: "",
  permissions: [],
  grantablePermissions: [],
  version: 0,
  status: "active",
  isSystem: false,
  userCount: 0,
};
export function PermissionEditor({
  value,
  onChange,
  locale,
  disabled = false,
}: {
  value: Permission[];
  onChange: (v: Permission[]) => void;
  locale: Locale;
  disabled?: boolean;
}) {
  const t = identityCopy[locale],
    [q, setQ] = useState(""),
    [selected, setSelected] = useState(false);
  const filtered = PERMISSION_CATALOG.filter(
    (p) =>
      (!selected || value.includes(p.key)) &&
      `${p.key} ${p.nameAr} ${p.nameEn}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const toggle = (keys: Permission[], on: boolean) => {
    const withDependencies = keys.flatMap((key) => [
      key,
      ...(PERMISSION_CATALOG.find((p) => p.key === key)?.requires ?? []),
    ]);
    onChange(
      on
        ? [...new Set([...value, ...withDependencies])]
        : value.filter((p) => !keys.includes(p)),
    );
  };
  return (
    <div className="space-y-4">
      <label className="block">
        {t.search}
        <Input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <label className="flex min-h-11 gap-2 items-center">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => setSelected(v === true)}
        />
        {t.selected} ({value.length})
      </label>
      {[...new Set(filtered.map((p) => p.group))].map((group) => {
        const entries = filtered.filter((p) => p.group === group),
          keys = entries.map((p) => p.key),
          count = keys.filter((k) => value.includes(k)).length;
        return (
          <fieldset key={group} className="rounded-xl border p-3">
            <legend className="px-2 font-semibold">
              {locale === "ar"
                ? (
                    {
                      admin: "الإدارة",
                      users: "المستخدمون",
                      roles: "الأدوار",
                      invitations: "الدعوات",
                      requests: "الطلبات",
                      inquiries: "الاستفسارات",
                      pages: "المحتوى",
                      media: "الملفات",
                      menus: "القوائم",
                      settings: "الإعدادات",
                      notifications: "الإشعارات",
                      email: "البريد",
                      diagnostics: "التشخيص",
                      audit: "التدقيق",
                    } as Record<string, string>
                  )[group]
                : group}
            </legend>
            <label className="flex items-center min-h-11 gap-2">
              <Checkbox
                disabled={disabled}
                checked={
                  count === keys.length ? true : count ? "indeterminate" : false
                }
                onCheckedChange={(v) => toggle(keys, v === true)}
              />
              {locale === "ar" ? "تحديد المجموعة" : "Select group"}
            </label>
            {entries.map((p) => (
              <label
                key={p.key}
                className="flex items-start gap-3 py-3 min-h-11"
              >
                <Checkbox
                  disabled={disabled}
                  checked={value.includes(p.key)}
                  onCheckedChange={(v) => toggle([p.key], v === true)}
                  aria-label={locale === "ar" ? p.nameAr : p.nameEn}
                />
                <span className="min-w-0">
                  <span className="block">
                    {locale === "ar" ? p.nameAr : p.nameEn}{" "}
                    {p.sensitivity === "sensitive" ? (
                      <span className="text-xs rounded border px-1">
                        {t.sensitive}
                      </span>
                    ) : null}
                  </span>
                  <code
                    dir="ltr"
                    className="block break-all text-xs text-muted-foreground"
                  >
                    {p.key}
                  </code>
                  <span className="text-xs text-muted-foreground">
                    {locale === "ar" ? p.descriptionAr : p.descriptionEn}
                    {p.requires.length
                      ? ` (${locale === "ar" ? "يتطلب" : "Requires"}: ${p.requires.join(", ")})`
                      : ""}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}
interface Invite {
  id: string;
  email: string;
  roleKey: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  sender: string;
  createdAt: string;
  expiresAt: string;
}
export function IdentityWorkspace({
  me,
  locale,
  screen,
}: {
  me: Me;
  locale: Locale;
  screen: "roles" | "permissions" | "invitations";
}) {
  const t = identityCopy[locale],
    [roles, setRoles] = useState<RoleOption[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<RoleOption | null>(null),
    [original, setOriginal] = useState<RoleOption | null>(null),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    pending = useRef(false),
    [formError, setFormError] = useState("");
  const [inviteAction, setInviteAction] = useState<{
      id: string;
      operation: string;
      protected: boolean;
    } | null>(null),
    [invitePassword, setInvitePassword] = useState("");
  const [details, setDetails] = useState<{
    users: { id: string; name: string }[];
    events: { id: string; action: string; occurredAt: string }[];
  } | null>(null);
  useEffect(() => {
    if (screen === "permissions") {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    const path =
      screen === "roles"
        ? `roles?q=${encodeURIComponent(q)}&page=${page}`
        : `invitations?page=${page}`;
    void apiGet<{
      roles?: RoleOption[];
      invitations?: Invite[];
      total: number;
    }>("/api/admin/identity/" + path)
      .then((data) => {
        if (active) {
          setRoles(data.roles ?? []);
          setInvites(data.invitations ?? []);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (active) setError(identityError(e, locale));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [screen, q, page, reload, locale]);
  async function open(role: RoleOption, copy = false) {
    setFormError("");
    setPreview(false);
    setOriginal(copy ? null : role);
    setEditing(
      copy
        ? {
            ...role,
            key: "",
            nameAr: role.nameAr + " (نسخة)",
            nameEn: role.nameEn + " (copy)",
            version: 0,
            isSystem: false,
            userCount: 0,
            grantablePermissions: [],
          }
        : role,
    );
    setDetails(null);
    if (!copy)
      try {
        setDetails(
          await apiGet(
            "/api/admin/identity/roles/" + encodeURIComponent(role.key),
          ),
        );
      } catch (e) {
        setFormError(identityError(e, locale));
      }
  }
  async function save() {
    if (!editing || pending.current) return;
    pending.current = true;
    setBusy(true);
    setFormError("");
    try {
      const body = {
        ...editing,
        ...(me.roleKey !== "super_admin"
          ? { grantablePermissions: undefined }
          : {}),
      };
      await apiSend(
        "/api/admin/identity/roles" +
          (original ? "/" + encodeURIComponent(original.key) : ""),
        original ? "PATCH" : "POST",
        body,
      );
      setEditing(null);
      setReload((v) => v + 1);
    } catch (e) {
      setFormError(identityError(e, locale));
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  async function invitation(id: string, operation: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await apiSend(
        "/api/admin/identity/invitations/" + id + "/" + operation,
        "POST",
        { currentPassword: invitePassword },
      );
      setInviteAction(null);
      setInvitePassword("");
      setReload((v) => v + 1);
    } catch (e) {
      setError(identityError(e, locale));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const added =
      editing?.permissions.filter((p) => !original?.permissions.includes(p)) ??
      [],
    removed =
      original?.permissions.filter((p) => !editing?.permissions.includes(p)) ??
      [];
  const readOnly =
    !!original &&
    (original.key === "super_admin" ||
      original.key === me.roleKey ||
      !can(me, "roles.update"));
  return (
    <div className="space-y-6">
      <IdentityNav me={me} locale={locale} />
      <header className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-bold">{t[screen]}</h1>
        {screen === "roles" && can(me, "roles.create") ? (
          <Button
            onClick={() => {
              setOriginal(null);
              setEditing({ ...blank });
              setPreview(false);
              setFormError("");
              setDetails(null);
            }}
          >
            {t.createRole}
          </Button>
        ) : null}
      </header>
      {screen === "permissions" ? (
        <PermissionEditor
          value={PERMISSION_CATALOG.filter(p=>can(me,p.key)).map(p=>p.key)}
          onChange={() => {}}
          locale={locale}
          disabled
        />
      ) : null}
      {screen === "roles" ? (
        <label className="block">
          {t.search}
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive break-all">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">{t.loading}</p> : null}
      {screen === "roles" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => (
            <article
              key={role.key}
              className="border rounded-2xl bg-card p-5 space-y-3"
            >
              <h2 className="font-semibold">
                {locale === "ar" ? role.nameAr : role.nameEn}
              </h2>
              <p>{locale === "ar" ? role.descriptionAr : role.descriptionEn}</p>
              <p className="text-sm">
                {t.affected}: {role.userCount} · {role.permissions.length}{" "}
                {t.permissions} ·{" "}
                {role.status === "active" ? t.active : t.archived}
              </p>
              <code className="break-all">{role.key}</code>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void open(role)}>
                  {t.edit}
                </Button>
                {can(me, "roles.create") && role.key !== "super_admin" ? (
                  <Button
                    variant="outline"
                    onClick={() => void open(role, true)}
                  >
                    {t.clone}
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {screen === "invitations" ? (
        <div className="space-y-3">
          {invites.map((invite) => (
            <article
              key={invite.id}
              className="border rounded-xl p-4 space-y-2"
            >
              <p className="break-all" dir="ltr">
                {invite.email}
              </p>
              <p>
                {invite.roleKey} · {t[invite.status]} · {invite.sender}
              </p>
              <p className="text-sm">
                {new Date(invite.createdAt).toLocaleString(locale)} —{" "}
                {new Date(invite.expiresAt).toLocaleString(locale)}
              </p>
              {["pending", "expired"].includes(invite.status) ? (
                <div className="flex gap-2">
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => {
                      setError("");
                      setInviteAction({
                        id: invite.id,
                        operation: "resend",
                        protected: invite.roleKey === "super_admin",
                      });
                    }}
                  >
                    {t.resend}
                  </Button>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => {
                      setError("");
                      setInviteAction({
                        id: invite.id,
                        operation: "cancel",
                        protected: invite.roleKey === "super_admin",
                      });
                    }}
                  >
                    {t.cancel}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {screen !== "permissions" && !loading && total === 0 ? (
        <p>{t.empty}</p>
      ) : null}
      {screen !== "permissions" ? (
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((v) => v - 1)}
          >
            {t.previous}
          </Button>
          <span>{page}</span>
          <Button
            variant="outline"
            disabled={page * (screen === "roles" ? 100 : 20) >= total}
            onClick={() => setPage((v) => v + 1)}
          >
            {t.next}
          </Button>
        </div>
      ) : null}
      <Dialog
        open={!!inviteAction}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setInviteAction(null);
            setInvitePassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {inviteAction?.operation === "cancel" ? t.cancel : t.resend}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteAction)
                void invitation(inviteAction.id, inviteAction.operation);
            }}
          >
            {inviteAction?.protected ? (
              <label>
                {t.currentPassword}
                <Input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
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
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{original ? t.edit : t.createRole}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (preview) void save();
                else setPreview(true);
              }}
            >
              {!original ? (
                <label className="block">
                  {t.key}
                  <Input
                    required
                    pattern="[a-z][a-z0-9_]{2,59}"
                    value={editing.key}
                    onChange={(e) => {
                      setPreview(false);
                      setEditing({ ...editing, key: e.target.value });
                    }}
                  />
                </label>
              ) : null}
              {(
                ["nameAr", "nameEn", "descriptionAr", "descriptionEn"] as const
              ).map((key) => (
                <label key={key} className="block">
                  {t[key]}
                  <Input
                    required={key.startsWith("name")}
                    disabled={readOnly}
                    value={editing[key] ?? ""}
                    onChange={(e) => {
                      setPreview(false);
                      setEditing({ ...editing, [key]: e.target.value });
                    }}
                  />
                </label>
              ))}
              {editing.key === me.roleKey ? <p>{t.self}</p> : null}
              <PermissionEditor
                value={editing.permissions}
                onChange={(permissions) => {
                  setPreview(false);
                  setEditing({
                    ...editing,
                    permissions,
                    grantablePermissions: editing.grantablePermissions.filter(
                      (p) => permissions.includes(p),
                    ),
                  });
                }}
                locale={locale}
                disabled={readOnly || !can(me, "roles.permissions")}
              />
              {me.roleKey === "super_admin" && editing.key !== "super_admin" ? (
                <details>
                  <summary className="cursor-pointer min-h-11">
                    {t.grantable}
                  </summary>
                  <PermissionEditor
                    value={editing.grantablePermissions}
                    onChange={(grantablePermissions) => {
                      setPreview(false);
                      setEditing({
                        ...editing,
                        grantablePermissions: grantablePermissions.filter((p) =>
                          editing.permissions.includes(p),
                        ),
                      });
                    }}
                    locale={locale}
                    disabled={readOnly}
                  />
                </details>
              ) : null}
              {original &&
              !original.isSystem &&
              original.key !== me.roleKey &&
              can(me, "roles.archive") ? (
                <label className="flex min-h-11 items-center gap-2">
                  <Checkbox
                    disabled={readOnly}
                    checked={editing.status === "archived"}
                    onCheckedChange={(v) => {
                      setPreview(false);
                      setEditing({
                        ...editing,
                        status: v ? "archived" : "active",
                      });
                    }}
                  />
                  {t.archive}
                </label>
              ) : null}
              {preview ? (
                <section className="border rounded-xl p-3 space-y-2">
                  <h2>{t.preview}</h2>
                  <p>
                    {t.affected}: {original?.userCount ?? 0}
                  </p>
                  <p>
                    {t.added}: {added.join(", ") || "—"}
                  </p>
                  <p>
                    {t.removed}: {removed.join(", ") || "—"}
                  </p>
                  <p>
                    {t.sensitive}:{" "}
                    {PERMISSION_CATALOG.filter(
                      (p) =>
                        p.sensitivity === "sensitive" &&
                        [...added, ...removed].includes(p.key),
                    )
                      .map((p) => (locale === "ar" ? p.nameAr : p.nameEn))
                      .join(", ") || "—"}
                  </p>
                  <p>
                    {t.status}:{" "}
                    {editing.status === "active" ? t.active : t.archived}
                  </p>
                  <p>
                    {t.grantable}:{" "}
                    {editing.grantablePermissions.join(", ") || "—"}
                  </p>
                </section>
              ) : null}
              {formError ? (
                <p role="alert" className="text-destructive break-all">
                  {formError}
                </p>
              ) : null}
              {!readOnly ? (
                <Button type="submit" disabled={busy}>
                  {busy ? t.loading : preview ? t.confirm : t.preview}
                </Button>
              ) : null}
              {details ? (
                <section className="space-y-3">
                  <h2>{t.users}</h2>
                  {details.users.map((u) => (
                    <Link
                      className="block underline min-h-11"
                      key={u.id}
                      href={`/${locale}/admin/users/${u.id}`}
                    >
                      {u.name}
                    </Link>
                  ))}
                  {original ? (
                    <Link
                      className="block underline min-h-11"
                      href={`/${locale}/admin/users?role=${encodeURIComponent(original.key)}`}
                    >
                      {t.users} ({original.userCount})
                    </Link>
                  ) : null}
                  <h2>{t.activity}</h2>
                  {details.events.map((e) => (
                    <p key={e.id}>
                      {e.action} ·{" "}
                      {new Date(e.occurredAt).toLocaleString(locale)}
                    </p>
                  ))}
                </section>
              ) : null}
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
