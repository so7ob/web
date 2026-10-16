import { describe, it, expect } from "vitest";
import {
  appearanceTokens,
  paletteChecks,
  SETTINGS_DEFAULTS,
  PALETTE_PRESETS,
  validateSiteSettings,
  safeSettingUrl,
  mediaSettingId,
} from "./site-settings.js";
describe("site presentation contracts", () => {
  it("keeps all administration profiles readable with extreme palettes and preserves absent-key defaults", () => {
    for (const style of ["light", "semi-dark", "dark", "colored"])
      for (const mode of ["light", "dark"] as const)
        for (const primary of ["#ffffff", "#000000", "#ffff00", "#ff00ff", "#00ff00", "#0369a1"])
          expect(paletteChecks({"appearance.adminStyle": style, "appearance.primaryLight": primary, "appearance.primaryDark": primary}, mode).every(check => check.ratio >= check.minimum)).toBe(true);
    expect(appearanceTokens({}, "light")).toEqual(appearanceTokens({"appearance.adminStyle":"light"}, "light"));
    expect(validateSiteSettings({"appearance.adminStyle":"untrusted"})).toHaveProperty("appearance.adminStyle", "choice");
    for (const style of ["light", "semi-dark", "dark", "colored"])
      expect(validateSiteSettings({"appearance.adminStyle":style})).toEqual({});
  });
  it("derives accessible paired palettes including extreme custom colors", () => {
    for (const palette of Object.values(PALETTE_PRESETS))
      for (const mode of ["light", "dark"] as const) {
        const s = {
          ...SETTINGS_DEFAULTS,
          ...Object.fromEntries(
            Object.entries(palette).map(([k, v]) => ["appearance." + k, v]),
          ),
        };
        expect(paletteChecks(s, mode).every((c) => c.ratio >= c.minimum)).toBe(
          true,
        );
      }
    for (const color of [
      "#ffffff",
      "#000000",
      "#ffff00",
      "#ff00ff",
      "#00ff00",
      "#888888",
    ])
      for (const mode of ["light", "dark"] as const) {
        const s = {
          ...SETTINGS_DEFAULTS,
          "appearance.primaryLight": color,
          "appearance.primaryDark": color,
        };
        expect(paletteChecks(s, mode).every((c) => c.ratio >= c.minimum)).toBe(
          true,
        );
      }
  });
  it("keeps destructive colors independent from identity and rejects executable settings", () => {
    expect(
      appearanceTokens(
        { ...SETTINGS_DEFAULTS, "appearance.primaryLight": "#006600" },
        "light",
      ).destructive,
    ).toBe(appearanceTokens(SETTINGS_DEFAULTS, "light").destructive);
    const errors = validateSiteSettings({
      ...SETTINGS_DEFAULTS,
      "appearance.primaryLight": "red; background:url(x)",
      "appearance.fontAr": "url(https://example.invalid/font)",
      "identity.icon": "javascript:alert(1)",
      "social.github": "https://user:pass@example.invalid",
      "announcement.startAt": "2026-10-20",
      "announcement.endAt": "2026-10-01",
    });
    for (const key of [
      "appearance.primaryLight",
      "appearance.fontAr",
      "identity.icon",
      "social.github",
      "announcement.endAt",
    ])
      expect(errors[key]).toBeTruthy();
  });
  it("accepts only local media identities and safe links", () => {
    expect(mediaSettingId("/api/media/a-123")).toBe("a-123");
    expect(mediaSettingId("/api/v1/media/a_123")).toBe("a_123");
    for (const url of [
      "//evil.invalid",
      "/\\evil.invalid",
      "javascript:alert(1)",
      "https://example.invalid/\n",
    ])
      expect(safeSettingUrl(url, true)).toBe(false);
    expect(safeSettingUrl("/ar/contact?type=quote", true)).toBe(true);
    expect(safeSettingUrl("https://example.invalid/path")).toBe(true);
  });
});
