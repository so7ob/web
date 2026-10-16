/** AdminLTE v4.10.1 generate/theme.html and optional palette sheets, Colorlib, MIT.
 * Pinned source e13df78a4d0c287e5fa57308e293f63e44e9dd0f. No upstream JS controllers.
 * Palette identifiers are namespaced so the original and designed values never collide.
 */
export const ADMINLTE_PALETTES = {
  "designed": {
    "orange": "#c84e10",
    "amber": "#a56710",
    "olive": "#5f7f0f",
    "teal": "#12827d",
    "sky": "#127caf",
    "indigo": "#6f60ea",
    "violet": "#9553db",
    "fuchsia": "#b347be",
    "pink": "#cd388d",
    "navy": "#1d2d4c",
    "steel": "#3a4860",
    "slate": "#566577",
    "graphite": "#32363c",
    "midnight": "#1e1d2d"
  },
  "v3": {
    "lightblue": "#3c8dbc",
    "navy": "#001f3f",
    "olive": "#3d9970",
    "lime": "#01ff70",
    "fuchsia": "#f012be",
    "maroon": "#d81b60",
    "blue": "#007bff",
    "indigo": "#6610f2",
    "purple": "#6f42c1",
    "pink": "#e83e8c",
    "red": "#dc3545",
    "orange": "#fd7e14",
    "yellow": "#ffc107",
    "green": "#28a745",
    "teal": "#20c997",
    "cyan": "#17a2b8",
    "gray": "#6c757d",
    "gray-dark": "#343a40"
  }
} as const;
export const ADMINLTE_BASE_COLORS: Record<string, string> = {
  primary: "#0d6efd", secondary: "#6c757d", success: "#198754", danger: "#dc3545",
  warning: "#ffc107", info: "#0dcaf0", light: "#f8f9fa", dark: "#212529", black: "#000000", white: "#ffffff",
};
export const ADMINLTE_CHROME_KEYS = ["sidebar", "header", "footer"] as const;
export const ADMINLTE_BACKGROUNDS = [
  "inherit", "body", "body-secondary", "body-tertiary",
  ...Object.keys(ADMINLTE_BASE_COLORS).flatMap(name => [name, `${name}-subtle`]),
  ...Object.entries(ADMINLTE_PALETTES).flatMap(([family, colors]) => Object.keys(colors).flatMap(name => [`${family}:${name}`, `${family}:${name}:gradient`])),
];
export const ADMINLTE_THEME_PRESETS = [
  {"id": "designed-0", "family": "designed", "label": "Light", "sidebar": "body", "sidebarMode": "light", "header": "body", "headerMode": "light", "primary": "#0d6efd"},
  {"id": "designed-1", "family": "designed", "label": "Light & indigo", "sidebar": "body-tertiary", "sidebarMode": "light", "header": "designed:indigo", "headerMode": "dark", "primary": "#6f60ea"},
  {"id": "designed-2", "family": "designed", "label": "Light & sky", "sidebar": "body", "sidebarMode": "light", "header": "designed:sky", "headerMode": "dark", "primary": "#127caf"},
  {"id": "designed-3", "family": "designed", "label": "Default", "sidebar": "body-secondary", "sidebarMode": "dark", "header": "body", "headerMode": "light", "primary": "#0d6efd"},
  {"id": "designed-4", "family": "designed", "label": "Graphite", "sidebar": "designed:graphite", "sidebarMode": "dark", "header": "body", "headerMode": "light", "primary": "#6f60ea"},
  {"id": "designed-5", "family": "designed", "label": "Navy", "sidebar": "designed:navy", "sidebarMode": "dark", "header": "body", "headerMode": "light", "primary": "#12827d"},
  {"id": "designed-6", "family": "designed", "label": "Steel", "sidebar": "designed:steel", "sidebarMode": "dark", "header": "body", "headerMode": "light", "primary": "#127caf"},
  {"id": "designed-7", "family": "designed", "label": "Midnight", "sidebar": "designed:midnight", "sidebarMode": "dark", "header": "body", "headerMode": "light", "primary": "#9553db"},
  {"id": "designed-8", "family": "designed", "label": "Indigo", "sidebar": "designed:indigo", "sidebarMode": "dark", "header": "body", "headerMode": "light", "primary": "#6f60ea"},
  {"id": "designed-9", "family": "designed", "label": "Navy & sky", "sidebar": "designed:navy", "sidebarMode": "dark", "header": "designed:sky", "headerMode": "dark", "primary": "#127caf"},
  {"id": "designed-10", "family": "designed", "label": "Midnight mono", "sidebar": "designed:midnight", "sidebarMode": "dark", "header": "designed:midnight", "headerMode": "dark", "primary": "#6f60ea"},
  {"id": "designed-11", "family": "designed", "label": "Steel mono", "sidebar": "designed:steel", "sidebarMode": "dark", "header": "designed:steel", "headerMode": "dark", "primary": "#127caf"},
  {"id": "designed-12", "family": "designed", "label": "Slate & teal", "sidebar": "designed:slate", "sidebarMode": "dark", "header": "designed:teal", "headerMode": "dark", "primary": "#12827d"},
  {"id": "designed-13", "family": "designed", "label": "Graphite & orange", "sidebar": "designed:graphite", "sidebarMode": "dark", "header": "designed:orange", "headerMode": "dark", "primary": "#c84e10"},
  {"id": "designed-14", "family": "designed", "label": "Violet mono", "sidebar": "designed:violet", "sidebarMode": "dark", "header": "designed:violet", "headerMode": "dark", "primary": "#9553db"},
  {"id": "designed-15", "family": "designed", "label": "Gradient indigo", "sidebar": "designed:indigo:gradient", "sidebarMode": "dark", "header": "body", "headerMode": "light", "primary": "#6f60ea"},
  {"id": "designed-16", "family": "designed", "label": "Gradient teal", "sidebar": "designed:teal:gradient", "sidebarMode": "dark", "header": "body", "headerMode": "light", "primary": "#12827d"},
  {"id": "v3-17", "family": "v3", "label": "Blue", "sidebar": "v3:gray-dark", "sidebarMode": "dark", "header": "v3:lightblue", "headerMode": "dark", "primary": "#3c8dbc"},
  {"id": "v3-18", "family": "v3", "label": "Black", "sidebar": "v3:gray-dark", "sidebarMode": "dark", "header": "body", "headerMode": "light", "primary": "#007bff"},
  {"id": "v3-19", "family": "v3", "label": "Purple", "sidebar": "v3:gray-dark", "sidebarMode": "dark", "header": "v3:purple", "headerMode": "dark", "primary": "#6f42c1"},
  {"id": "v3-20", "family": "v3", "label": "Green", "sidebar": "v3:gray-dark", "sidebarMode": "dark", "header": "v3:green", "headerMode": "dark", "primary": "#28a745"},
  {"id": "v3-21", "family": "v3", "label": "Red", "sidebar": "v3:gray-dark", "sidebarMode": "dark", "header": "v3:red", "headerMode": "dark", "primary": "#dc3545"},
  {"id": "v3-22", "family": "v3", "label": "Yellow", "sidebar": "v3:gray-dark", "sidebarMode": "dark", "header": "v3:yellow", "headerMode": "light", "primary": "#ffc107"},
  {"id": "v3-23", "family": "v3", "label": "Blue light", "sidebar": "body", "sidebarMode": "light", "header": "v3:lightblue", "headerMode": "dark", "primary": "#3c8dbc"},
  {"id": "v3-24", "family": "v3", "label": "Black light", "sidebar": "body", "sidebarMode": "light", "header": "body", "headerMode": "light", "primary": "#007bff"},
  {"id": "v3-25", "family": "v3", "label": "Purple light", "sidebar": "body", "sidebarMode": "light", "header": "v3:purple", "headerMode": "dark", "primary": "#6f42c1"},
  {"id": "v3-26", "family": "v3", "label": "Green light", "sidebar": "body", "sidebarMode": "light", "header": "v3:green", "headerMode": "dark", "primary": "#28a745"},
  {"id": "v3-27", "family": "v3", "label": "Red light", "sidebar": "body", "sidebarMode": "light", "header": "v3:red", "headerMode": "dark", "primary": "#dc3545"},
  {"id": "v3-28", "family": "v3", "label": "Yellow light", "sidebar": "body", "sidebarMode": "light", "header": "v3:yellow", "headerMode": "light", "primary": "#ffc107"},
 ] as const;
export function adminltePresetSettings(preset: typeof ADMINLTE_THEME_PRESETS[number]): Record<string, string> {
  return {
    "appearance.adminStyle": preset.sidebarMode === "light" ? "light" : "semi-dark",
    "appearance.sidebarBackground": preset.sidebar, "appearance.sidebarMode": preset.sidebarMode,
    "appearance.headerBackground": preset.header, "appearance.headerMode": preset.headerMode,
    "appearance.footerBackground": "body", "appearance.footerMode": "light",
    "appearance.primaryLight": preset.primary, "appearance.primaryDark": preset.primary,
  };
}
