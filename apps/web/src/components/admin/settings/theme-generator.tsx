import { type CSSProperties, useState } from "react";
import { ADMINLTE_THEME_PRESETS, ADMINLTE_PALETTES, ADMINLTE_BASE_COLORS, ADMINLTE_CHROME_KEYS, adminltePresetSettings, appearanceTokens } from "@so7ob/contracts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/workspace";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import type { Locale } from "@/lib/i18n";

const arabicNames: Record<string, string> = {
  Light: "فاتح", Default: "الافتراضي", Graphite: "جرافيت", Navy: "كحلي", Steel: "فولاذي", Midnight: "منتصف الليل", Indigo: "نيلي",
  "Light & indigo": "فاتح ونيلي", "Light & sky": "فاتح وسماوي", "Navy & sky": "كحلي وسماوي", "Midnight mono": "منتصف الليل الموحّد",
  "Steel mono": "فولاذي موحّد", "Slate & teal": "أردوازي وفيروزي", "Graphite & orange": "جرافيت وبرتقالي", "Violet mono": "بنفسجي موحّد",
  "Gradient indigo": "تدرج نيلي", "Gradient teal": "تدرج فيروزي", Blue: "أزرق", Black: "أسود", Purple: "أرجواني", Green: "أخضر", Red: "أحمر", Yellow: "أصفر",
  orange: "برتقالي", amber: "كهرماني", olive: "زيتوني", teal: "فيروزي", sky: "سماوي", indigo: "نيلي", violet: "بنفسجي", fuchsia: "فوشي", pink: "وردي", navy: "كحلي", steel: "فولاذي", slate: "أردوازي", graphite: "جرافيت", midnight: "منتصف الليل",
  lightblue: "أزرق فاتح", lime: "ليموني", maroon: "عنابي", blue: "أزرق", purple: "أرجواني", red: "أحمر", yellow: "أصفر", green: "أخضر", cyan: "سماوي", gray: "رمادي", "gray-dark": "رمادي داكن",
  primary: "أساسي", secondary: "ثانوي", success: "نجاح", danger: "خطر", warning: "تحذير", info: "معلومات", light: "فاتح", dark: "داكن", black: "أسود", white: "أبيض",
};

