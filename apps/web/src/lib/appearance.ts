import {
  appearanceTokens,
  APPEARANCE_DEFAULTS,
  isThemeMode,
  type AppearanceScope,
  type ThemeMode,
} from "@so7ob/contracts";
import type { CSSProperties } from "react";
export const THEME_STORAGE_KEY = "so7ob-appearance-mode";
export const ADMIN_THEME_STORAGE_KEY = "so7ob-admin-appearance-mode";
export const themeStorageKey = (scope: AppearanceScope) => scope === "admin" ? ADMIN_THEME_STORAGE_KEY : THEME_STORAGE_KEY;
/** A navbar dropdown is portalled to body, but retains its region's explicit
 * light/dark palette. Unset modes inherit the active document as usual. */
export function regionalPortalStyle(settings: Record<string,string>, region: "sidebar" | "header" | "footer"): CSSProperties | undefined {
  const mode = settings[`appearance.${region}Mode`];
  if (mode !== "light" && mode !== "dark") return undefined;
  return Object.fromEntries(Object.entries(appearanceTokens(settings,mode)).map(([key,value]) => ["--"+key,value])) as CSSProperties;
}
export const fontFamilies: Record<string, string> = {
  "ar.ibm": "IBM Plex Sans Arabic",
  "ar.cairo": "Cairo",
  "ar.tajawal": "Tajawal",
  "en.ibm": "IBM Plex Sans",
  "en.inter": "Inter",
  "en.source": "Source Sans 3",
};
const fonts = import.meta.glob(
  "../../../../node_modules/@fontsource/{ibm-plex-sans-arabic,ibm-plex-sans,cairo,tajawal,inter,source-sans-3}/files/*-{arabic,latin}-{400,500,600,700}-normal.woff2",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;
export function fontStyles(settings: Record<string, string>) {
  let css = "";
  for (const lang of ["ar", "en"]) {
    const name =
      fontFamilies[
        lang +
          "." +
          (settings["appearance.font" + (lang === "ar" ? "Ar" : "En")] ?? APPEARANCE_DEFAULTS["appearance.font" + (lang === "ar" ? "Ar" : "En")])
      ];
    if (!name) continue;
    const slug = name.toLowerCase().replaceAll(" ", "-");
    for (const weight of [400, 500, 600, 700])
      for (const subset of lang === "ar" ? ["arabic", "latin"] : ["latin"]) {
        const key = Object.keys(fonts).find((k) =>
          k.endsWith(`/files/${slug}-${subset}-${weight}-normal.woff2`),
        );
        if (!key) continue;
        css += `@font-face{font-family:"${name}";font-style:normal;font-weight:${weight};font-display:swap;src:url("${fonts[key]}") format("woff2");unicode-range:${subset === "arabic" ? "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" : "U+0000-00FF,U+0100-024F,U+2000-206F"};}`;
      }
  }
  return css;
}
export function themeStyles(
  settings: Record<string, string>,
  selector = ":root",
) {
  let css = fontStyles(settings);
  for (const mode of ["light", "dark"] as const) {
    const tokens = appearanceTokens(settings, mode);
    css += `${selector}[data-color-mode="${mode}"]{color-scheme:${mode};${Object.entries(
      tokens,
    )
      .map(([k, v]) => `--${k}:${v};`)
      .join("")}}`;
  }
  for (const lang of ["ar", "en"]) {
    const family =
      fontFamilies[
        lang +
          "." +
          (settings["appearance.font" + (lang === "ar" ? "Ar" : "En")] ?? APPEARANCE_DEFAULTS["appearance.font" + (lang === "ar" ? "Ar" : "En")])
      ];
    css += `${selector}[lang="${lang}"]{--site-font:${family ? '"' + family + '",' : ""}system-ui,sans-serif;}`;
  }
  return css;
}
export function defaultMode(settings: Record<string, string>): ThemeMode {
  const mode =
    settings["appearance.mode"] ?? APPEARANCE_DEFAULTS["appearance.mode"];
  return isThemeMode(mode) ? mode : "light";
}
/** Executed in the document head before paint; changes only non-React-owned html attributes. */
export function themeBootstrap(settings: Record<string, string>, scope: AppearanceScope = "site") {
  return `(function(){var m=${JSON.stringify(defaultMode(settings))};try{var p=localStorage.getItem('${themeStorageKey(scope)}');if(['light','dark','system'].includes(p))m=p;}catch(e){}var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.themeScope='${scope}';document.documentElement.dataset.colorMode=d?'dark':'light';document.documentElement.classList.toggle('dark',d);})();`;
}
