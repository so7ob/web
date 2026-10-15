"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { NativeSelect } from "@/components/ui/native-select";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "@/routing/navigation";
import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert, ExternalLink, Copy, Check } from "lucide-react";
import {
  BUDGET_TIERS,
  CONTACT_METHODS,
  CURRENCIES,
  REQUEST_TYPES,
  SERVICE_TYPES,
  TIMELINES,
  validateProjectRequest,
  type FieldErrors,
  type ProjectRequestInput,
} from "@/lib/validation";
import type { Locale } from "@/lib/i18n";
import type { SiteContent } from "@/content/types";

import { getPortalContent } from "@/content/portal";

import { clearRequestDraft, readRequestDraft, sanitizeRequestDraft, writeRequestDraft } from "./request-draft";

type FormState = Omit<ProjectRequestInput, "startedAt">;

export interface ProjectRequestFormProps {
  locale: Locale;
  content: SiteContent;
  /** قيم مبدئية (مسودة الخادم مثلًا) — تُطبق مرة واحدة عند التحميل */
  initialValues?: Partial<ProjectRequestInput>;
  /** يُستدعى بعد نجاح الحفظ في الخادم مع الرقم المرجعي */
  onSubmitted?: (refCode: string) => void;
  /** يُستدعى عند تغيّير القيم (بمهلة قصيرة) — للحفظ التلقائي الخارجي */
  onValuesChange?: (values: Partial<ProjectRequestInput>) => void;
  /** تخطي مسودة التبويب (قراءة وكتابة) — للحسابات المسجلة التي تستخدم مسودات الخادم */
  suppressLocalDraft?: boolean;
  /** Explicit editor test mode: validation runs but submission never reaches the API. */
  simulate?: boolean;
  /** Browser draft scope uses only the authenticated viewer ID, never contact details. */
  draftOwner?: string;
  preselectService?: string;
}

const EMPTY: FormState = {
  requestType: "discussion",
  serviceType: "unsure",
  description: "",
  budget: "unspecified",
  currency: "",
  timeline: "flexible",
  name: "",
  company: "",
  email: "",
  phone: "",
  preferredContact: "any",
  referenceUrl: "",
  website: "",
  locale: "ar",
};

/**
 * نموذج طلب المشروع — تحقق في الواجهة بالمنطق المشترك نفسه المستخدم في الخادم،
 * حفظ مسودة مؤقتة لهذا التبويب، منع الإرسال المتكرر، ولا يُعرض نجاح إلا بعد تأكيد الحفظ من الخادم.
 * الخصائص الإضافية اختيارية كليًا: غيابها يحافظ على السلوك العام كما هو.
 */
