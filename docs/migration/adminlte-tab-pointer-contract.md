# AdminLTE tab state assertions

Full local validation of registration head 86dbe49 exposed an inherited design
tour assertion: after clicking a tab it expected the primary text color. The
unchanged AdminLTE stylesheet defines selected tabs with card text/background,
and hovered tabs with accent text/background. A click alone leaves the pointer
over the control unless dialog content resizing moves it. The custom-template
filter's empty content exposes the mismatch in both desktop and mobile tours.

A controlled probe using the real built stylesheet and the tour's custom light
palette measured selected text rgb(33, 37, 41), then hovered text
rgb(157, 23, 77). The old assertion expected the latter in both states. This
explains why earlier passing tours did not prove the selected-state contract.
This is separate from the missing registration POST in CI249; no claim is made
that it caused that historical failure.

The tour now verifies selected ARIA/Radix state, moves the pointer outside the
tab, checks selected foreground and background, explicitly hovers and checks
both hover colors, then restores and verifies selected colors before capture.
All existing page coverage, accessibility, overflow and application-error checks
remain. No product CSS, timeout, retry or skip changes are made. The eight
Arabic/English, light/dark, desktop/mobile tours remain required.

This local test-only change is stacked on registration head 86dbe49 on a separate
branch. Publication is still blocked by the outstanding issue-publication
approval review; no substitute remote publication is attempted. Logs and
screenshots are retained under ignored .migration/acceptance/ci249 and isolated
local shard worktrees. Report final tested heads and actual results separately
from the known failing earlier run.
