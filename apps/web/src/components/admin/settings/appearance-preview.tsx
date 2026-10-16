import { AdminNavigationItem } from "../navigation-item";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { themeStyles } from "@/lib/appearance";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelHeader, PanelBody, PanelFooter, ListWorkspace, Toolbar, SmallBoxContent, InfoBoxContent } from "@/components/ui/workspace";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { PortalContainerProvider } from "@/components/ui/portal-container";
import { AppDirectionProvider } from "@/components/ui/app-direction-provider";
import { APPEARANCE_DEFAULTS, appearanceForScope, type AppearanceScope } from "@so7ob/contracts";

/** Actual shared primitives, rendered without submission handlers into an isolated document. No theme writes. */
export function AppearanceSample({ locale, profile = APPEARANCE_DEFAULTS["appearance.adminStyle"], scope = "admin" }: { locale: Locale; profile?: string; scope?: AppearanceScope }) {
  const ar = locale === "ar";
  const [active, setActive] = useState("home");
  const [saved, setSaved] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  return <div className={scope === "admin" ? "admin-lte" : "site-appearance-sample"} data-admin-style={scope === "admin" ? profile : undefined}>
    <header className={`${scope === "admin" ? "admin-topbar" : ""} flex min-h-(--header-height) items-center justify-between gap-2 border-b bg-card px-3`}>
      <strong>{scope === "admin" ? ar ? "لوحة الإدارة" : "Administration" : ar ? "سُحُب" : "So7ob"}</strong><Dialog><DialogTrigger asChild><Button type="button" variant="outline" size="sm">{ar ? "بحث" : "Search"}</Button></DialogTrigger>
        <DialogContent><DialogHeader><DialogTitle>{ar ? "معاينة الحوار" : "Dialog preview"}</DialogTitle><DialogDescription>{ar ? "تستخدم هذه المعاينة المكونات الفعلية. إجراءاتها محلية فقط." : "This preview uses the actual components. Its actions stay local."}</DialogDescription></DialogHeader></DialogContent>
      </Dialog>
    </header>
    <div className="flex min-w-0">
      {scope === "admin" && <aside className="admin-sidebar w-24 shrink-0 p-2"><nav aria-label={ar ? "معاينة التنقل" : "Sample navigation"} className="grid gap-2">
        <AdminNavigationItem active={active === "home"} className="whitespace-normal px-2"><button type="button" onClick={() => setActive("home")}>{ar ? "الرئيسية" : "Home"}</button></AdminNavigationItem>
        <AdminNavigationItem active={active === "requests"} className="whitespace-normal px-2"><button type="button" onClick={() => setActive("requests")}>{ar ? "الطلبات" : "Requests"}</button></AdminNavigationItem>
      </nav></aside>}
      <main className="admin-main admin-workspace min-w-0 flex-1 space-y-4 p-3">
    <div className="ds-small-box" data-tone="primary"><SmallBoxContent value={4} label={ar ? "الطلبات المفتوحة" : "Open requests"} icon={null} /></div>
    <div className="ds-info-box"><InfoBoxContent icon={<span>✓</span>} label={ar ? "طلبات مكتملة" : "Completed requests"} value={12} tone="ds-metric-success" /></div>
    <Panel>
      <PanelHeader><h1 className="text-lg font-semibold">{scope === "admin" ? ar ? "معاينة مظهر الإدارة" : "Administration preview" : ar ? "معاينة مظهر الموقع" : "Site preview"}</h1></PanelHeader>
      <PanelBody className="space-y-3">
        <p className="text-sm text-muted-foreground">{ar ? "مكونات الإدارة الفعلية؛ بيانات نموذجية." : "Actual administration components; sample content."}</p>
        <Label htmlFor="sample-title">{ar ? "عنوان الطلب" : "Request title"}</Label>
        <Input id="sample-title" value={title ?? (ar ? "تطوير الموقع" : "Website development")} onChange={event => { setTitle(event.target.value); setSaved(false); }} />
        <Label htmlFor="sample-invalid">{ar ? "حقل غير صالح" : "Invalid field"}</Label>
        <Input id="sample-invalid" aria-invalid="true" aria-describedby="sample-error" readOnly value="" />
        <p id="sample-error" className="text-sm text-danger-foreground">{ar ? "هذا الحقل مطلوب" : "This field is required"}</p>
        <Label htmlFor="sample-priority">{ar ? "الأولوية" : "Priority"}</Label>
        <NativeSelect id="sample-priority"><option>{ar ? "عادية" : "Normal"}</option><option>{ar ? "مرتفعة" : "High"}</option></NativeSelect>
        <div className="flex items-center gap-2"><Checkbox id="sample-check" /><Label htmlFor="sample-check">{ar ? "تحديد الطلب" : "Select request"}</Label></div>
        <div className="flex items-center gap-2"><Switch id="sample-switch" /><Label htmlFor="sample-switch">{ar ? "الإشعارات" : "Notifications"}</Label></div>
      </PanelBody>
      <PanelFooter className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setSaved(true)}>{ar ? "حفظ" : "Save"}</Button>
        <Button type="button" variant="outline" onClick={() => { setTitle(null); setSaved(false); }}>{ar ? "إلغاء" : "Cancel"}</Button>
        <Button type="button" disabled aria-busy="true">{ar ? "جارٍ الحفظ…" : "Saving…"}</Button>
      </PanelFooter>
      {saved && <p role="status" className="p-3 text-sm text-success-foreground">{ar ? "تم تنفيذ الإجراء داخل المعاينة فقط." : "Action completed inside the preview only."}</p>}
    </Panel>
    <Tabs defaultValue="recent"><TabsList aria-label={ar ? "أقسام المعاينة" : "Preview sections"}><TabsTrigger value="recent">{ar ? "الأخيرة" : "Recent"}</TabsTrigger><TabsTrigger value="activity">{ar ? "النشاط" : "Activity"}</TabsTrigger></TabsList><TabsContent value="recent"><Badge>{ar ? "جديد" : "New"}</Badge></TabsContent><TabsContent value="activity"><p className="ds-callout bg-card p-3 text-sm">{ar ? "لا توجد أنشطة جديدة." : "No new activity."}</p></TabsContent></Tabs>
    <ListWorkspace>
      <Toolbar className="ds-list-filters"><h2 className="font-semibold">{ar ? "آخر الطلبات" : "Recent requests"}</h2></Toolbar>
      <Table><TableHeader><TableRow><TableHead>{ar ? "الموضوع" : "Subject"}</TableHead><TableHead>{ar ? "الحالة" : "Status"}</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell>{ar ? "تصميم واجهة" : "Interface design"}</TableCell><TableCell><Badge>{ar ? "جديد" : "New"}</Badge></TableCell></TableRow>
          <TableRow><TableCell>{ar ? "استفسار عام" : "General inquiry"}</TableCell><TableCell>{ar ? "تم الرد" : "Replied"}</TableCell></TableRow></TableBody>
      </Table>
    </ListWorkspace>
  </main></div><footer className={`${scope === "admin" ? "admin-footer" : "bg-card"} border-t px-3 py-3 text-sm`}>{ar ? "سُحُب · إدارة المنصة" : "So7ob · Platform administration"}</footer></div>;
}
export function AppearancePreview({ settings, locale, mode, title, scope = "admin" }: { settings: Record<string,string>; locale: Locale; mode: "light" | "dark"; title: string; scope?: AppearanceScope }) {
  const scoped = appearanceForScope(settings, scope);
  const [styles, setStyles] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMount(frame.current?.contentDocument?.body ?? null);
    // Production's Vite styles and development's injected styles use the same compiled CSS.
    setStyles(Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style')).map(node => node.outerHTML).join(""));
  }, []);
  const srcDoc = `<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}" data-color-mode="${mode}" class="${mode === "dark" ? "dark" : ""}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${locale === "ar" ? "معاينة المظهر" : "Appearance preview"}</title>${styles}<style>${themeStyles(scoped)}body{margin:0;font-family:var(--site-font);background:var(--background);color:var(--foreground)}</style></head><body></body></html>`;
  return <><iframe ref={frame} title={title} sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={() => setMount(frame.current?.contentDocument?.body ?? null)} className="h-[560px] w-full rounded-lg border bg-background" />{mount && createPortal(<PortalContainerProvider container={mount}><AppDirectionProvider dir={locale === "ar" ? "rtl" : "ltr"}><AppearanceSample locale={locale} scope={scope} profile={scoped["appearance.adminStyle"] ?? APPEARANCE_DEFAULTS["appearance.adminStyle"]} /></AppDirectionProvider></PortalContainerProvider>, mount)}</>;
}