export function ProjectRequestForm({
  locale,
  content,
  initialValues,
  onSubmitted,
  onValuesChange,
  suppressLocalDraft = false,
  simulate = false,
  draftOwner = "guest",
  preselectService,
}: ProjectRequestFormProps) {
  const t = content.form;
  const params = useSearchParams();
  const mountedAt = useRef(Date.now());

  // مرجع دائم لأحدث نسخة من المستمع — يفصل هوية الدالة عن دورة أثر التغيير
  const valuesChangeListener = useRef(onValuesChange);
  useEffect(() => {
    valuesChangeListener.current = onValuesChange;
  }, [onValuesChange]);

  const [data, setData] = useState<FormState>({ ...EMPTY, locale });
  const latestData = useRef<FormState>({ ...EMPTY, locale });
  const edited = useRef(false);
  const finished = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const initializedOwner = useRef<string | null>(null);
  const initialApplied = useRef(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<{ kind: "invalid" | "duplicate" | "rateLimited" | "generic"; message: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [refCode, setRefCode] = useState("");
  const [restored, setRestored] = useState(false);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackT = getPortalContent(locale).track;

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );



  // Current edits > restored draft > explicit URL prefill > CMS default > empty.
  // Locale changes only translate this mounted form; they never reapply defaults.
  useEffect(() => {
    const owner = suppressLocalDraft ? 'server' : draftOwner;
    if (initializedOwner.current === owner) {
      const next = { ...latestData.current, locale };
      latestData.current = next; setData(next);
      return;
    }
    initializedOwner.current = owner;
    initialApplied.current = Boolean(initialValues);
    edited.current = false; finished.current = false;
    const restoredDraft = suppressLocalDraft ? { values: {}, available: true } : readRequestDraft(draftOwner);
    const defaults = { ...sanitizeRequestDraft({ serviceType: preselectService }), ...sanitizeRequestDraft({ requestType: params.get('type'), serviceType: params.get('service') }) };
    const next = { ...EMPTY, ...defaults, ...sanitizeRequestDraft(initialValues), ...restoredDraft.values, locale };
    latestData.current = next; setData(next);
    setStorageAvailable(restoredDraft.available);
    setRestored(Object.keys(restoredDraft.values).length > 0);
  }, [locale, draftOwner, suppressLocalDraft, params, preselectService, initialValues]);

  useEffect(() => {
    if (!suppressLocalDraft || initialApplied.current || !initialValues) return;
    initialApplied.current = true;
    if (!edited.current) {
      const next = { ...latestData.current, ...sanitizeRequestDraft(initialValues), locale };
      latestData.current = next; setData(next);
    }
  }, [initialValues, locale, suppressLocalDraft]);

  // External account autosaves retain their debounce, but cannot outlive success/reset/unmount.
  useEffect(() => {
    if (!edited.current || finished.current || status !== 'idle' || !valuesChangeListener.current) return;
    saveTimer.current = setTimeout(() => {
      if (!finished.current && edited.current) valuesChangeListener.current?.({ ...latestData.current, website: '' });
    }, 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [data, status]);

  const currencyNeeded = data.budget !== "unspecified";
  const errorFor = (field: keyof FormState) => (errors[field] ? t.errors[errors[field] as keyof typeof t.errors] : undefined);
  const describedBy = (field: string, hasError: boolean) => (hasError ? `${field}-error` : undefined);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    const next = { ...latestData.current, [key]: value };
    edited.current = true; latestData.current = next; setData(next);
    if (!suppressLocalDraft) setStorageAvailable(writeRequestDraft(draftOwner, next));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (status === "submitting") return; // منع الإرسال المتكرر غير المقصود
    setServerError(null);
    setRestored(false);

    const result = validateProjectRequest({ ...data, startedAt: mountedAt.current });
    if (!result.ok) {
      setErrors(result.errors);
      // تركيز أول حقل خطأ
      const first = Object.keys(result.errors)[0];
      document.getElementById(first)?.focus();
      return;
    }

    const submittedDraft = sanitizeRequestDraft(data);
    setStatus("submitting");
    if (simulate) {
      const simulatedRef = `TEST-${Date.now().toString(36).toUpperCase()}`;
      finished.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setRefCode(simulatedRef); setStatus("success"); onSubmitted?.(simulatedRef);
      return;
    }
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.data, startedAt: mountedAt.current }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.ok && body.ok && typeof body.ref === "string") {
        finished.current = true;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (!suppressLocalDraft) clearRequestDraft(draftOwner, submittedDraft);
        setRefCode(body.ref);
        setTrackUrl(typeof body.trackUrl === "string" ? body.trackUrl : null);
        // The account parent owns its success state after draft cleanup completes.
        if (onSubmitted) onSubmitted(body.ref);
        else setStatus("success");
        document.getElementById("form-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (res.status === 400 && body.errors) {
        setErrors(body.errors as FieldErrors);
        setServerError({ kind: "invalid", message: t.serverErrors.invalid });
      } else if (res.status === 409) {
        setServerError({ kind: "duplicate", message: t.serverErrors.duplicate });
      } else if (res.status === 429) {
        setServerError({ kind: "rateLimited", message: t.serverErrors.rateLimited });
      } else {
        setServerError({ kind: "generic", message: t.serverErrors.generic });
      }
    } catch {
      setServerError({ kind: "generic", message: t.serverErrors.generic });
    }
    setStatus("idle");
  }

  function resetForm() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!suppressLocalDraft) clearRequestDraft(draftOwner);
    edited.current = false; finished.current = false;
    const next = { ...EMPTY, locale }; latestData.current = next; setData(next);
    setRestored(false);
    setErrors({});
    setRefCode("");
    setTrackUrl(null);
    setCopied(false);
    setStatus("idle");
    mountedAt.current = Date.now();
  }

  /** الرابط المطلق للحالة الراهنة — يُستدعى من معالجات النقر فقط (آمن للترطيب) */
  function absoluteTrackUrl(): string {
    if (!trackUrl) return "";
    if (!trackUrl.startsWith("/")) return trackUrl;
    return typeof window !== "undefined" ? `${window.location.origin}${trackUrl}` : trackUrl;
  }

  function openTracking() {
    const url = absoluteTrackUrl();
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function copyTracking() {
    const absolute = absoluteTrackUrl();
    if (!absolute) return;
    // احتياطي النسخ عبر textarea عند غياب/رفض واجهة الحافظة — فشل نهائي صامت
    const legacyCopy = () => {
      try {
        const area = document.createElement("textarea");
        area.value = absolute;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
        return true;
      } catch {
        return false;
      }
    };
    (navigator.clipboard ? navigator.clipboard.writeText(absolute) : Promise.reject(new Error("clipboard unavailable")))
      .then(() => setCopied(true))
      .catch(() => {
        if (legacyCopy()) setCopied(true);
        else console.warn("clipboard copy unavailable");
      });
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  const errorCount = useMemo(() => Object.values(errors).filter(Boolean).length, [errors]);

  if (status === "success") {
    return (
      <div className="rounded-3xl border border-success-border bg-card p-8 text-center sm:p-12" role="status">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success-foreground">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-2xl font-bold text-navy">{t.success.title}</h2>
        <p className="mx-auto mt-3 max-w-md leading-8 text-muted-foreground">{t.success.body}</p>
        <p className="mt-6 inline-flex items-center gap-3 rounded-xl bg-success-soft px-5 py-3 text-success-foreground" dir={locale === "ar" ? "rtl" : "ltr"}>
          <span className="text-sm font-semibold">{t.success.refLabel}:</span>
          <span className="ltr-isolate font-mono text-lg font-bold tracking-wide">{refCode}</span>
        </p>
        {trackUrl ? (
          <div className="mx-auto mt-6 max-w-md rounded-2xl border border-brand/30 bg-accent/50 p-4 text-start">
            <p className="text-sm leading-7 text-muted-foreground">{trackT.trackingHint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openTracking}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-brand/20 transition-colors hover:bg-primary-hover hover:text-primary-hover-foreground"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {trackT.openTracking}
              </button>
              <button
                type="button"
                onClick={copyTracking}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold text-navy transition-colors hover:border-brand hover:text-brand"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? trackT.copied : trackT.copyTracking}
              </button>
            </div>
          </div>
        ) : (
          <p className="mx-auto mt-6 max-w-md text-sm leading-7 text-muted-foreground">{trackT.trackingUnavailable}</p>
        )}
        <div className="mt-8">
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-navy transition-colors hover:border-brand hover:text-brand"
          >
            {t.success.another}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="form-title">
      <span id="form-top" className="sr-only">{t.title}</span>
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-9">
        <h2 id="form-title" className="text-xl font-bold text-navy">{t.title}</h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.requiredNote}</p>

        {!suppressLocalDraft && storageAvailable && (
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {locale === "ar" ? "يمكن استعادة المسودة في هذا التبويب خلال 30 دقيقة من آخر تعديل. تُمسح عند تغيير الحساب أو إرسال الطلب." : "This tab can restore your draft within 30 minutes of your last edit. It is cleared when your account changes or the request is sent."}
          </p>
        )}

        {restored && (
          <p className="mt-4 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-brand-strong" role="status">
            {locale === "ar" ? "استُعيدت مسودة مؤقتة من هذا التبويب." : "A temporary draft was restored from this tab."}
          </p>
        )}

        {!suppressLocalDraft && !storageAvailable && (
          <p className="mt-4 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-brand-strong" role="status">
            {locale === "ar" ? "التخزين غير متاح. تبقى المدخلات عند تبديل اللغة في هذا التبويب، وقد تُفقد عند تحديثه أو إغلاقه." : "Storage is unavailable. Language changes in this tab retain your input, but refreshing or closing it may lose it."}
          </p>
        )}

        {serverError && (
          <div
            role="alert"
            className={`mt-5 flex items-start gap-3 rounded-xl p-4 text-sm font-medium leading-7 ${
              serverError.kind === "duplicate"
                ? "bg-warning-soft text-warning-foreground"
                : serverError.kind === "rateLimited"
                  ? "bg-warning-soft text-warning-foreground"
                  : "bg-danger-soft text-danger-foreground"
            }`}
          >
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            {serverError.message}
          </div>
        )}

        {errorCount > 0 && (
          <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger-foreground">
            {locale === "ar"
              ? `يوجد ${errorCount} حقل يحتاج مراجعة — الحقول المعنية معلَّمة بالأسفل.`
              : `${errorCount} field${errorCount > 1 ? "s" : ""} need attention — highlighted below.`}
          </p>
        )}

        <div className="mt-7 grid gap-6 sm:grid-cols-2">
          {/* نوع الطلب */}
          <Field label={t.requestTypeLabel} htmlFor="requestType" required>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.requestTypeLabel}>
              {REQUEST_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  role="radio"
                  aria-checked={data.requestType === rt}
                  onClick={() => set("requestType", rt)}
                  className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                    data.requestType === rt
                      ? "border-brand bg-accent text-brand-strong"
                      : "border-border bg-card text-muted-foreground hover:border-brand/50"
                  }`}
                >
                  {t.requestTypes[rt]}
                </button>
              ))}
            </div>
          </Field>

          {/* نوع الخدمة */}
          <Field label={t.serviceLabel} htmlFor="serviceType" required error={errorFor("serviceType")} errorId="serviceType-error">
            <NativeSelect
              id="serviceType"
              value={data.serviceType}
              onChange={(e) => set("serviceType", e.target.value as FormState["serviceType"])}
              aria-invalid={Boolean(errors.serviceType)}
              aria-describedby={describedBy("serviceType", Boolean(errors.serviceType))}
              className={selectClass(Boolean(errors.serviceType))}
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>{t.services[s]}</option>
              ))}
            </NativeSelect>
          </Field>

          {/* وصف الاحتياج */}
          <Field label={t.descriptionLabel} htmlFor="description" required error={errorFor("description")} errorId="description-error" hint={t.descriptionHint} full>
            <Textarea
              id="description"
              rows={5}
              maxLength={LIMIT_MAX}
              value={data.description}
              onChange={(e) => set("description", e.target.value)}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={describedBy("description", Boolean(errors.description))}
              className={`${selectClass(Boolean(errors.description))} resize-y leading-8`}
            />
            <p className="mt-1.5 text-xs text-muted-foreground ltr-isolate">
              {data.description.length} / {LIMIT_MAX}
            </p>
          </Field>

          {/* الميزانية والعملة */}
          <Field label={t.budgetLabel} htmlFor="budget" required error={errorFor("budget")} errorId="budget-error">
            <NativeSelect
              id="budget"
              value={data.budget}
              onChange={(e) => {
                const v = e.target.value as FormState["budget"];
                set("budget", v);
                if (v === "unspecified") set("currency", "");
              }}
              aria-invalid={Boolean(errors.budget)}
              aria-describedby={describedBy("budget", Boolean(errors.budget))}
              className={selectClass(Boolean(errors.budget))}
            >
              {BUDGET_TIERS.map((b) => (
                <option key={b} value={b}>{t.budgets[b]}</option>
              ))}
            </NativeSelect>
          </Field>

          {currencyNeeded ? (
            <Field label={t.currencyLabel} htmlFor="currency" required error={errorFor("currency")} errorId="currency-error">
              <NativeSelect
                id="currency"
                value={data.currency}
                onChange={(e) => set("currency", e.target.value as FormState["currency"])}
                aria-invalid={Boolean(errors.currency)}
                aria-describedby={describedBy("currency", Boolean(errors.currency))}
                className={selectClass(Boolean(errors.currency))}
              >
                <option value="">{t.choose}</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{t.currencies[c]}</option>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <div className="hidden sm:block" aria-hidden="true" />
          )}

          {/* الموعد المستهدف */}
          <Field label={t.timelineLabel} htmlFor="timeline" required error={errorFor("timeline")} errorId="timeline-error">
            <NativeSelect
              id="timeline"
              value={data.timeline}
              onChange={(e) => set("timeline", e.target.value as FormState["timeline"])}
              aria-invalid={Boolean(errors.timeline)}
              aria-describedby={describedBy("timeline", Boolean(errors.timeline))}
              className={selectClass(Boolean(errors.timeline))}
            >
              {TIMELINES.map((tl) => (
                <option key={tl} value={tl}>{t.timelines[tl]}</option>
              ))}
            </NativeSelect>
          </Field>

          {/* الاسم */}
          <Field label={t.nameLabel} htmlFor="name" required error={errorFor("name")} errorId="name-error">
            <Input
              id="name"
              type="text"
              autoComplete="name"
              value={data.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={describedBy("name", Boolean(errors.name))}
              className={selectClass(Boolean(errors.name))}
            />
          </Field>

          {/* الشركة */}
          <Field label={t.companyLabel} htmlFor="company" optional optionalLabel={t.optional}>
            <Input
              id="company"
              type="text"
              autoComplete="organization"
              value={data.company}
              onChange={(e) => set("company", e.target.value)}
              className={selectClass(false)}
            />
          </Field>

          {/* البريد */}
          <Field label={t.emailLabel} htmlFor="email" required error={errorFor("email")} errorId="email-error">
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              value={data.email}
              onChange={(e) => set("email", e.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={describedBy("email", Boolean(errors.email))}
              className={`${selectClass(Boolean(errors.email))} ltr-isolate text-start`}
            />
          </Field>

          {/* الهاتف */}
          <Field label={t.phoneLabel} htmlFor="phone" optional optionalLabel={t.optional} error={errorFor("phone")} errorId="phone-error">
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={data.phone}
              onChange={(e) => set("phone", e.target.value)}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={describedBy("phone", Boolean(errors.phone))}
              className={`${selectClass(Boolean(errors.phone))} ltr-isolate text-start`}
            />
          </Field>

          {/* وسيلة التواصل المفضلة */}
          <Field label={t.preferredContactLabel} htmlFor="preferredContact" required error={errorFor("preferredContact")} errorId="preferredContact-error">
            <NativeSelect
              id="preferredContact"
              value={data.preferredContact}
              onChange={(e) => set("preferredContact", e.target.value as FormState["preferredContact"])}
              aria-invalid={Boolean(errors.preferredContact)}
              aria-describedby={describedBy("preferredContact", Boolean(errors.preferredContact))}
              className={selectClass(Boolean(errors.preferredContact))}
            >
              {CONTACT_METHODS.map((m) => (
                <option key={m} value={m}>{t.contactMethods[m]}</option>
              ))}
            </NativeSelect>
          </Field>

          {/* رابط مرجعي */}
          <Field label={t.referenceUrlLabel} htmlFor="referenceUrl" optional optionalLabel={t.optional} error={errorFor("referenceUrl")} errorId="referenceUrl-error">
            <Input
              id="referenceUrl"
              type="url"
              inputMode="url"
              dir="ltr"
              placeholder="https://"
              value={data.referenceUrl}
              onChange={(e) => set("referenceUrl", e.target.value)}
              aria-invalid={Boolean(errors.referenceUrl)}
              aria-describedby={describedBy("referenceUrl", Boolean(errors.referenceUrl))}
              className={`${selectClass(Boolean(errors.referenceUrl))} ltr-isolate text-start`}
            />
          </Field>
        </div>

        {/* حقل العسل — مخفي عن المستخدمين */}
        <div className="absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
          <label htmlFor="website">{t.honeyLabel}</label>
          <Input id="website" type="text" tabIndex={-1} autoComplete="off" value={data.website} onChange={(e) => set("website", e.target.value)} />
        </div>

        <div className="mt-9 flex flex-col items-start gap-5 border-t border-border pt-7 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={status === "submitting"}
            className="inline-flex min-h-13 items-center justify-center gap-2.5 rounded-full bg-primary px-8 text-base font-bold text-primary-foreground shadow-md shadow-brand/20 transition-[color,background-color,border-color,box-shadow,opacity,transform] hover:bg-primary-hover hover:text-primary-hover-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                {t.submitting}
              </>
            ) : (
              t.submit
            )}
          </button>
          <p className="flex max-w-sm items-start gap-2 text-xs leading-6 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            {content.contact.privacyBody}
          </p>
        </div>
      </div>
    </form>
  );
}

const LIMIT_MAX = 5000;

const selectClass = (invalid: boolean) =>
  `w-full rounded-xl border bg-card px-4 py-3 text-[15px] text-foreground shadow-sm transition-colors placeholder:text-muted-foreground ${
    invalid ? "border-danger-border focus:border-danger-border" : "border-input focus:border-brand"
  } min-h-11`;

function Field({
  label,
  htmlFor,
  required,
  optional,
  optionalLabel = "optional",
  error,
  errorId,
  hint,
  full,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  optionalLabel?: string;
  error?: string;
  errorId?: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-navy">
        {label} {required && <span className="text-danger-foreground" aria-hidden="true">*</span>}
        {optional && <span className="ms-1 text-xs font-normal text-muted-foreground">({optionalLabel})</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{hint}</p>}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium leading-6 text-danger-foreground">
          <TriangleAlert className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export function SuspenseFallback() {
  return (
    <div className="animate-pulse rounded-3xl border border-border bg-card p-9">
      <div className="h-6 w-40 rounded bg-muted" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-11 rounded-xl bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
