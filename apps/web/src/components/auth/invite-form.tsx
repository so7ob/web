"use client";
import {ErrorFeedback} from "@/components/errors/error-feedback";
import {ApiError} from "@/lib/errors/transport";

import { useRef, useState } from "react";
import Link from "@/routing/link";
import { useRouter } from "@/routing/navigation";
import { Loader2, Mail, MailPlus, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import type { PortalContent } from "@/content/portal/types";
import { apiFetch } from "@/components/account/api";
import { AuthCard } from "./auth-card";
import { TextField } from "./text-field";

type InviteResponse = { ok?: boolean; errors?: Record<string, string>; code?: string };

/** قبول دعوة الطاقم — الاسم وكلمة المرور فقط؛ البريد والدور من الدعوة */
export function InviteForm({ locale, t, token, nameLabel }: { locale: Locale; t: PortalContent["auth"]; token: string; nameLabel: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pending=useRef(false);
  const [failure,setFailure]=useState<ApiError|null>(null);

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (pending.current) return;
    setFailure(null);
    setFormError(null);
    setFieldErrors({});

    const errors: typeof fieldErrors = {};
    if (!name.trim()) errors.name = t.errors.required;
    if (!password) errors.password = t.errors.required;
    if (!confirm) errors.confirm = t.errors.required;
    if (password && confirm && password !== confirm) errors.confirm = t.errors.passwordMismatch;
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    pending.current=true;setSubmitting(true);
    const result = await apiFetch<InviteResponse>("/api/auth/invite", {
      method: "POST",
      body: JSON.stringify({ token, name: name.trim(), password }),
    });
    pending.current=false;setSubmitting(false);

    if (result.status === 201 && result.data.ok) {
      router.push(`/${locale}/auth/login`);
      return;
    }

    if (result.data.errors?.password) {
      setFieldErrors({ password: t.errors.passwordWeak });
    } else if(result.data.errors?.name){
      setFieldErrors({name:t.errors.nameInvalid});
    } else if (result.status === 409 && result.data.code === "email_taken") {
      setFormError(t.errors.emailTaken);
    } else if(result.data.code === "invalid_token") {
      setFormError(t.errors.invalid);
    } else if(!result.cancelled) {
      setFailure(result.error??new ApiError(result.status,"internal_error"));
    }
  }

  // بلا رمز — الدعوة غير صالحة
  if (!token) {
    return (
      <AuthCard title={t.registerTitle}>
        <div className="mt-2 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-800">
            <ShieldX className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="mt-4 font-semibold text-navy">{t.verifyInvalid}</p>
          <p className="mt-2 max-w-md leading-8 text-muted-foreground">{t.verifyInvalidBody}</p>
          <Button asChild variant="outline" className="mt-6 h-12 w-full rounded-full sm:w-auto sm:px-10">
            <Link href={`/${locale}/auth/login`}>{t.loginTitle}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-brand-strong">
          <Mail className="size-5" aria-hidden="true" />
        </span>
      }
      title={t.registerTitle}
      subtitle={t.registerSubtitle}
      footer={
        <p className="text-muted-foreground">
          {t.haveAccount}{" "}
          <Link
            href={`/${locale}/auth/login`}
            className="font-semibold text-brand underline decoration-brand/40 underline-offset-4 hover:text-brand-strong"
          >
            {t.loginTitle}
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        <ErrorFeedback focusOnError error={failure} locale={locale} operation={t.registerTitle}/>
        {formError && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {formError}
          </div>
        )}
        <TextField id="invite-name" label={nameLabel} value={name} onChange={setName} autoComplete="name" error={fieldErrors.name} maxLength={100} />
        <TextField
          id="invite-password"
          label={t.password}
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={t.passwordHint}
          error={fieldErrors.password}
        />
        <TextField
          id="invite-confirm"
          label={t.confirmPassword}
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={fieldErrors.confirm}
        />
        <Button
          type="submit"
          disabled={submitting}
          className="h-12 w-full rounded-full bg-primary text-base font-bold text-primary-foreground shadow-md shadow-brand/20 transition-all hover:bg-brand-strong"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <MailPlus className="h-5 w-5" aria-hidden="true" />}
          {t.registerButton}
        </Button>
      </form>
    </AuthCard>
  );
}
