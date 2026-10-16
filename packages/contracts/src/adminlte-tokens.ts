/** AdminLTE v4.10.1 / Bootstrap 5.3 defaults, MIT. See docs/design-system/adminlte.md.
 * Values come from the tagged dist/css/adminlte.css, not the changing live demo.
 * Accessibility pairs are resolved in appearanceTokens; saved identity overrides win.
 */
export const ADMINLTE = {
  version: "4.10.1",
  source: "e13df78a4d0c287e5fa57308e293f63e44e9dd0f",
  primary: "#0d6efd",
  primaryDark: "#6ea8fe",
  light: { canvas: "#f8f9fa", card: "#ffffff", text: "#212529", emphasis: "#000000", muted: "#495057", surface: "#e9ecef", border: "#dee2e6", input: "#6c757d" },
  dark: { canvas: "#2b3035", card: "#212529", text: "#dee2e6", emphasis: "#ffffff", muted: "#adb5bd", surface: "#343a40", border: "#495057", input: "#868e96" },
  sidebar: "#343a40",
  sidebarText: "#c2c7d0",
  radius: "0.375rem",
  panelPadding: "1rem",
  rowPadding: "0.5rem",
  controlPadding: "0.375rem",
  sidebarWidth: "250px",
  headerHeight: "57px",
  sidebarBreakpoint: 992,
  cardShadow: "0 0 1px color-mix(in srgb, var(--shadow-color) 12.5%, transparent), 0 1px 3px color-mix(in srgb, var(--shadow-color) 20%, transparent)",
} as const;
