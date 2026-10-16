import { describe, it, expect } from "vitest";
import { ADMINLTE_THEME_PRESETS, ADMINLTE_BACKGROUNDS, adminltePresetSettings } from "./adminlte-themes.js";
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
  it("validates all pinned presets and region colors with AA pairs in both modes", () => {
    expect(ADMINLTE_THEME_PRESETS).toHaveLength(29);
    for (const preset of ADMINLTE_THEME_PRESETS) {
      const settings = adminltePresetSettings(preset);
      expect(validateSiteSettings(settings), preset.id).toEqual({});
      for (const mode of ["light", "dark"] as const)
        expect(paletteChecks(settings, mode).filter(check => check.ratio < check.minimum), `${preset.id}/${mode}`).toEqual([]);
    }
    for (const background of ADMINLTE_BACKGROUNDS) for (const mode of ["light", "dark"] as const) {
      const settings = Object.fromEntries(["sidebar", "header", "footer"].map(region => [`appearance.${region}Background`, background]));
      expect(paletteChecks(settings, mode).filter(check => check.ratio < check.minimum), `${background}/${mode}`).toEqual([]);
    }
    expect(validateSiteSettings({ "appearance.headerBackground": "url(https://example.invalid/x)" })).toHaveProperty("appearance.headerBackground", "choice");
    expect(validateSiteSettings({ "appearance.sidebarMode": "untrusted" })).toHaveProperty("appearance.sidebarMode", "choice");
  });
  it("uses pinned AdminLTE defaults while retaining every stored customization", () => {
    const reference = appearanceTokens({}, "light");
    expect(reference.card).toBe("#ffffff");
    expect(reference.background).toBe("#f8f9fa");
    expect(reference.foreground).toBe("#212529");
    expect(reference.radius).toBe("0.375rem");
    expect(reference["sidebar-width"]).toBe("250px");
    expect(reference["space-panel"]).toBe("1rem");
    expect(reference["row-padding"]).toBe("0.5rem");
    const stored = { "appearance.radius":"soft", "appearance.density":"comfortable", "appearance.primaryLight":"#0369a1", "appearance.fontEn":"ibm" };
    const frozen = JSON.stringify(stored);
    const custom = appearanceTokens(stored, "light");
    expect(custom.radius).toBe("0.75rem");
    expect(custom["panel-radius"]).toBe("1rem");
    expect(custom["space-panel"]).toBe("1.5rem");
    expect(custom["row-padding"]).toBe("0.875rem");
    expect(custom.primary).toBe("#0369a1");
    expect(JSON.stringify(stored)).toBe(frozen);
    expect(validateSiteSettings({ "appearance.fontEn":"source", "appearance.radius":"adminlte", "appearance.density":"adminlte" })).toEqual({});
  });
  it("keeps all administration profiles readable with extreme palettes and preserves absent-key defaults", () => {
    for (const style of ["light", "semi-dark", "dark", "colored"])
      for (const mode of ["light", "dark"] as const)
        for (const primary of ["#ffffff", "#000000", "#ffff00", "#ff00ff", "#00ff00", "#0369a1"])
          expect(paletteChecks({"appearance.adminStyle": style, "appearance.primaryLight": primary, "appearance.primaryDark": primary}, mode).every(check => check.ratio >= check.minimum)).toBe(true);
    expect(appearanceTokens({}, "light")).toEqual(appearanceTokens({"appearance.adminStyle":"semi-dark"}, "light"));
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
