# AdminLTE #176 review evidence

Baseline: develop `4922dcfc1823e730d0f8d04341516fde9eb9f6a2` (remote independently checked 2026-10-16). Reference: AdminLTE v4.10.1 `e13df78a4d0c287e5fa57308e293f63e44e9dd0f`.

Before/after screenshots use the repository's isolated MariaDB/browser fixtures and normal CSRF + credentials login. No fabricated session, credentials reset or production data. The same synthetic names/content and dashboard metric counts were used; fixture identifiers and login timestamps naturally differ between runs. Full local screenshot matrices are under `.migration/adminlte-176` and `.migration/176-baseline/.migration/adminlte-176` (ignored). This checked-in selection is synthetic.

- [Before dashboard](before/dashboard-en-light-desktop.png) / [after dashboard](after/dashboard-en-light-desktop.png)
- [Before Arabic mobile appearance](before/appearance-ar-dark-mobile.png) / [after Arabic mobile appearance](after/appearance-ar-dark-mobile.png)

Final captures include the shared PanelHeader slots and React portal preview. [Compact draft preview](after/appearance-compact-draft-ar-mobile.png) also verifies that a local density change updates actual controls without saving settings.

Visual inspection confirmed substantial icon blocks/outline cards, active navigation, muted workspace and a real-component preview. Appearance preview remains independently light by default even when the host is dark, as its explicit preview-mode selector requests. It does not change the saved theme.

Final coordinated profiles (implementation source `e1df3c9ad3fa8788d82638d398814d3219fa9429`):

- [Light](profiles/light-en-desktop.png)
- [Semi-dark sidebar](profiles/semi-dark-en-desktop.png)
- [Full dark](profiles/full-dark-en-desktop.png)
- [Colored header and dark sidebar](profiles/colored-en-desktop.png)
- [Arabic mobile drawer](profiles/colored-ar-mobile-navigation.png)

Profile images deliberately capture the independent preview before the save step, so an unsaved-default-mode indicator can be visible. The browser cases then save through the checked UI endpoint, reload, verify persisted style/default mode, and verify the personal mode preference is unchanged. Final capture matrix: four profiles × two languages × two personal modes × two viewports, plus drawer/compact states. They show four implemented profiles, not all 17 demo skins. The full-dark image uses the dark personal mode; an explicit personal light choice remains respected.

The colored search hover/focus regression was reproduced in the actual browser before correction. [Before](profiles/colored-search-hover-before.png), [corrected English light](profiles/colored-search-hover-en-light.png), [corrected Arabic dark](profiles/colored-search-hover-ar-dark.png). The colored topbar uses an opaque accent hover surface so dark ghost controls cannot blend into an insufficient-contrast background. Text/icons now inherit the Button interaction foreground; the shortcut has an explicit accent/foreground pair. The profile matrix checks focus visibility, hovered child colors and axe for search and adjacent topbar buttons.
