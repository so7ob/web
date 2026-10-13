import {
  appearanceTokens,
  APPEARANCE_DEFAULTS,
  isThemeMode,
  type ThemeMode,
} from "@so7ob/contracts";
export const THEME_STORAGE_KEY = "so7ob-appearance-mode";
export const fontFamilies: Record<string, string> = {
  "ar.ibm": "IBM Plex Sans Arabic",
  "ar.cairo": "Cairo",
  "ar.tajawal": "Tajawal",
  "en.ibm": "IBM Plex Sans",
  "en.inter": "Inter",
};
const fonts = import.meta.glob(
  "../../../../node_modules/@fontsource/{ibm-plex-sans-arabic,ibm-plex-sans,cairo,tajawal,inter}/files/*-{arabic,latin}-{400,500,600,700}-normal.woff2",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;
export function fontStyles(settings: Record<string, string>) {
  let css = "";
  for (const lang of ["ar", "en"]) {
    const name =
      fontFamilies[
        lang +
          "." +
          (settings["appearance.font" + (lang === "ar" ? "Ar" : "En")] ?? "ibm")
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
          (settings["appearance.font" + (lang === "ar" ? "Ar" : "En")] ?? "ibm")
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
export function themeBootstrap(settings: Record<string, string>) {
  return `(function(){var m=${JSON.stringify(defaultMode(settings))};try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');if(['light','dark','system'].includes(p))m=p;}catch(e){}var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.colorMode=d?'dark':'light';document.documentElement.classList.toggle('dark',d);})();`;
}
