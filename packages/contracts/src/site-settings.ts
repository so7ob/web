import { ADMINLTE } from "./adminlte-tokens.js";
import { ADMINLTE_BACKGROUNDS, ADMINLTE_BASE_COLORS, ADMINLTE_CHROME_KEYS, ADMINLTE_PALETTES } from "./adminlte-themes.js";
/** Public presentation settings. No arbitrary CSS, URLs or executable font definitions. */
export const SOCIAL_CHANNELS = [
  "github",
  "linkedin",
  "x",
  "facebook",
  "instagram",
  "youtube",
  "telegram",
  "whatsapp",
] as const;
export const SETTING_SECTIONS = [
  "identity",
  "appearance",
  "contact",
  "sharing",
  "announcement",
  "tracking",
] as const;
export type SettingSection = (typeof SETTING_SECTIONS)[number];
export const IDENTITY_MEDIA_KEYS = [
  "identity.logoArLight",
  "identity.logoEnLight",
  "identity.logoArDark",
  "identity.logoEnDark",
  "identity.icon",
  "sharing.image",
] as const;
export const APPEARANCE_DEFAULTS: Record<string, string> = {
  "appearance.mode": "light",
  "appearance.adminStyle": "semi-dark",
  "appearance.primaryLight": ADMINLTE.primary,
  "appearance.accentLight": "#6d28d9",
  "appearance.primaryDark": ADMINLTE.primaryDark,
  "appearance.accentDark": "#c4b5fd",
  "appearance.fontAr": "ibm",
  "appearance.fontEn": "source",
  "appearance.radius": "adminlte",
  "appearance.density": "adminlte",
  ...Object.fromEntries(ADMINLTE_CHROME_KEYS.flatMap(region => [
    [`appearance.${region}Background`, "inherit"], [`appearance.${region}Mode`, "inherit"],
  ])),
};
export const PRESENTATION_DEFAULTS: Record<string, string> = {
  "site.nameAr": "سُحُب التقنية",
  "site.nameEn": "so7ob",
  "identity.showName": "true",
  ...Object.fromEntries(IDENTITY_MEDIA_KEYS.map((k) => [k, ""])),
  ...APPEARANCE_DEFAULTS,
  "sharing.descriptionAr": "",
  "sharing.descriptionEn": "",
  ...Object.fromEntries(SOCIAL_CHANNELS.map((k) => ["social." + k, ""])),
};
export const SECTION_KEYS: Record<SettingSection, string[]> = {
  identity: [
    "site.nameAr",
    "site.nameEn",
    "identity.showName",
    ...IDENTITY_MEDIA_KEYS.filter((k) => k !== "sharing.image"),
  ],
  appearance: Object.keys(APPEARANCE_DEFAULTS),
  contact: [
    "contact.email",
    "contact.phone",
    "contact.address",
    ...SOCIAL_CHANNELS.map((k) => "social." + k),
  ],
  sharing: ["sharing.descriptionAr", "sharing.descriptionEn", "sharing.image"],
  announcement: [
    "announcement.enabled",
    "announcement.messageAr",
    "announcement.messageEn",
    "announcement.ctaLabelAr",
    "announcement.ctaLabelEn",
    "announcement.ctaUrl",
    "announcement.variant",
    "announcement.startAt",
    "announcement.endAt",
  ],
  tracking: [
    "response.hours",
    "track.forceLogin",
    "track.requestsMode",
    "track.inquiriesMode",
    "track.linkTtlDays",
    "track.allowGuestAttachments",
  ],
};
export const PRESENTATION_KEYS = [
  ...SECTION_KEYS.identity,
  ...SECTION_KEYS.appearance,
  ...SECTION_KEYS.sharing,
  ...SOCIAL_CHANNELS.map((k) => "social." + k),
];
export const SETTINGS_DEFAULTS: Record<string, string> = {
  ...PRESENTATION_DEFAULTS,
  "contact.email": "",
  "contact.phone": "",
  "contact.address": "",
  "announcement.enabled": "false",
  "announcement.messageAr": "",
  "announcement.messageEn": "",
  "announcement.ctaLabelAr": "",
  "announcement.ctaLabelEn": "",
  "announcement.ctaUrl": "",
  "announcement.variant": "info",
  "announcement.startAt": "",
  "announcement.endAt": "",
  "response.hours": "24",
  "track.forceLogin": "false",
  "track.requestsMode": "login_required",
  "track.inquiriesMode": "login_required",
  "track.linkTtlDays": "90",
  "track.allowGuestAttachments": "false",
};
export const PALETTE_PRESETS = {
  adminlte: {
    primaryLight: ADMINLTE.primary,
    accentLight: "#6d28d9",
    primaryDark: ADMINLTE.primaryDark,
    accentDark: "#c4b5fd",
  },
  blue: {
    primaryLight: "#0369a1",
    accentLight: "#6d28d9",
    primaryDark: "#38bdf8",
    accentDark: "#c4b5fd",
  },
  teal: {
    primaryLight: "#0f766e",
    accentLight: "#0369a1",
    primaryDark: "#5eead4",
    accentDark: "#7dd3fc",
  },
  violet: {
    primaryLight: "#6d28d9",
    accentLight: "#0f766e",
    primaryDark: "#c4b5fd",
    accentDark: "#5eead4",
  },
} as const;
export const APPEARANCE_MOTION = { fast: 150, normal: 200, panel: 250 } as const;
export type ColorMode = "light" | "dark";
export type ThemeMode = ColorMode | "system";
export function isThemeMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "system";
}
export const isHexColor = (v: string) => /^#[\da-f]{6}$/i.test(v);
function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function luminance(hex: string) {
  return rgb(hex)
    .map((n) => {
      const v = n / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(a: string, b: string, ratio: number) {
  const x = rgb(a),
    y = rgb(b);
  return (
    "#" +
    x
      .map((v, i) =>
        Math.round(v * (1 - ratio) + y[i] * ratio)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function readable(color: string, bg: string, min = 4.5) {
  const target =
    contrast("#000000", bg) > contrast("#ffffff", bg) ? "#000000" : "#ffffff";
  for (let i = 0; i <= 100; i++) {
    const result = mix(color, target, i / 100);
    if (contrast(result, bg) >= min) return result;
  }
  return target;
}
export function appearanceTokens(
  raw: Record<string, string>,
  mode: ColorMode,
): Record<string, string> {
  const s = { ...APPEARANCE_DEFAULTS, ...raw },
    dark = mode === "dark";
  const palette = dark ? ADMINLTE.dark : ADMINLTE.light;
  const bg = palette.canvas, card = palette.card, fg = palette.text;
  const p = s[dark ? "appearance.primaryDark" : "appearance.primaryLight"],
    a = s[dark ? "appearance.accentDark" : "appearance.accentLight"];
  const primary = readable(
    isHexColor(p)
      ? p
      : APPEARANCE_DEFAULTS[
          dark ? "appearance.primaryDark" : "appearance.primaryLight"
        ],
    palette.surface,
  );
  const accent = readable(
    isHexColor(a)
      ? a
      : APPEARANCE_DEFAULTS[
          dark ? "appearance.accentDark" : "appearance.accentLight"
        ],
    palette.surface,
  );
  const onPrimary = contrast(primary, "#ffffff") >= 4.5 ? "#ffffff" : "#0b1220";
  const muted = palette.muted,
    surface = palette.surface,
    soft = mix(primary, card, 0.9);
  // Semantic pairs are shared by SSR, the live UI and sandboxed previews.
  const emphasis = mix(primary, "#08121d", 0.72);
  const tones: Record<string, string> = {};
  for (const [name, color] of Object.entries({
    success: dark ? "#75b798" : "#198754",
    warning: dark ? "#ffda6a" : "#997404",
    info: dark ? "#6edff6" : "#087990",
    danger: dark ? "#ea868f" : "#dc3545",
    highlight: accent,
  })) {
    const solid = readable(color, palette.surface);
    const subtle = mix(solid, card, dark ? 0.88 : 0.94);
    tones[name] = solid;
    tones[name + "-soft"] = subtle;
    tones[name + "-foreground"] = readable(solid, subtle);
    tones[name + "-border"] = mix(solid, card, dark ? 0.48 : 0.66);
    tones["on-" + name] = contrast(solid, "#ffffff") >= 4.5 ? "#ffffff" : "#0b1220";
  }
  const chrome: Record<string, string> = {};
  for (const region of ADMINLTE_CHROME_KEYS) {
    const name = s[`appearance.${region}Background`];
    const regionMode = s[`appearance.${region}Mode`];
    const regionPalette = regionMode === "light" ? ADMINLTE.light : regionMode === "dark" ? ADMINLTE.dark : palette;
    const defaultSidebar = ["semi-dark", "colored"].includes(s["appearance.adminStyle"]);
    let color = region === "sidebar" && defaultSidebar ? ADMINLTE.sidebar : region === "header" && s["appearance.adminStyle"] === "colored" ? primary : card;
    let text = region === "sidebar" && defaultSidebar ? ADMINLTE.sidebarText : region === "header" && s["appearance.adminStyle"] === "colored" ? onPrimary : fg;
    if (name !== "inherit") {
      const [family, key] = name.split(":");
      const extended = ADMINLTE_PALETTES[family as keyof typeof ADMINLTE_PALETTES] as Record<string, string> | undefined;
      const base = ADMINLTE_BASE_COLORS[name.replace(/-subtle$/, "")];
      color = extended?.[key] ?? (name === "body" ? regionPalette.card : name === "body-secondary" ? regionPalette.surface : name === "body-tertiary" ? regionPalette.canvas : base ? (name.endsWith("-subtle") ? mix(base, regionPalette.card, 0.8) : base) : color);
      text = contrast(color, "#ffffff") >= 4.5 ? "#ffffff" : "#000000";
    }
    // Upstream uses a 15% white gradient. Bound its highlight only when AA
    // would otherwise fail (notably the designed indigo/violet palettes).
    let top = color;
    if (name.endsWith(":gradient")) for (let step = 15; step >= 0; step--) {
      top = mix(color, "#ffffff", step / 100);
      if (contrast(text, top) >= 4.5) break;
    }
    const hover = mix(color, text, 0.08);
    const hoverText = readable(text, hover);
    chrome[`admin-${region}`] = color;
    chrome[`admin-${region}-image`] = name.endsWith(":gradient") ? `linear-gradient(180deg, ${top}, ${color})` : "none";
    chrome[`admin-${region}-gradient-top`] = top;
    chrome[`admin-${region}-foreground`] = text;
    chrome[`admin-${region}-muted`] = text;
    chrome[`admin-${region}-hover`] = hover;
    chrome[`admin-${region}-hover-foreground`] = hoverText;
    chrome[`admin-${region}-active`] = hover;
    chrome[`admin-${region}-on-active`] = hoverText;
    chrome[`admin-${region}-logo-light`] = contrast(color, "#ffffff") >= 4.5 ? "none" : "inline-block";
    chrome[`admin-${region}-logo-dark`] = contrast(color, "#ffffff") >= 4.5 ? "inline-block" : "none";
  }
  return {
    ...tones,
    "admin-sidebar": ["semi-dark", "colored"].includes(s["appearance.adminStyle"]) ? ADMINLTE.sidebar : card,
    "admin-sidebar-foreground": ["semi-dark", "colored"].includes(s["appearance.adminStyle"]) ? ADMINLTE.sidebarText : fg,
    "admin-sidebar-muted": ["semi-dark", "colored"].includes(s["appearance.adminStyle"]) ? ADMINLTE.sidebarText : muted,
    "admin-sidebar-active": ["semi-dark", "colored"].includes(s["appearance.adminStyle"]) ? mix(ADMINLTE.sidebar, "#ffffff", 0.1) : mix(card, fg, 0.1),
    "admin-sidebar-on-active": ["semi-dark", "colored"].includes(s["appearance.adminStyle"]) ? "#ffffff" : fg,
    "admin-sidebar-hover": ["semi-dark", "colored"].includes(s["appearance.adminStyle"]) ? mix(ADMINLTE.sidebar, "#ffffff", 0.1) : soft,
    "admin-header": s["appearance.adminStyle"] === "colored" ? primary : card,
    "admin-header-foreground": s["appearance.adminStyle"] === "colored" ? onPrimary : fg,
    ...chrome,
    ...Object.fromEntries(Object.entries(ADMINLTE_BASE_COLORS).flatMap(([name, color]) => [[`metric-${name}`, color], [`metric-on-${name}`, contrast(color, "#ffffff") >= 4.5 ? "#ffffff" : "#000000"]])),
    "overlay": "#000000",
    "selection": soft,
    "selection-foreground": readable(primary, soft),
    "shimmer": dark ? "#ffffff" : primary,
    "shadow-color": fg,
    "panel-shadow": ADMINLTE.cardShadow,
    "sidebar-width": ADMINLTE.sidebarWidth,
    "header-height": ADMINLTE.headerHeight,
    "card-header-padding": "0.5rem 1rem",
    "primary-hover": readable(mix(primary, fg, 0.12), card),
    "primary-hover-foreground": contrast(readable(mix(primary, fg, 0.12), card), "#ffffff") >= 4.5 ? "#ffffff" : "#0b1220",
    "emphasis": emphasis,
    "emphasis-foreground": "#ffffff",
    "emphasis-muted": mix("#ffffff", emphasis, 0.16),
    "emphasis-border": mix("#ffffff", emphasis, 0.65),
    "emphasis-action": mix(primary, "#ffffff", 0.78),
    "emphasis-action-foreground": readable(emphasis, mix(primary, "#ffffff", 0.78)),
    "duration-fast": APPEARANCE_MOTION.fast + "ms",
    "duration-normal": APPEARANCE_MOTION.normal + "ms",
    "duration-panel": APPEARANCE_MOTION.panel + "ms",
    "ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
    "space-panel": s["appearance.density"] === "comfortable" ? "1.5rem" : ADMINLTE.panelPadding,
    "space-section": s["appearance.density"] === "comfortable" ? "2rem" : "1.5rem",
    "base-foreground": fg,
    "base-muted-foreground": muted,
    "base-primary": primary,
    "base-primary-foreground": onPrimary,
    "base-brand-strong": readable(mix(primary, fg, 0.15), card),
    "base-border": palette.border,
    background: bg,
    foreground: fg,
    card: card,
    "card-foreground": fg,
    popover: card,
    "popover-foreground": fg,
    primary: primary,
    "primary-foreground": onPrimary,
    secondary: surface,
    "secondary-foreground": fg,
    muted: surface,
    "muted-foreground": muted,
    accent: soft,
    "accent-foreground": readable(primary, soft),
    destructive: dark ? "#fca5a5" : "#b91c1c",
    "destructive-foreground": dark ? "#450a0a" : "#ffffff",
    border: palette.border,
    input: palette.input,
    ring: primary,
    brand: primary,
    "brand-strong": readable(mix(primary, fg, 0.15), card),
    "brand-soft": soft,
    digital: accent,
    navy: fg,
    "navy-soft": dark ? "#cbd5e1" : "#16305a",
    skydrop: mix(primary, "#ffffff", 0.7),
    "on-brand": onPrimary,
    inverse: emphasis,
    "inverse-soft": mix(emphasis, primary, 0.2),
    "inverse-foreground": "#ffffff",
    radius:
      s["appearance.radius"] === "square"
        ? "0rem"
        : s["appearance.radius"] === "round"
          ? "1.25rem"
          : s["appearance.radius"] === "soft" ? "0.75rem" : ADMINLTE.radius,
    "panel-radius":
      s["appearance.radius"] === "square"
        ? "0rem"
        : s["appearance.radius"] === "round"
          ? "1.5rem"
          : s["appearance.radius"] === "soft" ? "1rem" : ADMINLTE.radius,
    "panel-radius-large":
      s["appearance.radius"] === "square"
        ? "0rem"
        : s["appearance.radius"] === "round"
          ? "2rem"
          : s["appearance.radius"] === "soft" ? "1.5rem" : "0.5rem",
    "control-padding":
      s["appearance.density"] === "comfortable" ? "0.625rem" : ADMINLTE.controlPadding,
    "row-padding":
      s["appearance.density"] === "comfortable" ? "0.875rem" : ADMINLTE.rowPadding,
    sidebar: card,
    "sidebar-foreground": fg,
    "sidebar-primary": primary,
    "sidebar-primary-foreground": onPrimary,
    "sidebar-accent": soft,
    "sidebar-accent-foreground": fg,
    "sidebar-border": palette.border,
    "sidebar-ring": primary,
    "chart-1": primary,
    "chart-2": accent,
    "chart-3": tones.success,
    "chart-4": primary,
    "chart-5": muted,
  };
}
export function paletteChecks(
  settings: Record<string, string>,
  mode: ColorMode,
) {
  const t = appearanceTokens(settings, mode);
  return [
    ["text", t.foreground, t.background, 4.5],
    ["muted", t["muted-foreground"], t.card, 4.5],
    ["button", t["primary-foreground"], t.primary, 4.5],
    ["link", t.primary, t.card, 4.5],
    ["link-neutral", t.primary, t.secondary, 4.5],
    ["focus", t.ring, t.card, 3],
    ["admin-sidebar", t["admin-sidebar-foreground"], t["admin-sidebar"], 4.5],
    ["admin-sidebar-muted", t["admin-sidebar-muted"], t["admin-sidebar"], 4.5],
    ["admin-sidebar-active", t["admin-sidebar-on-active"], t["admin-sidebar-active"], 4.5],
    ["admin-sidebar-hover", t["admin-sidebar-hover-foreground"], t["admin-sidebar-hover"], 4.5],
    ["admin-header", t["admin-header-foreground"], t["admin-header"], 4.5],
    ["admin-footer", t["admin-footer-foreground"], t["admin-footer"], 4.5],
    ...ADMINLTE_CHROME_KEYS.map(region => [`${region}-gradient`, t[`admin-${region}-foreground`], t[`admin-${region}-gradient-top`], 4.5]),
  ].map(([name, a, b, min]) => ({
    name: String(name),
    ratio: contrast(String(a), String(b)),
    minimum: Number(min),
  }));
}
export function mediaSettingId(value: string) {
  return /^\/api\/(?:v1\/)?media\/([a-zA-Z0-9_-]+)$/.exec(value)?.[1] ?? null;
}
export function safeSettingUrl(value: string, relative = false) {
  if (!value) return true;
  if (
    relative &&
    /^\/(?!\/)/.test(value) &&
    !Array.from(value).some((c) => c.charCodeAt(0) <= 32 || c === "\\")
  )
    return true;
  try {
    const u = new URL(value);
    return (
      ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !Array.from(value).some((c) => c.charCodeAt(0) <= 32 || c === "\\")
    );
  } catch {
    return false;
  }
}
export function validateSiteSettings(
  s: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const validDate = (v: string) => {
    const day = v.slice(0, 10);
    return (
      Number.isFinite(Date.parse(v)) &&
      new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day
    );
  };
  for (const [k, v] of Object.entries(s)) {
    if (!Object.values(SECTION_KEYS).flat().includes(k)) continue;
    if (v.length > 300) errors[k] = "length";
    if (
      k.startsWith("appearance.") &&
      /primary|accent/.test(k) &&
      !isHexColor(v)
    )
      errors[k] = "color";
    if (
      (IDENTITY_MEDIA_KEYS as readonly string[]).includes(k) &&
      v &&
      !mediaSettingId(v)
    )
      errors[k] = "media";
    if (k.startsWith("social.") && !safeSettingUrl(v)) errors[k] = "url";
  }
  const enums: Record<string, readonly string[]> = {
    ...Object.fromEntries(ADMINLTE_CHROME_KEYS.flatMap(region => [
      [`appearance.${region}Background`, ADMINLTE_BACKGROUNDS],
      [`appearance.${region}Mode`, ["inherit", "light", "dark"]],
    ])),
    "appearance.mode": ["light", "dark", "system"],
    "appearance.adminStyle": ["light", "semi-dark", "dark", "colored"],
    "appearance.fontAr": ["ibm", "cairo", "tajawal", "system"],
    "appearance.fontEn": ["source", "ibm", "inter", "system"],
    "appearance.radius": ["adminlte", "square", "soft", "round"],
    "appearance.density": ["adminlte", "comfortable", "compact"],
    "identity.showName": ["true", "false"],
    "announcement.enabled": ["true", "false"],
    "announcement.variant": ["info", "warning", "success", "brand"],
  };
  for (const [k, values] of Object.entries(enums))
    if (s[k] !== undefined && !values.includes(s[k])) errors[k] = "choice";
  if (
    s["contact.email"] &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s["contact.email"])
  )
    errors["contact.email"] = "email";
  if (s["contact.phone"] && !/^[+]?[\d\s\-()]{7,20}$/.test(s["contact.phone"]))
    errors["contact.phone"] = "phone";
  if (!safeSettingUrl(s["announcement.ctaUrl"] ?? "", true))
    errors["announcement.ctaUrl"] = "url";
  for (const key of ["announcement.startAt", "announcement.endAt"])
    if (
      s[key] &&
      (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(
        s[key],
      ) ||
        !validDate(s[key]))
    )
      errors[key] = "date";
  if (
    s["announcement.startAt"] &&
    s["announcement.endAt"] &&
    Date.parse(s["announcement.startAt"]) > Date.parse(s["announcement.endAt"])
  )
    errors["announcement.endAt"] = "dateOrder";
  for (const key of ["announcement.messageAr", "announcement.messageEn"])
    if ((s[key] ?? "").length > 280) errors[key] = "length";
  for (const key of ["announcement.ctaLabelAr", "announcement.ctaLabelEn"])
    if ((s[key] ?? "").length > 60) errors[key] = "length";
  if (
    s["track.linkTtlDays"] !== undefined &&
    (!/^[1-9]\d{0,3}$/.test(s["track.linkTtlDays"]) ||
      Number(s["track.linkTtlDays"]) > 3650)
  )
    errors["track.linkTtlDays"] = "ttl";
  if (
    s["response.hours"] !== undefined &&
    (!/^[1-9]\d{0,2}$/.test(s["response.hours"]) ||
      Number(s["response.hours"]) > 720)
  )
    errors["response.hours"] = "hours";
  for (const mode of ["light", "dark"] as const)
    if (paletteChecks(s, mode).some((c) => c.ratio < c.minimum))
      errors["appearance.primary" + (mode === "light" ? "Light" : "Dark")] =
        "contrast";
  return errors;
}
