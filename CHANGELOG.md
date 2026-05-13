# Changelog

## [v1.0.0] - 2026-05-12

Initial release. Forked from Universal Battery Card v2.4.0 (Laurence Syree, MIT),
renamed to **Energy Gauge Card** and extended into a multi-section energy card.

### Sections

- **Battery section** (inherited from UBC, opt-out via `show_battery: false`): SOC ring, optional power ring, reserve/cutoff markers, stats panel, configurable header style, color thresholds — all original UBC features preserved
- **Consumption section** (new, opt-in via `show_consumption: true`): 3-segment donut splitting current household consumption into Grid / PV-direct / Battery-discharge, with legend, today's energy totals, and three calculation modes (`composed` / `calculated` / `direct`) so the card adapts to whatever sensors your inverter exposes
- **Solar section** (new, opt-in via `show_solar: true`): total PV gauge on the left + dynamic 2-column panel grid on the right; arbitrary panel count, each with its own peak (Wp) driving the gauge fill and optional energy-today entity

### Layout & customisation

- Card switched from single-section CSS grid to flex column; multi-section auto-detected, height adapts so sections never overflow
- All three sections individually toggleable + reorderable via Up/Down buttons in the editor
- Per-section title text (defaults to "Battery" / "Consumption" / "Solar"), per-section title visibility toggle, shared title font size (em)
- Card-wide name renders above all sections; battery section gets its own independent title
- Battery header: title, state and mode now on separate rows with adjusted font sizes
- Runtime/depletion footer removed
- Custom element renamed: `universal-battery-card` → `energy-gauge-card`

### Editor

- 8 tabs: General, Sections, Battery, Stats, Consumption, Solar, SOC Colors, Filters
- Battery display options (header style, gauge toggles) moved from General to Battery tab
- Solar tab includes a dynamic panel list with add/remove buttons
- Sections tab includes Up/Down reordering controls

## [v2.4.0](https://github.com/laurence-syree/universal-battery-card/releases/tag/v2.4.0) - 2026-05-07

- Overhaul gauge sizing so gauges fill available space at any card size or aspect ratio (#6)
- Remove the hard-coded 200 px gauge cap — gauges now grow to fill the tile they're given
- Measure rendered header/footer heights instead of hard-coding them, so layout stays correct when title text wraps, themes change typography, or rows toggle on/off
- Wrap ResizeObserver callbacks in requestAnimationFrame to batch with paint and prevent the "ResizeObserver loop" warning during editor drag-resize
- `getGridOptions` reports `min_columns` / `min_rows` derived from the configured chrome so the resize handles snap to a size the card can actually render; no upper cap so HA's layout decides the maximum
- Validate config at `setConfig` time with user-readable error messages (out-of-range numbers, inverted SOC thresholds, malformed colour tuples, bad entity IDs); HA surfaces these as red banners in the editor
- Defensively handle missing `ResizeObserver` and other `connectedCallback` failures so older WebViews (e.g. some Amazon Fire HD builds) render the card at CSS defaults instead of a generic "Configuration error" — may help #7

## [v2.3.0](https://github.com/laurence-syree/universal-battery-card/releases/tag/v2.3.0) - 2026-04-09

- Add `power_gauge_scale` option to configure power gauge size relative to main gauge (30-100%, default 78)

## [v2.2.0](https://github.com/laurence-syree/universal-battery-card/releases/tag/v2.2.0) - 2026-04-09

- Add granular display toggles: `show_rate_labels`, `show_power_percent`, `show_power_direction`, `show_gauge_labels`, `show_capacity`, `show_stats` (@ParaDoXke - #4)

## [v2.1.0](https://github.com/laurence-syree/universal-battery-card/releases/tag/v2.1.0) - 2026-04-06

- Add `invert_power` option to reverse power entity value sign (@cbrosius - #3)

## [v2.0.1](https://github.com/laurence-syree/universal-battery-card/releases/tag/v2.0.1) - 2026-01-14

- Update README for HACS default repository

## [v2.0.0](https://github.com/laurence-syree/universal-battery-card/releases/tag/v2.0.0) - 2026-01-13

- Redesign card with circular gauges
- Add responsive sizing with ResizeObserver
- Add entity-specific click handlers for more-info dialogs
- Add display toggle options and header styles (none/title/full)
- Add power gauge directional fill (clockwise charging, counter-clockwise discharging)
- Remove unused Icons tab from editor

## [v1.5.1](https://github.com/laurence-syree/universal-battery-card/releases/tag/v1.5.1) - 2026-01-09

- Add HACS validation GitHub Action
- Fix invalid description field in hacs.json

## [v1.5.0](https://github.com/laurence-syree/universal-battery-card/releases/tag/v1.5.0) - 2026-01-07

- Add loading state
- Add compact mode

## [v1.4.4](https://github.com/laurence-syree/universal-battery-card/releases/tag/v1.4.4) - 2026-01-07

- Code review fixes

## [v1.4.3](https://github.com/laurence-syree/universal-battery-card/releases/tag/v1.4.3) - 2026-01-07

- Add JSDoc documentation and code quality fixes

## [v1.4.1](https://github.com/laurence-syree/universal-battery-card/releases/tag/v1.4.1) - 2026-01-07

- Reduce card vertical spacing for compact layout

## [v1.4.0](https://github.com/laurence-syree/universal-battery-card/releases/tag/v1.4.0) - 2026-01-07

- Add charge/discharge rate display
- Add MIT license

## [v1.3.0](https://github.com/laurence-syree/universal-battery-card/releases/tag/v1.3.0) - 2026-01-07

- Add tap/hold/double-tap action support
- Add hover highlight effect
- Add optional state and mode entity support
- Use title case for status text
