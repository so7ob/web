import Link from "@/routing/link";
import { localePath, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { PageTitle, Panel, Toolbar } from "@/components/ui/workspace";

export function NotFound({ locale = "ar" }: { locale?: Locale }) {
  const ar = locale === "ar";
  return (
    <main id="main-content" lang={locale} dir={ar ? "rtl" : "ltr"} className="grid min-h-dvh place-items-center bg-background px-4 py-12">
      <Panel className="w-full max-w-lg text-center sm:p-10">
        <p className="mb-4 font-mono text-6xl font-bold text-primary" aria-hidden="true">404</p>
        <PageTitle>{ar ? "الصفحة غير موجودة" : "Page not found"}</PageTitle>
        <p className="my-6 text-sm leading-7 text-muted-foreground">{ar ? "الرابط الذي طلبته غير متاح أو تغيّر. يمكنك العودة إلى الموقع واختيار اللغة المناسبة." : "The page you requested is unavailable or has moved. Return to the site in your preferred language."}</p>
        <Toolbar className="justify-center">
          <Button asChild><Link href={localePath("ar")} lang="ar">العربية</Link></Button>
          <Button asChild variant="outline"><Link href={localePath("en")} lang="en">English</Link></Button>
        </Toolbar>
      </Panel>
    </main>
  );
}
