import { AdminNavigationItem } from "../navigation-item";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { themeStyles } from "@/lib/appearance";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelHeader, PanelBody, PanelFooter, ListWorkspace, Toolbar } from "@/components/ui/workspace";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

/** Actual shared primitives, rendered without submission handlers into an isolated document. No theme writes. */
export function AppearanceSample({ locale, profile = "light" }: { locale: Locale; profile?: string }) {
  const ar = locale === "ar";
  return <div className="admin-lte" data-admin-style={profile}>
    <header className="admin-topbar flex min-h-16 items-center justify-between gap-2 border-b bg-card px-3">
      <strong>{ar ? "لوحة الإدارة" : "Administration"}</strong><Button type="button" variant="outline" size="sm">{ar ? "بحث" : "Search"}</Button>
    </header>
    <div className="flex min-w-0">
      <aside className="admin-sidebar w-24 shrink-0 p-2"><nav aria-label={ar ? "معاينة التنقل" : "Sample navigation"} className="grid gap-2">
        <AdminNavigationItem active className="whitespace-normal px-2"><button type="button">{ar ? "الرئيسية" : "Home"}</button></AdminNavigationItem>
        <AdminNavigationItem className="whitespace-normal px-2"><button type="button">{ar ? "الطلبات" : "Requests"}</button></AdminNavigationItem>
      </nav></aside>
      <main className="admin-main admin-workspace min-w-0 flex-1 space-y-4 p-3">
    <Panel>
      <PanelHeader><h1 className="text-lg font-semibold">{ar ? "معاينة المظهر" : "Appearance preview"}</h1></PanelHeader>
      <PanelBody className="space-y-3">
        <p className="text-sm text-muted-foreground">{ar ? "مكونات الإدارة الفعلية؛ بيانات نموذجية." : "Actual administration components; sample content."}</p>
        <Label htmlFor="sample-title">{ar ? "عنوان الطلب" : "Request title"}</Label>
        <Input id="sample-title" value={ar ? "تطوير الموقع" : "Website development"} readOnly />
        <Label htmlFor="sample-invalid">{ar ? "حقل غير صالح" : "Invalid field"}</Label>
        <Input id="sample-invalid" aria-invalid="true" aria-describedby="sample-error" readOnly value="" />
        <p id="sample-error" className="text-sm text-danger-foreground">{ar ? "هذا الحقل مطلوب" : "This field is required"}</p>
      </PanelBody>
      <PanelFooter className="flex flex-wrap gap-2">
        <Button type="button">{ar ? "حفظ" : "Save"}</Button>
        <Button type="button" variant="outline">{ar ? "إلغاء" : "Cancel"}</Button>
        <Button type="button" disabled aria-busy="true">{ar ? "جارٍ الحفظ…" : "Saving…"}</Button>
      </PanelFooter>
    </Panel>
    <ListWorkspace>
      <Toolbar className="ds-list-filters"><h2 className="font-semibold">{ar ? "آخر الطلبات" : "Recent requests"}</h2></Toolbar>
      <Table><TableHeader><TableRow><TableHead>{ar ? "الموضوع" : "Subject"}</TableHead><TableHead>{ar ? "الحالة" : "Status"}</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell>{ar ? "تصميم واجهة" : "Interface design"}</TableCell><TableCell>{ar ? "جديد" : "New"}</TableCell></TableRow>
          <TableRow><TableCell>{ar ? "استفسار عام" : "General inquiry"}</TableCell><TableCell>{ar ? "تم الرد" : "Replied"}</TableCell></TableRow></TableBody>
      </Table>
    </ListWorkspace>
  </main></div></div>;
}
export function AppearancePreview({ settings, locale, mode, title }: { settings: Record<string,string>; locale: Locale; mode: "light" | "dark"; title: string }) {
  const [styles, setStyles] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMount(frame.current?.contentDocument?.body ?? null);
    // Production's Vite styles and development's injected styles use the same compiled CSS.
    setStyles(Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style')).map(node => node.outerHTML).join(""));
  }, []);
  const srcDoc = `<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}" data-color-mode="${mode}" class="${mode === "dark" ? "dark" : ""}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${locale === "ar" ? "معاينة المظهر" : "Appearance preview"}</title>${styles}<style>${themeStyles(settings)}body{margin:0;font-family:var(--site-font);background:var(--background);color:var(--foreground)}</style></head><body></body></html>`;
  return <><iframe ref={frame} title={title} sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={() => setMount(frame.current?.contentDocument?.body ?? null)} className="h-[560px] w-full rounded-lg border bg-background" />{mount && createPortal(<AppearanceSample locale={locale} profile={settings["appearance.adminStyle"] ?? "light"} />, mount)}</>;
}