/** Draft controls share the server-validated, pinned palette catalog. */
export function ThemeGenerator({ settings, locale, disabled, onChange }: {
  settings: Record<string, string>; locale: Locale; disabled: boolean; onChange: (patch: Record<string, string>) => void;
}) {
  const ar = locale === "ar";
  const [sampleSaved, setSampleSaved] = useState(false);
  const primary = settings["appearance.primaryLight"] ?? ADMINLTE_BASE_COLORS.primary;
  const sampleTokens = appearanceTokens(settings, "light");
  const sampleStyle = Object.fromEntries(Object.entries(sampleTokens).map(([key,value]) => ["--"+key,value])) as CSSProperties;
  const [family, setFamily] = useState<"designed" | "v3">("designed");
  const name = (value: string) => ar ? arabicNames[value] ?? value : value;
  const presetName = (value: string) => ar && value.endsWith(" light") ? `${name(value.slice(0, -6))} مع شريط فاتح` : name(value);
  const palettes = Object.entries(ADMINLTE_PALETTES);
  return <div className="mb-6 space-y-5">
    <div>
      <h3 className="mb-2 text-lg">{ar ? "ثيمات AdminLTE" : "AdminLTE themes"}</h3>
      <div role="group" aria-label={ar ? "مجموعة الألوان" : "Palette family"} className="mb-3 flex flex-wrap gap-2">
        {(["designed", "v3"] as const).map(key => <Button key={key} type="button" variant={family === key ? "default" : "outline"} aria-pressed={family === key} disabled={disabled} onClick={() => setFamily(key)}>
          {key === "designed" ? ar ? "الألوان المصمّمة لـ AdminLTE 4" : "AdminLTE 4 designed palette" : ar ? "ألوان AdminLTE 3 الأصلية" : "AdminLTE 3 originals"}
        </Button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ADMINLTE_THEME_PRESETS.filter(preset => preset.family === family).map(preset => {
          const patch = adminltePresetSettings(preset);
          const colors = appearanceTokens({ ...settings, ...patch }, "light");
          const active = Object.entries(patch).every(([key, value]) => settings[key] === value);
          return <button key={preset.id} type="button" data-theme-preset={preset.id} aria-pressed={active} disabled={disabled}
            className="theme-preset overflow-hidden rounded-lg border bg-card text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            onClick={() => onChange(patch)}>
            <span aria-hidden="true" className="flex h-16 border-b">
              <span className="w-1/4" style={{ backgroundColor: colors["admin-sidebar"], backgroundImage: colors["admin-sidebar-image"] }} />
              <span className="flex-1 bg-background"><span className="block h-4 border-b" style={{ backgroundColor: colors["admin-header"], backgroundImage: colors["admin-header-image"] }} /><span className="m-2 block h-5 rounded-sm border bg-card" /></span>
            </span>
            <span className="block px-3 py-2">{presetName(preset.label)}</span>
          </button>;
        })}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{ar ? "تباين النصوص AA مفعّل دائمًا لجميع الألوان." : "AA text contrast is always enabled for every palette."}</p>
      <p className="mt-2 text-sm text-muted-foreground">{ar ? "تُطبّق الخيارات في المعاينة فورًا. احفظ قسم المظهر لتطبيقها على الموقع. يبقى وضع المحتوى وتفضيل الزائر مستقلين عن ألوان الهيكل." : "Choices update the preview immediately. Save Appearance to apply them to the site. Content mode and the visitor’s preference remain independent of chrome colors."}</p>
    </div>
    <div className="grid gap-4">
      {ADMINLTE_CHROME_KEYS.map(region => <Panel key={region}>
        <PanelHeader><h3>{{ sidebar: ar ? "الشريط الجانبي" : "Sidebar", header: ar ? "الترويسة" : "Navbar", footer: ar ? "التذييل" : "Footer" }[region]}</h3></PanelHeader><PanelBody>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor={`theme-${region}-mode`}>{ar ? "وضع المنطقة" : "Region mode"}</Label>
            <NativeSelect id={`theme-${region}-mode`} value={settings[`appearance.${region}Mode`] ?? "inherit"} disabled={disabled} onChange={event => onChange({ [`appearance.${region}Mode`]: event.target.value })}>
              <option value="inherit">{ar ? "حسب نمط الإدارة" : "Administration style"}</option><option value="light">{ar ? "فاتح" : "Light"}</option><option value="dark">{ar ? "داكن" : "Dark"}</option>
            </NativeSelect></div>
          <div className="space-y-2"><Label htmlFor={`theme-${region}-background`}>{ar ? "خلفية المنطقة" : "Region background"}</Label>
            <NativeSelect id={`theme-${region}-background`} value={settings[`appearance.${region}Background`] ?? "inherit"} disabled={disabled} onChange={event => { const value = event.target.value; const patch: Record<string,string> = {[`appearance.${region}Background`]:value}; if (value.includes(":") && settings[`appearance.${region}Mode`] === "inherit") { const tokens = appearanceTokens({...settings,...patch}, "light"); patch[`appearance.${region}Mode`] = tokens[`admin-${region}-foreground`] === ADMINLTE_BASE_COLORS.white ? "dark" : "light"; } onChange(patch); }}>
              <option value="inherit">{ar ? "حسب نمط الإدارة" : "Administration style"}</option>
              <option value="transparent">{ar ? "شفافة على سطح الصفحة" : "Transparent over page surface"}</option>
              <optgroup label={ar ? "أسطح محايدة" : "Neutral surfaces"}><option value="body">{ar ? "السطح" : "Body"}</option><option value="body-secondary">{ar ? "سطح ثانوي" : "Body secondary"}</option><option value="body-tertiary">{ar ? "سطح ثالث" : "Body tertiary"}</option></optgroup>
              <optgroup label="Bootstrap">{Object.keys(ADMINLTE_BASE_COLORS).flatMap(color => [<option key={color} value={color}>{name(color)}</option>, ...(["black","white"].includes(color) ? [] : [<option key={`${color}-subtle`} value={`${color}-subtle`}>{name(color)} · {ar ? "خفيف" : "subtle"}</option>])])}</optgroup>
              {palettes.map(([key, colors]) => <optgroup key={key} label={key === "designed" ? "AdminLTE 4" : "AdminLTE 3"}>{Object.keys(colors).flatMap(color => [<option key={color} value={`${key}:${color}`}>{name(color)}</option>, <option key={`${color}-gradient`} value={`${key}:${color}:gradient`}>{name(color)} · {ar ? "تدرج" : "gradient"}</option>])}</optgroup>)}
            </NativeSelect></div>
        </div>
      </PanelBody></Panel>)}
    </div>
    <Panel><PanelHeader><h3>{ar ? "اللون الأساسي" : "Primary color"}</h3></PanelHeader><PanelBody className="space-y-3"><Label htmlFor="theme-primary">{ar ? "اللون الأساسي من مكتبة AdminLTE" : "Primary color from the AdminLTE palette"}</Label>
      <NativeSelect id="theme-primary" value={primary} disabled={disabled} onChange={event => { if (event.target.value) onChange({ "appearance.primaryLight": event.target.value, "appearance.primaryDark": event.target.value }); }}>
        <option value={ADMINLTE_BASE_COLORS.primary}>{ar ? "أزرق Bootstrap الافتراضي" : "Bootstrap blue (default)"}</option>
        {!palettes.some(([, colors]) => Object.values(colors).some(color => color === primary)) && primary !== ADMINLTE_BASE_COLORS.primary && <option value={primary}>{ar ? "مخصّص" : "Custom"} · {primary}</option>}
        {palettes.map(([key, colors]) => <optgroup key={key} label={key === "designed" ? "AdminLTE 4" : "AdminLTE 3"}>{Object.entries(colors).map(([color, value]) => <option key={color} value={value}>{name(color)}</option>)}</optgroup>)}
      </NativeSelect>
      <div style={sampleStyle} className="space-y-3 rounded-lg bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setSampleSaved(true)}>{ar ? "زر أساسي" : "Primary button"}</Button>
          <Button type="button" variant="outline" onClick={() => setSampleSaved(false)}>{ar ? "زر بإطار" : "Outline"}</Button>
          <Badge>{ar ? "شارة" : "Badge"}</Badge>
          <div className="flex items-center gap-2"><Checkbox id="theme-sample-check" defaultChecked /><Label htmlFor="theme-sample-check">{ar ? "محدد" : "Checked"}</Label></div>
        </div>
        <div role="progressbar" aria-label={ar ? "تقدم نموذجي" : "Sample progress"} aria-valuenow={62} aria-valuemin={0} aria-valuemax={100} className="h-5 bg-muted"><div className="h-full bg-primary text-center text-xs text-primary-foreground" style={{width:"62%"}}>62%</div></div>
        {sampleSaved && <p role="status" className="text-sm">{ar ? "تم تنفيذ الإجراء داخل المعاينة." : "Action completed inside the preview."}</p>}
      </div>
    </PanelBody></Panel>
  </div>;
}
