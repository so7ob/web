import { NativeSelect } from "@/components/ui/native-select";
import { Panel, PageHeading, Toolbar } from "@/components/ui/workspace";
import { siteConfig } from "@/config/site";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Save,
  RotateCcw,
  Palette,
  ImagePlus,
  Eye,
  Loader2,
  Check,
  ChevronLeft,
} from "lucide-react";
import {
  SETTING_SECTIONS,
  SECTION_KEYS,
  SETTINGS_DEFAULTS,
  IDENTITY_MEDIA_KEYS,
  PALETTE_PRESETS,
  validateSiteSettings,
  paletteChecks,
  can,
  type SettingSection,
} from "@so7ob/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPortalContent } from "@/content/portal";
import {
  sectionLabels,
  settingLabels,
  settingOptions,
  settingsErrors,
} from "@/content/settings";
import { themeStyles } from "@/lib/appearance";
import type { Locale } from "@/lib/i18n";
import { apiGet, apiSend, ApiError, apiErrorMessage } from "../helpers";
import type { Me, SettingsResponse } from "../types";
import { ConflictReview } from "../conflict-review";
import { MediaPicker } from "../editor/media-picker";
import { cn } from "@/lib/utils";
const fieldId = (key: string) =>
  ({
    "response.hours": "response-hours",
    "announcement.startAt": "announcement-start",
    "announcement.endAt": "announcement-end",
  })[key] ??
  key.replaceAll(".", "-").replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function previewHtml(
  s: Record<string, string>,
  lang: Locale,
  mode: "light" | "dark",
  section: SettingSection,
) {
  const ar = lang === "ar",
    name =
      s[ar ? "site.nameAr" : "site.nameEn"] ||
      SETTINGS_DEFAULTS[ar ? "site.nameAr" : "site.nameEn"];
  const image =
    s[
      `identity.logo${ar ? "Ar" : "En"}${mode === "light" ? "Light" : "Dark"}`
    ] || (mode === "light" ? "/logo.png" : "/logo-white.png");
  const description = s[ar ? "sharing.descriptionAr" : "sharing.descriptionEn"];
  const announcementColors: Record<string, string[]> = {
    info: ["var(--info-soft)", "var(--info-foreground)"],
    warning: ["var(--warning-soft)", "var(--warning-foreground)"],
    success: ["var(--success-soft)", "var(--success-foreground)"],
    brand: ["var(--primary)", "var(--primary-foreground)"],
  };
  const announcementColorsSelected =
    announcementColors[s["announcement.variant"]] ?? announcementColors.info;
  return `<!doctype html><html lang="${lang}" dir="${ar ? "rtl" : "ltr"}" data-color-mode="${mode}"><head><title>${ar ? "معاينة الإعدادات" : "Settings preview"}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${themeStyles(s)}*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--site-font);font-size:15px;line-height:1.7}header{display:flex;align-items:center;gap:12px;padding:20px;background:var(--card);border-bottom:1px solid var(--border)}img{max-width:100%;object-fit:contain}main{padding:20px}h1{font-size:22px;margin:0}h2{font-size:18px}p{color:var(--muted-foreground)}article{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px}button,input{font:inherit;border-radius:var(--radius);min-height:44px;padding:var(--control-padding) 12px}button{background:var(--primary);color:var(--primary-foreground);border:0}input{width:100%;border:1px solid var(--input);background:var(--card);color:var(--foreground);margin:8px 0 16px}table{border-collapse:collapse;width:100%}td,th{text-align:start;border-bottom:1px solid var(--border);padding:var(--row-padding) 4px}a{color:var(--primary)}.tag{background:var(--accent);color:var(--accent-foreground);padding:3px 8px;border-radius:var(--radius)}</style></head><body><header><img src="${esc(image)}" alt="${esc(name)}" width="48" height="48">${s["identity.showName"] === "false" ? "" : `<strong>${esc(name)}</strong>`}</header><main>${section === "sharing" ? `<article><small>example.invalid</small><h1><a>${esc(name)}</a></h1><p>${esc(description || (ar ? "وصف الموقع في نتائج البحث والمشاركة" : "Site description in search and sharing"))}</p>${s["sharing.image"] ? `<img src="${esc(s["sharing.image"])}" alt="" width="320">` : ""}</article>` : section === "announcement" ? `<article style="background:${announcementColorsSelected[0]};color:${announcementColorsSelected[1]}"><span class="tag">${s["announcement.enabled"] === "true" ? (ar ? "مفعّل — يخضع للجدولة" : "Enabled — subject to schedule") : ar
                  ? "غير مفعّل"
                  : "Disabled"}</span><p style="color:inherit">${esc(s[ar ? "announcement.messageAr" : "announcement.messageEn"])}</p><a style="color:inherit">${esc(s[ar ? "announcement.ctaLabelAr" : "announcement.ctaLabelEn"])}</a></article>` : `<article><span class="tag">${ar ? "معاينة" : "Preview"}</span><h1>${ar ? "تفاصيل واضحة وتجربة مريحة" : "Clear details, comfortable experience"}</h1><p>${ar ? "معاينة محلية للتعديلات قبل حفظها." : "A local preview of your changes before saving."}</p><label>${ar ? "عنوان الطلب" : "Request title"}<input value="${ar ? "تطوير الموقع" : "Website development"}" readonly></label><button type="button">${ar ? "إرسال الطلب" : "Send request"}</button> <button type="button" style="background:transparent;color:var(--digital);border:1px solid var(--digital)">${ar ? "عرض التفاصيل" : "View details"}</button></article><article><h2>${ar ? "آخر الطلبات" : "Recent requests"}</h2><table><thead><tr><th>${ar ? "الموضوع" : "Subject"}</th><th>${ar ? "الحالة" : "Status"}</th></tr></thead><tbody><tr><td>${ar ? "تصميم واجهة" : "Interface design"}</td><td><span class="tag">${ar ? "جديد" : "New"}</span></td></tr><tr><td>${ar ? "استفسار عام" : "General inquiry"}</td><td>${ar ? "تم الرد" : "Replied"}</td></tr></tbody></table></article>`}</main></body></html>`;
}
export function SettingsClient({ me, locale }: { me: Me; locale: Locale }) {
  const ar = locale === "ar",
    li = ar ? 0 : 1,
    t = getPortalContent(locale),
    ts = t.admin.settings;
  const [params, setParams] = useSearchParams();
  const section = (SETTING_SECTIONS as readonly string[]).includes(
    params.get("section") ?? "",
  )
    ? (params.get("section") as SettingSection)
    : "identity";
  const [form, setForm] = useState<Record<string, string>>({
      ...SETTINGS_DEFAULTS,
    }),
    [initial, setInitial] = useState<Record<string, string>>({
      ...SETTINGS_DEFAULTS,
    });
  const [revisions, setRevisions] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [failure, setFailure] = useState<string | null>(null),
    [applyPolicy, setApplyPolicy] = useState(false);
  const [captured, setCaptured] = useState<
      Partial<Record<SettingSection, unknown>>
    >({}),
    [blocked, setBlocked] = useState<Partial<Record<SettingSection, boolean>>>(
      {},
    );
  const [picker, setPicker] = useState<string | null>(null),
    [previewLocale, setPreviewLocale] = useState<Locale>(locale),
    [previewMode, setPreviewMode] = useState<"light" | "dark">("light");
  const summary = useRef<HTMLDivElement>(null),
    formRef = useRef(form);
  formRef.current = form;
  const normalize = (values: Record<string, string>) => {
    const next:Record<string,string> = {
      ...SETTINGS_DEFAULTS,
      "social.github": siteConfig.github,
      ...values,
    };
    for (const key of ["site.nameAr", "site.nameEn"])
      next[key] ||= SETTINGS_DEFAULTS[key];
    return next;
  };
  const load = useCallback(
    async (only?: SettingSection) => {
      if (!only) setLoading(true);
      setLoadError(null);
      try {
        const res = await apiGet<SettingsResponse>("/api/admin/settings");
        const next = normalize(res.settings);
        if (only) {
          const keys = SECTION_KEYS[only];
          setForm((p) => ({
            ...p,
            ...Object.fromEntries(keys.map((k) => [k, next[k]])),
          }));
          setInitial((p) => ({
            ...p,
            ...Object.fromEntries(keys.map((k) => [k, next[k]])),
          }));
          setRevisions((p) => ({
            ...p,
            ...Object.fromEntries(
              keys.map((k) => [k, res.revisions[k] ?? "0"]),
            ),
          }));
          setBlocked((p) => ({ ...p, [only]: false }));
        } else {
          setForm(next);
          setInitial(next);
          setRevisions(res.revisions);
        }
        setApplyPolicy(false);
      } catch (err) {
        setLoadError(apiErrorMessage(err, t.auth.errors));
      } finally {
        setLoading(false);
      }
    },
    [t.auth.errors],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const dirtySections = SETTING_SECTIONS.filter((s) =>
    SECTION_KEYS[s].some((k) => form[k] !== initial[k]),
  );
  const dirty = dirtySections.length > 0,
    currentDirty = dirtySections.includes(section);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (
        window.confirm(
          ar
            ? "لديك تعديلات غير محفوظة. هل تريد مغادرة الصفحة؟"
            : "You have unsaved changes. Leave this page?",
        )
      )
        blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, ar]);
  const label = (key: string) =>
    settingLabels[key]?.[li] ?? key.replace("social.", "");
  const errorText = (code: string) =>
    settingsErrors[code]?.[li] ??
    (ar ? "تحقق من القيمة المدخلة" : "Check the entered value");
  const set = (key: string, value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    setErrors((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });
    setFailure(null);
  };
  const save = async () => {
    const target = section,
      keys = SECTION_KEYS[target],
      snapshot = { ...formRef.current };
    const fields = Object.fromEntries(
      Object.entries(validateSiteSettings(snapshot)).filter(([k]) =>
        keys.includes(k),
      ),
    );
    setErrors(fields);
    setFailure(null);
    if (Object.keys(fields).length) {
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    const updates = Object.fromEntries(
      keys
        .filter((k) => snapshot[k] !== initial[k])
        .map((k) => [k, snapshot[k].trim()]),
    );
    if (!Object.keys(updates).length) return;
    setSaving(true);
    try {
      const res = await apiSend<SettingsResponse>(
        "/api/v1/admin/settings/checked",
        "PATCH",
        {
          ...updates,
          baseRevisions: revisions,
          ...(target === "tracking"
            ? { "response.applyToExisting": applyPolicy }
            : {}),
        },
      );
      if (
        !res.settings ||
        !res.revisions ||
        Object.keys(updates).some(
          (k) =>
            typeof res.settings[k] !== "string" ||
            typeof res.revisions[k] !== "string",
        )
      )
        throw new ApiError(200, "invalid_response", null, undefined, true);
      setInitial((p) => ({ ...p, ...res.settings }));
      setForm((p) => ({
        ...p,
        ...Object.fromEntries(
          Object.entries(res.settings).filter(([k]) => p[k] === snapshot[k]),
        ),
      }));
      setRevisions((p) => ({ ...p, ...res.revisions }));
      setApplyPolicy(false);
      toast.success(ts.saved);
      window.dispatchEvent(
        new CustomEvent("so7ob-presentation-saved", { detail: res.settings }),
      );
    } catch (err) {
      const definite =
        err instanceof ApiError && [400, 403, 422].includes(err.status);
      const body =
        err instanceof ApiError
          ? (err.body as { fields?: Record<string, string> })
          : null;
      if (body?.fields) setErrors(body.fields);
      if (!definite) {
        setCaptured((p) => ({
          ...p,
          [target]: Object.fromEntries(keys.map((k) => [k, snapshot[k]])),
        }));
        setBlocked((p) => ({ ...p, [target]: true }));
      }
      setFailure(
        apiErrorMessage(err, t.auth.errors) +
          (err instanceof ApiError && err.localId ? ` (${err.localId})` : ""),
      );
    } finally {
      setSaving(false);
    }
  };
  const reset = (defaults: boolean) => {
    if (
      window.confirm(
        defaults
          ? ar
            ? "استعادة افتراضيات هذا القسم في المسودة؟ لن تطبق قبل الحفظ."
            : "Restore this section’s defaults in the draft? Save to apply."
          : ar
            ? "التراجع عن تعديلات هذا القسم؟"
            : "Discard this section’s edits?",
      )
    ) {
      setForm((p) => ({
        ...p,
        ...Object.fromEntries(
          SECTION_KEYS[section].map((k) => [
            k,
            defaults
              ? k === "social.github"
                ? siteConfig.github
                : SETTINGS_DEFAULTS[k]
              : initial[k],
          ]),
        ),
      }));
      setErrors({});
      setApplyPolicy(false);
    }
  };
  if (loading)
    return (
      <Panel role="status" className="rounded-2xl border bg-card p-8">
        <Loader2 className="mb-3 size-6 animate-spin" />
        {ar ? "جارٍ تحميل الإعدادات…" : "Loading settings…"}
      </Panel>
    );
  if (loadError && !Object.keys(revisions).length)
    return (
      <Panel role="alert" className="space-y-4 rounded-2xl border bg-card p-6">
        <p>{loadError}</p>
        <Button onClick={() => void load()}>
          {ar ? "إعادة المحاولة" : "Retry"}
        </Button>
      </Panel>
    );
  const booleanKeys = [
    "identity.showName",
    "announcement.enabled",
    "track.forceLogin",
    "track.allowGuestAttachments",
  ];
  const field = (key: string) => {
    const id = fieldId(key),
      error = errors[key],
      value = form[key] ?? "",
      media = (IDENTITY_MEDIA_KEYS as readonly string[]).includes(key),
      color = key.startsWith("appearance.") && /primary|accent/.test(key);
    return (
      <div
        key={key}
        className={cn(
          "min-w-0 space-y-2",
          key === "contact.address" || key.startsWith("sharing.description")
            ? "sm:col-span-2"
            : "",
        )}
      >
        <Label htmlFor={id} className="text-sm font-medium">
          {label(key)}
        </Label>
        {media ? (
          <div className="space-y-3 rounded-lg border bg-background p-3">
            {value ? (
              <img
                src={value}
                alt={label(key)}
                className="h-12 max-w-full rounded bg-card p-1 object-contain"
              />
            ) : (
              <div className="flex min-h-12 items-center gap-2 text-sm text-muted-foreground">
                <ImagePlus aria-hidden="true" />
                {ar ? "استخدام الصورة الافتراضية" : "Using the default image"}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                id={id}
                variant="outline"
                disabled={!can(me, "media.manage") || saving}
                onClick={() => setPicker(key)}
              >
                {ar ? "اختيار صورة" : "Choose image"}
              </Button>
              {value && (
                <Button
                  variant="ghost"
                  disabled={saving}
                  onClick={() => set(key, "")}
                >
                  {ar ? "إزالة الاختيار" : "Clear selection"}
                </Button>
              )}
            </div>
            {!can(me, "media.manage") && (
              <p className="text-xs text-muted-foreground">
                {ar
                  ? "اختيار الصور يحتاج صلاحية إدارة الوسائط."
                  : "Selecting images requires media management permission."}
              </p>
            )}
          </div>
        ) : booleanKeys.includes(key) ? (
          <div className="flex min-h-11 items-center gap-3 px-1">
            <input
              id={id}
              type="checkbox"
              className="size-5 accent-primary"
              checked={value === "true"}
              disabled={saving}
              onChange={(e) => set(key, String(e.target.checked))}
            />
            <span className="text-sm">
              {value === "true"
                ? ar
                  ? "مفعّل"
                  : "Enabled"
                : ar
                  ? "غير مفعّل"
                  : "Disabled"}
            </span>
          </div>
        ) : settingOptions[key] ? (
          <NativeSelect
            id={id}
            className="min-h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
            value={value}
            disabled={saving}
            onChange={(e) => set(key, e.target.value)}
          >
            {settingOptions[key].map(([v, arabic, english]) => (
              <option key={v} value={v}>
                {ar ? arabic : english}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <div className="flex items-center gap-2">
            {color && (
              <input
                type="color"
                aria-label={(ar ? "منتقي " : "Picker: ") + label(key)}
                value={/^#[\da-f]{6}$/i.test(value) ? value : PALETTE_PRESETS.blue.primaryLight}
                disabled={saving}
                onChange={(e) => set(key, e.target.value)}
                className="size-11 shrink-0 cursor-pointer rounded-lg border bg-card p-1"
              />
            )}
            <Input
              id={id}
              type={
                key === "contact.email"
                  ? "email"
                  : key === "response.hours" || key === "track.linkTtlDays"
                    ? "number"
                    : key.endsWith("At")
                      ? "date"
                      : "text"
              }
              dir={
                key.endsWith("Ar")
                  ? "rtl"
                  : key.endsWith("En") ||
                      color ||
                      key.startsWith("social.") ||
                      /email|phone|Url/.test(key)
                    ? "ltr"
                    : undefined
              }
              value={key.endsWith("At") ? value.slice(0, 10) : value}
              maxLength={
                key.startsWith("announcement.message")
                  ? 280
                  : key.startsWith("announcement.ctaLabel")
                    ? 60
                    : 300
              }
              disabled={saving}
              aria-invalid={!!error}
              aria-describedby={error ? id + "-error" : undefined}
              onChange={(e) => set(key, e.target.value)}
            />
          </div>
        )}
        {error && (
          <p id={id + "-error"} className="text-sm text-destructive">
            {errorText(error)}
          </p>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <PageHeading
        title={ts.title}
        description={
          ar
            ? "إدارة هوية المنصة ومظهرها وإعداداتها."
            : "Manage your platform identity, appearance and settings."
        }
        actions={
          <Toolbar className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                disabled={saving || !currentDirty}
                onClick={() => reset(false)}
              >
                <RotateCcw className="size-4" />
                {ar ? "التراجع" : "Revert"}
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => reset(true)}
              >
                <Palette className="size-4" />
                {ar ? "استعادة الافتراضي" : "Restore defaults"}
              </Button>
            </div>
            <Button
              className="min-h-11"
              onClick={() => void save()}
              disabled={
                saving ||
                !currentDirty ||
                blocked[section] ||
                (section === "tracking" &&
                  form["response.hours"] !== initial["response.hours"] &&
                  !applyPolicy)
              }
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {ts.save}
            </Button>
          </Toolbar>
        }
        metadata={
          <span
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            {dirty ? (
            `${dirtySections.length} ${ar ? "أقسام غير محفوظة" : "unsaved sections"}`
          ) : (
            <>
              <Check className="me-1 inline size-4" />
              {ar ? "كل التعديلات محفوظة" : "All changes saved"}
            </>
          )}
          </span>
        }
      />
      <div className="space-y-6">
        <nav
          aria-label={ar ? "أقسام الإعدادات" : "Settings sections"}
          className="space-y-3"
        >
          <div className="ds-section-nav">
            {SETTING_SECTIONS.map((s) => (
              <a
                key={s}
                href={`?section=${s}`}
                aria-current={s === section ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  if (saving) return;
                  setParams({ section: s }, { replace: true });
                  setErrors({});
                  setFailure(null);
                }}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 px-4 text-sm font-medium",
                  s === section
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span>{sectionLabels[s][li]}</span>
                {dirtySections.includes(s) && (
                  <span
                    className="size-2 shrink-0 rounded-full bg-current"
                    aria-label={ar ? "تعديلات غير محفوظة" : "Unsaved changes"}
                  />
                )}
              </a>
            ))}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {ar
              ? "يُحفظ كل قسم على حدة. المعاينة لا تغيّر الموقع قبل الحفظ."
              : "Each section saves independently. Preview changes stay local until saved."}
          </p>
        </nav>
        <div className="min-w-0 space-y-4">
          <ConflictReview
            key={section}
            locale={locale}
            storageKey={`so7ob-settings-conflict:${me.id}:${section}`}
            captured={captured[section] ?? null}
            remoteUrl="/api/admin/settings"
            onReload={() => load(section)}
          />
          {(failure || loadError) && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive"
            >
              {failure || loadError}
            </p>
          )}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section
              className="ds-panel min-w-0"
              aria-labelledby="settings-section-title"
            >
              <div className="mb-6 border-b pb-4">
                <h2
                  id="settings-section-title"
                  className="text-xl font-semibold"
                >
                  {sectionLabels[section][li]}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {section === "appearance"
                    ? ar
                      ? "اختيارات موحدة للموقع وحساب العميل ولوحة الإدارة. يحتفظ الزائر باختياره لوضع العرض."
                      : "Shared across the site, accounts and administration. Visitors retain their own color-mode preference."
                    : section === "identity"
                      ? ar
                        ? "أصول الهوية من مكتبة الوسائط. الشعار الحالي بديل عند غياب صورة مخصصة."
                        : "Identity assets come from the media library. The current logo is the fallback when no custom image is set."
                      : section === "sharing"
                        ? ar
                          ? "تستخدم هذه القيم عندما لا توجد إعدادات أكثر تخصيصًا للصفحة المنشورة."
                          : "Used when a published page has no more specific metadata."
                        : section === "tracking"
                          ? ts.track.subtitle
                          : section === "announcement"
                            ? ts.announcementSubtitle
                            : ar
                              ? "تظهر الروابط غير الفارغة في تذييل الموقع."
                              : "Non-empty social links appear in the site footer."}
                </p>
              </div>
              {Object.keys(errors).length > 0 && (
                <div
                  ref={summary}
                  tabIndex={-1}
                  role="alert"
                  className="mb-5 rounded-xl border border-destructive p-4"
                >
                  <p className="font-medium">
                    {ar ? "راجع الحقول التالية" : "Review these fields"}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {Object.entries(errors).map(([key, code]) => (
                      <li key={key}>
                        <a
                          href={"#" + fieldId(key)}
                          onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(fieldId(key))?.focus();
                          }}
                          className="text-sm underline"
                        >
                          {label(key)}: {errorText(code)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {section === "appearance" && (
                <div className="mb-6">
                  <p className="mb-2 text-sm font-medium">
                    {ar ? "قوالب الألوان" : "Color presets"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(PALETTE_PRESETS).map(([key, palette]) => (
                      <Button
                        key={key}
                        variant="outline"
                        disabled={saving}
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            ...Object.fromEntries(
                              Object.entries(palette).map(([k, v]) => [
                                "appearance." + k,
                                v,
                              ]),
                            ),
                          }))
                        }
                      >
                        <span
                          className="size-4 rounded-full"
                          style={{ backgroundColor: palette.primaryLight }}
                        />
                        {
                          ({
                            blue: ["الأزرق الحالي", "Current blue"],
                            teal: ["الأخضر المزرق", "Teal"],
                            violet: ["البنفسجي", "Violet"],
                          }[key] ?? [])[li]
                        }
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                {SECTION_KEYS[section].map(field)}
              </div>
              {section === "tracking" && (
                <div className="mt-5 space-y-4 rounded-xl border bg-muted/30 p-4">
                  <p className="text-sm leading-6">
                    {ar
                      ? "تغيير مهلة الرد يعيد حساب الاستحقاق للمعاملات الحالية التي تتبع سياسة الموقع. تظل مدد مراحل المسارات المخصصة وفق إعداداتها."
                      : "Changing the response window recalculates existing records governed by site policy. Custom workflow stage deadlines retain their configured rules."}
                  </p>
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      className="mt-1 size-5 shrink-0"
                      type="checkbox"
                      checked={applyPolicy}
                      onChange={(e) => setApplyPolicy(e.target.checked)}
                    />
                    {ar
                      ? "أوافق على تطبيق المهلة الجديدة على الطلبات الحالية"
                      : "Apply the new window to existing requests"}
                  </label>
                  {initial["response.effectiveAt"] && (
                    <p className="text-xs text-muted-foreground">
                      {ar ? "آخر تغيير: " : "Last change: "}
                      <time dateTime={initial["response.effectiveAt"]}>
                        {new Date(
                          initial["response.effectiveAt"],
                        ).toLocaleString(locale)}
                      </time>
                    </p>
                  )}
                  {can(me, "workflows.view") && (
                    <a
                      className="inline-flex min-h-11 items-center gap-2 text-sm text-primary underline"
                      href={`/${locale}/admin/workflows`}
                    >
                      {ar
                        ? "مسارات العمل وتقويم الدوام"
                        : "Workflows and business calendar"}
                      <ChevronLeft className="size-4" />
                    </a>
                  )}
                </div>
              )}
              {section === "appearance" && (
                <div className="mt-6 rounded-xl border bg-muted/30 p-4">
                  <h3 className="text-sm font-semibold">
                    {ar
                      ? "فحص التباين للألوان المولّدة"
                      : "Generated palette contrast"}
                  </h3>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    {ar
                      ? "تُشتق درجات مقروءة من اختياراتك؛ قد تختلف درجة الزر عن اللون المدخل لضمان الوضوح."
                      : "Readable shades are derived from your choices; button shades may differ from the input color to preserve contrast."}
                  </p>
                  {(["light", "dark"] as const).map((mode) => (
                    <p key={mode} className="mt-2 text-sm">
                      {mode === "light"
                        ? ar
                          ? "فاتح"
                          : "Light"
                        : ar
                          ? "داكن"
                          : "Dark"}
                      :{" "}
                      {paletteChecks(form, mode).every(
                        (c) => c.ratio >= c.minimum,
                      )
                        ? ar
                          ? "اجتاز الفحص"
                          : "Passed"
                        : ar
                          ? "يحتاج تعديلًا"
                          : "Needs adjustment"}{" "}
                      ·{" "}
                      {Math.min(
                        ...paletteChecks(form, mode)
                          .filter((c) => c.minimum === 4.5)
                          .map((c) => c.ratio),
                      ).toFixed(2)}
                      :1
                    </p>
                  ))}
                </div>
              )}
            </section>
            {["identity", "appearance", "sharing", "announcement"].includes(
              section,
            ) && (
              <aside className="min-w-0 space-y-4 xl:sticky xl:top-24">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Eye className="size-4" />
                  {ar ? "معاينة قبل الحفظ" : "Preview before saving"}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NativeSelect
                    aria-label={ar ? "لغة المعاينة" : "Preview language"}
                    value={previewLocale}
                    onChange={(e) => setPreviewLocale(e.target.value as Locale)}
                    className="min-h-11 rounded-lg border bg-card px-3 text-sm"
                  >
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </NativeSelect>
                  <NativeSelect
                    aria-label={ar ? "وضع المعاينة" : "Preview color mode"}
                    value={previewMode}
                    onChange={(e) =>
                      setPreviewMode(e.target.value as "light" | "dark")
                    }
                    className="min-h-11 rounded-lg border bg-card px-3 text-sm"
                  >
                    <option value="light">{ar
                          ? "فاتح"
                          : "Light"}</option>
                    <option value="dark">{ar
                          ? "داكن"
                          : "Dark"}</option>
                  </NativeSelect>
                </div>
                <iframe
                  title={ar ? "معاينة الإعدادات" : "Settings preview"}
                  sandbox="allow-same-origin"
                  srcDoc={previewHtml(
                    form,
                    previewLocale,
                    previewMode,
                    section,
                  )}
                  className="h-[560px] w-full rounded-lg border bg-background"
                />
                <p className="text-xs text-muted-foreground">
                  {ar
                    ? "بيانات نموذجية؛ لا تُرسل أي طلبات من المعاينة."
                    : "Sample content; preview does not submit requests."}
                </p>
              </aside>
            )}
          </div>
        </div>
      </div>
      <MediaPicker
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        me={me}
        locale={locale}
        onSelect={(url) => {
          if (picker) set(picker, url);
          setPicker(null);
        }}
      />
    </div>
  );
}
