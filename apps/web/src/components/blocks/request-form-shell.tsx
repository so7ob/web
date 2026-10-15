"use client";

import { useRouteLoaderData } from "react-router-dom";
import type { PublicView } from "@so7ob/contracts";
import { FlaskConical } from "lucide-react";
import { ProjectRequestForm } from "@/components/form/project-request-form";
import { ar } from "@/content/ar";
import { en } from "@/content/en";
import type { Locale } from "@/lib/i18n";
import { useRenderMode } from "./nested-context";

/**
 * غلاف تفاعلي لنموذج طلب المشروع: تمرير افتراض الخدمة وهوية صاحب مسودة التبويب
 * دون كتابة الافتراضات داخل URL أو استبدال المدخلات المستعادة.
 *
 * وضع الاختبار (test): يعرض شارة واضحة ويحاكي الإرسال — لا يصل أي طلب
 * حقيقي إلى الخادم. وضع live كما هو تمامًا.
 */
export function RequestFormShell({ locale, preselectService }: { locale: Locale; preselectService?: string }) {
  const content = locale === "en" ? en : ar;
  const root = useRouteLoaderData<PublicView>('root');
  const mode = useRenderMode();
  const simulate = mode === "test";
  const draftOwner = root?.viewer ? `user:${root.viewer.id}` : 'guest';

  if (simulate) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 rounded-xl border border-warning-border bg-warning-soft px-4 py-2.5 text-xs font-semibold text-warning-foreground">
          <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
          {locale === "en"
            ? "Interaction test — submission is simulated, no real request is sent."
            : "اختبار تفاعل — الإرسال محاكى ولا يُرسل أي طلب حقيقي."}
        </p>
        <ProjectRequestForm locale={locale} content={content} preselectService={preselectService} simulate suppressLocalDraft />
      </div>
    );
  }

  return <ProjectRequestForm key={draftOwner} locale={locale} content={content} preselectService={preselectService} draftOwner={draftOwner} />;
}
