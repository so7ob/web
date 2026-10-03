import Link from '@/routing/link';
import { CheckCircle2, CircleCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPortalContent } from '@/content/portal';
import type { Locale } from '@/lib/i18n';
export function Verified({ locale, value }: { locale: Locale; value: string }) {
  const t = getPortalContent(locale).auth;
  const status = value === 'ok' ? 'ok' : value === 'already' ? 'already' : 'invalid';
  const heading = status === "ok" ? t.verifyOk : status === "already" ? t.verifyAlready : t.verifyInvalid;
  const body = status === "invalid" ? t.verifyInvalidBody : t.verifyOkBody;

  return (
    <section className="rounded-2xl border border-border bg-white p-6 text-center shadow-sm sm:p-10" role="status">
      <span
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
          status === "invalid" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
        }`}
      >
        {status === "ok" ? (
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        ) : status === "already" ? (
          <CircleCheck className="h-8 w-8" aria-hidden="true" />
        ) : (
          <ShieldX className="h-8 w-8" aria-hidden="true" />
        )}
      </span>
      <h1 className="mt-5 text-xl font-bold text-navy sm:text-2xl">{t.verifyTitle}</h1>
      <p className="mt-2 text-lg font-semibold text-navy">{heading}</p>
      <p className="mx-auto mt-3 max-w-md leading-8 text-muted-foreground">{body}</p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          asChild
          className="h-12 w-full rounded-full bg-primary px-10 text-base font-bold text-primary-foreground shadow-md shadow-brand/20 transition-all hover:bg-brand-strong sm:w-auto"
        >
          <Link href={`/${locale}/auth/login`}>{t.loginTitle}</Link>
        </Button>
        <Link href={`/${locale}`} className="text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
          {t.backHome}
        </Link>
      </div>
    </section>
  );
}
