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
  "appearance.primaryLight": "#0369a1",
  "appearance.accentLight": "#6d28d9",
  "appearance.primaryDark": "#38bdf8",
  "appearance.accentDark": "#c4b5fd",
  "appearance.fontAr": "ibm",
  "appearance.fontEn": "ibm",
  "appearance.radius": "soft",
  "appearance.density": "comfortable",
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
  const bg = dark ? "#0b1220" : "#f8fafc",
    card = dark ? "#131f32" : "#ffffff",
    fg = dark ? "#e2e8f0" : "#0b1f3a";
  const p = s[dark ? "appearance.primaryDark" : "appearance.primaryLight"],
    a = s[dark ? "appearance.accentDark" : "appearance.accentLight"];
  const primary = readable(
    isHexColor(p)
      ? p
      : APPEARANCE_DEFAULTS[
          dark ? "appearance.primaryDark" : "appearance.primaryLight"
        ],
    card,
  );
  const accent = readable(
    isHexColor(a)
      ? a
      : APPEARANCE_DEFAULTS[
          dark ? "appearance.accentDark" : "appearance.accentLight"
        ],
    card,
  );
  const onPrimary = contrast(primary, "#ffffff") >= 4.5 ? "#ffffff" : "#0b1220";
  const muted = dark ? "#a9b8cd" : "#475569",
    surface = dark ? "#1c2b40" : "#f1f5f9",
    soft = mix(primary, card, 0.9);
  return {
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
    border: dark ? "#35465e" : "#e2e8f0",
    input: "#64748b",
    ring: primary,
    brand: primary,
    "brand-strong": readable(mix(primary, fg, 0.15), card),
    "brand-soft": soft,
    digital: accent,
    navy: fg,
    "navy-soft": dark ? "#cbd5e1" : "#16305a",
    skydrop: dark ? "#7dd3fc" : "#38bdf8",
    "on-brand": onPrimary,
    inverse: "#0b1f3a",
    "inverse-soft": "#16305a",
    "inverse-foreground": "#ffffff",
    radius:
      s["appearance.radius"] === "square"
        ? "0rem"
        : s["appearance.radius"] === "round"
          ? "1.25rem"
          : "0.75rem",
    "panel-radius":
      s["appearance.radius"] === "square"
        ? "0rem"
        : s["appearance.radius"] === "round"
          ? "1.5rem"
          : "1rem",
    "panel-radius-large":
      s["appearance.radius"] === "square"
        ? "0rem"
        : s["appearance.radius"] === "round"
          ? "2rem"
          : "1.5rem",
    "control-padding":
      s["appearance.density"] === "compact" ? "0.375rem" : "0.625rem",
    "row-padding":
      s["appearance.density"] === "compact" ? "0.5rem" : "0.875rem",
    sidebar: card,
    "sidebar-foreground": fg,
    "sidebar-primary": primary,
    "sidebar-primary-foreground": onPrimary,
    "sidebar-accent": soft,
    "sidebar-accent-foreground": fg,
    "sidebar-border": dark ? "#35465e" : "#e2e8f0",
    "sidebar-ring": primary,
    "chart-1": primary,
    "chart-2": accent,
    "chart-3": dark ? "#c4b5fd" : "#6d28d9",
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
    ["focus", t.ring, t.card, 3],
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
    "appearance.mode": ["light", "dark", "system"],
    "appearance.fontAr": ["ibm", "cairo", "tajawal", "system"],
    "appearance.fontEn": ["ibm", "inter", "system"],
    "appearance.radius": ["square", "soft", "round"],
    "appearance.density": ["comfortable", "compact"],
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
