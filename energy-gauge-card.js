/**
 * Energy Gauge Card
 * A Home Assistant Lovelace card with battery, consumption, and solar gauges.
 *
 * Based on Universal Battery Card by Laurence Syree (MIT-licensed)
 *   https://github.com/laurence-syree/universal-battery-card
 * Universal Battery Card is itself based on givtcp-battery-card by Codegnosis
 *   https://github.com/Codegnosis/givtcp-battery-card
 */

const LitElement = Object.getPrototypeOf(customElements.get('ha-panel-lovelace'));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const CARD_NAME = 'Energy Gauge Card';
const CARD_DESCRIPTION = 'Battery, consumption, and solar gauges for Home Assistant';
const VERSION = '1.0.1';

const DEFAULT_CONFIG = {
  name: 'Battery',
  language: 'auto',   // 'auto' = follow HA UI language; otherwise 'en', 'de', 'fr', 'es'
  soc_threshold_very_high: 80,
  soc_threshold_high: 60,
  soc_threshold_medium: 40,
  soc_threshold_low: 20,
  soc_colour_very_high: [0, 128, 0],
  soc_colour_high: [0, 128, 0],
  soc_colour_medium: [255, 166, 0],
  soc_colour_low: [219, 68, 55],
  soc_colour_very_low: [139, 0, 0],
  decimal_places: 3,
  enable_trickle_charge_filter: false,
  trickle_charge_threshold: 25,
  // New v2.0 options
  temp_entity: null,
  cycles_entity: null,
  health_entity: null,
  cutoff_entity: null,
  cutoff: null,
  gauge_thickness: 15, // Ring thickness as % of gauge (5-15, default 15)
  power_gauge_scale: 78, // Power gauge size as % of main gauge (30-100, default 78)
  show_rates: true,
  show_rate_labels: true,
  show_gauge_labels: true,
  show_power_percent: true,
  show_power_direction: true,
  show_capacity: true,
  show_stats: true,
  header_style: 'full', // 'none', 'title', 'full'
  invert_power: false,

  // ============================================================
  // Section toggles (which gauge sections to show)
  // ============================================================
  show_battery: true,
  show_consumption: false,
  show_solar: false,

  // Per-section titles. null/empty falls back to the default
  // ('Battery' for battery, 'Consumption' / 'Solar' for the others).
  battery_section_title: null,
  consumption_section_title: null,
  solar_section_title: null,
  // Title visibility per section
  show_battery_title: true,
  show_consumption_title: true,
  show_solar_title: true,
  // Font size (em) for all three section titles.
  section_title_font_size: 1.0,
  // Rendering order. Unknown keys are dropped, missing keys are appended.
  section_order: ['battery', 'consumption', 'solar'],

  // ============================================================
  // Consumption section
  // ============================================================
  consumption_entity: null,                    // Total household consumption (W)
  consumption_calc_mode: 'composed',           // 'composed' | 'calculated' | 'direct'
  // -- composed mode: three explicit source sensors (all positive W)
  grid_import_entity: null,                    // Grid import (W, >= 0)
  pv_direct_entity: null,                      // PV consumed directly by house (W, >= 0)
  battery_discharge_entity: null,              // Battery discharge to house (W, >= 0)
  // -- calculated mode: signed source sensors, the card derives the split
  grid_power_entity: null,                     // Grid power signed (+ import, - export)
  grid_invert: false,                          // Flip sign convention for grid_power_entity
  battery_consumption_invert: false,           // Flip sign for battery_power source in calc mode
  // -- direct mode: PV self-consumption sensor + grid + battery power
  pv_self_consumption_entity: null,            // PV consumed directly (W)
  // Tagesenergie (kWh)
  consumption_energy_today_entity: null,
  grid_energy_today_entity: null,
  pv_self_energy_today_entity: null,
  battery_discharge_energy_today_entity: null,
  // Display
  consumption_color_grid: [219, 68, 55],
  consumption_color_pv: [255, 166, 0],
  consumption_color_battery: [0, 128, 0],
  show_consumption_legend: true,
  show_consumption_energy_today: true,
  consumption_gauge_scale: 70,                 // % of main battery gauge size

  // ============================================================
  // Solar section
  // ============================================================
  pv_total_entity: null,                       // Total PV power (W)
  pv_total_peak: null,                         // Total system peak (Wp); auto-summed from panels if null
  pv_total_energy_today_entity: null,          // Today's total PV energy (kWh)
  pv_panels: [],                               // [{ entity, name?, peak, energy_today_entity? }]
  solar_color: [255, 166, 0],
  show_solar_energy_today: true,
  solar_panel_cols: 2,                         // Panel grid columns (4 panels = 2x2 by default)
  solar_total_gauge_scale: 70,                 // Summen-Gauge: % of main battery gauge size
  solar_panel_gauge_scale: 45,                 // Per-Panel-Gauges: % of main battery gauge size
};

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

// Gauge sizing
const HARD_FLOOR_PX = 40;              // absolute minimum gauge diameter — below this gauges are unreadable
const GAUGE_PADDING_PX = 20;           // .gauges-container has 10px top + 10px bottom

// Card chrome
const CARD_PADDING_X = 32;             // ha-card 16px left + 16px right
const CARD_PADDING_Y = 32;             // ha-card 16px top + 16px bottom
const HEADER_FALLBACK_FULL = 96;       // pre-render estimate for full header
const HEADER_FALLBACK_TITLE = 30;      // pre-render estimate for title-only header
const FOOTER_FALLBACK = 48;            // pre-render estimate for runtime footer

// Gauge gap heuristic: ramps from MIN at narrow widths to MAX at wide widths.
// `(availableWidth - WIDE) * SLOPE` is the ramp expression.
const GAUGE_GAP_MIN = 10;
const GAUGE_GAP_MAX = 40;
const GAUGE_GAP_RAMP_WIDTH = 200;      // availableWidth at which ramp starts producing >MIN
const GAUGE_GAP_RAMP_SLOPE = 0.15;

// Encroach (gauges-into-header) decision
const ENCROACH_SAFETY_PX = 24;         // breathing room between gauge edge and header text
const ENCROACH_THRESHOLD_PX = 4;       // min size gain to bother engaging encroach

// Auto-hide thresholds
const LABELS_HIDE_BELOW_PX = 120;                // reserve/cutoff labels overlap below this
const LABELS_HIDE_BELOW_PX_WITH_HEADER = 140;    // ...and earlier when a header is present
const STATS_PANEL_HIDE_BELOW_PX = 350;           // stats panel hidden when card narrower than this

// HA layout grid units
const MASONRY_UNIT_PX = 50;            // masonry view: 1 getCardSize unit
const SECTION_COL_PX = 30;             // sections view grid cell width
const SECTION_ROW_PX = 56;             // sections view grid cell height
const SECTION_GAP_PX = 8;              // gap between section cells

// ============================================================================
// I18N — Translations
// ============================================================================

const TRANSLATIONS = {
  en: {
    battery: 'Battery',
    consumption: 'Consumption',
    consumption_label: 'Consumption',
    solar: 'Solar',
    pv_total: 'PV total',
    grid: 'Grid',
    solar_short: 'Solar',
    battery_short: 'Battery',
    today: 'today',
    today_colon: 'today:',
    charging: 'Charge',
    discharging: 'Discharge',
    idle: 'Idle',
    max_charge: 'Max Charge',
    max_discharge: 'Max Discharge',
    capacity: 'Capacity',
    reserve: 'Reserve',
    cutoff: 'Cutoff',
    mode: 'Mode',
    temp: 'Battery Temp',
    cycles: 'Battery Cycles',
    health: 'Battery Health',
    loading: 'Loading...',
    configure_entities: 'Configure entities to get started',
    no_sections: 'No sections enabled. Use the editor to enable Battery, Consumption, or Solar.',
    battery_sensors_unavailable: 'Unable to read battery sensor values',
    consumption_sensors_unavailable: 'Consumption sensors not configured',
    solar_sensors_unavailable: 'No solar entities configured',
  },
  de: {
    battery: 'Batterie',
    consumption: 'Verbrauch',
    consumption_label: 'Verbrauch',
    solar: 'Solar',
    pv_total: 'PV gesamt',
    grid: 'Netz',
    solar_short: 'Solar',
    battery_short: 'Akku',
    today: 'heute',
    today_colon: 'heute:',
    charging: 'Laden',
    discharging: 'Entladen',
    idle: 'Bereit',
    max_charge: 'Max Laden',
    max_discharge: 'Max Entladen',
    capacity: 'Kapazität',
    reserve: 'Reserve',
    cutoff: 'Cutoff',
    mode: 'Modus',
    temp: 'Batterie-Temp.',
    cycles: 'Ladezyklen',
    health: 'Batterie-Gesundheit',
    loading: 'Lädt...',
    configure_entities: 'Entitäten konfigurieren zum Starten',
    no_sections: 'Keine Sektionen aktiv. Aktiviere im Editor Batterie, Verbrauch oder Solar.',
    battery_sensors_unavailable: 'Batterie-Sensoren nicht lesbar',
    consumption_sensors_unavailable: 'Verbrauchs-Sensoren nicht konfiguriert',
    solar_sensors_unavailable: 'Keine Solar-Entitäten konfiguriert',
  },
  fr: {
    battery: 'Batterie',
    consumption: 'Consommation',
    consumption_label: 'Consommation',
    solar: 'Solaire',
    pv_total: 'PV total',
    grid: 'Réseau',
    solar_short: 'Solaire',
    battery_short: 'Batterie',
    today: 'aujourd\'hui',
    today_colon: 'aujourd\'hui :',
    charging: 'Charge',
    discharging: 'Décharge',
    idle: 'Inactif',
    max_charge: 'Charge max',
    max_discharge: 'Décharge max',
    capacity: 'Capacité',
    reserve: 'Réserve',
    cutoff: 'Limite',
    mode: 'Mode',
    temp: 'Temp. batterie',
    cycles: 'Cycles batterie',
    health: 'Santé batterie',
    loading: 'Chargement...',
    configure_entities: 'Configurer les entités pour démarrer',
    no_sections: 'Aucune section activée. Utilisez l\'éditeur pour activer Batterie, Consommation ou Solaire.',
    battery_sensors_unavailable: 'Capteurs de batterie indisponibles',
    consumption_sensors_unavailable: 'Capteurs de consommation non configurés',
    solar_sensors_unavailable: 'Aucune entité solaire configurée',
  },
  es: {
    battery: 'Batería',
    consumption: 'Consumo',
    consumption_label: 'Consumo',
    solar: 'Solar',
    pv_total: 'PV total',
    grid: 'Red',
    solar_short: 'Solar',
    battery_short: 'Batería',
    today: 'hoy',
    today_colon: 'hoy:',
    charging: 'Cargando',
    discharging: 'Descargando',
    idle: 'Inactivo',
    max_charge: 'Carga máx',
    max_discharge: 'Descarga máx',
    capacity: 'Capacidad',
    reserve: 'Reserva',
    cutoff: 'Límite',
    mode: 'Modo',
    temp: 'Temp. batería',
    cycles: 'Ciclos de batería',
    health: 'Salud de batería',
    loading: 'Cargando...',
    configure_entities: 'Configurar entidades para empezar',
    no_sections: 'Ninguna sección activada. Usa el editor para activar Batería, Consumo o Solar.',
    battery_sensors_unavailable: 'Sensores de batería no disponibles',
    consumption_sensors_unavailable: 'Sensores de consumo no configurados',
    solar_sensors_unavailable: 'No hay entidades solares configuradas',
  },
};

const SUPPORTED_LANGUAGES = ['auto', 'en', 'de', 'fr', 'es'];

function pickLanguage(hass, config) {
  const configured = ((config && config.language) || 'auto').toLowerCase();
  if (configured !== 'auto' && TRANSLATIONS[configured]) return configured;
  const hassLang = ((hass && (hass.locale?.language || hass.language)) || 'en').slice(0, 2).toLowerCase();
  return TRANSLATIONS[hassLang] ? hassLang : 'en';
}

function tr(key, hass, config) {
  const lang = pickLanguage(hass, config);
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Gets a value from either a fixed config value or an entity state
 * @param {Object} hass - Home Assistant instance
 * @param {Object} config - Card configuration
 * @param {string} entityKey - Config key for entity ID
 * @param {string} fixedKey - Config key for fixed value
 * @param {string} [defaultUnit=''] - Default unit if not provided
 * @returns {{value: number|null, unit: string, available: boolean, isFixed: boolean}}
 */
function getEntityOrFixedValue(hass, config, entityKey, fixedKey, defaultUnit = '') {
  // Check for fixed value first
  const fixedValue = config[fixedKey];
  if (fixedValue !== undefined && fixedValue !== null && fixedValue !== '') {
    return { value: parseFloat(fixedValue), unit: defaultUnit, available: true, isFixed: true };
  }

  // Fall back to entity
  const entityId = config[entityKey];
  if (!entityId) return { value: null, unit: '', available: false, isFixed: false };

  const entity = hass.states[entityId];
  if (!entity) return { value: null, unit: '', available: false, isFixed: false };

  const state = parseFloat(entity.state);
  if (isNaN(state)) return { value: null, unit: '', available: false, isFixed: false };

  const unit = entity.attributes.unit_of_measurement || defaultUnit;
  return { value: state, unit, available: true, isFixed: false };
}

/**
 * Gets a numeric value from an entity state
 * @param {Object} hass - Home Assistant instance
 * @param {string} entityId - Entity ID to read
 * @returns {{value: number|null, unit: string, available: boolean}}
 */
function getEntityValue(hass, entityId) {
  if (!entityId) return { value: null, unit: '', available: false };
  const entity = hass.states[entityId];
  if (!entity) return { value: null, unit: '', available: false };
  const state = parseFloat(entity.state);
  if (isNaN(state)) return { value: null, unit: '', available: false };
  const unit = entity.attributes.unit_of_measurement || '';
  return { value: state, unit, available: true };
}

/**
 * Checks if an entity exists in Home Assistant
 * @param {Object} hass - Home Assistant instance
 * @param {string} entityId - Entity ID to check
 * @returns {boolean}
 */
function entityExists(hass, entityId) {
  return entityId && entityId in hass.states;
}

/**
 * Converts kW/kWh values to W/Wh (multiplies by 1000)
 * @param {number} value - The value to normalize
 * @param {string} unit - The unit (kW, kWh, W, Wh)
 * @returns {number} Value in base units (W or Wh)
 */
function normalizeUnit(value, unit) {
  const lowerUnit = (unit || '').toLowerCase();
  if (lowerUnit === 'kwh' || lowerUnit === 'kw') return value * 1000;
  return value;
}

/**
 * Formats energy value with appropriate unit (Wh or kWh)
 * @param {number} wh - Energy in watt-hours
 * @param {number} [decimals=3] - Decimal places for kWh
 * @returns {{value: string, unit: string}}
 */
function formatEnergy(wh, decimals = 3) {
  if (Math.abs(wh) >= 1000) {
    return { value: (wh / 1000).toFixed(decimals), unit: 'kWh' };
  }
  return { value: wh.toFixed(0), unit: 'Wh' };
}

/**
 * Formats power value with appropriate unit (W or kW)
 * @param {number} watts - Power in watts
 * @param {number} [decimals=0] - Decimal places
 * @returns {{value: string, unit: string}}
 */
function formatPower(watts, decimals = 0) {
  if (Math.abs(watts) >= 1000) {
    return { value: (watts / 1000).toFixed(decimals || 1), unit: 'kW' };
  }
  return { value: Math.round(watts).toString(), unit: 'W' };
}

/**
 * Formats minutes as HH:MM:SS duration string
 * @param {number|null} minutes - Duration in minutes
 * @returns {string} Formatted duration or '--:--:--'
 */
function formatDuration(minutes) {
  if (minutes === null || minutes < 0) return '--:--:--';
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor((minutes * 60) % 60);
  if (hours > 99) return '99:59:59+';
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculates and formats estimated time of arrival
 * @param {number|null} minutes - Minutes from now
 * @returns {string} Formatted as 'MM/DD HH:MM' or '--/-- --:--'
 */
function formatTimeOfArrival(minutes) {
  if (minutes === null || minutes < 0) return '--/-- --:--';
  const now = new Date();
  const arrival = new Date(now.getTime() + minutes * 60000);
  const month = (arrival.getMonth() + 1).toString().padStart(2, '0');
  const day = arrival.getDate().toString().padStart(2, '0');
  const hours = arrival.getHours().toString().padStart(2, '0');
  const mins = arrival.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
}

/**
 * Calculates time to reach target energy level
 * @param {number} currentEnergy - Current energy in Wh
 * @param {number} targetEnergy - Target energy in Wh
 * @param {number} powerWatts - Current power (+ charging, - discharging)
 * @returns {number|null} Minutes to target or null if unreachable
 */
function calculateTimeToTarget(currentEnergy, targetEnergy, powerWatts) {
  if (powerWatts === 0) return null;
  const energyDiff = targetEnergy - currentEnergy;
  if ((energyDiff > 0 && powerWatts < 0) || (energyDiff < 0 && powerWatts > 0)) return null;
  const hours = Math.abs(energyDiff) / Math.abs(powerWatts);
  return hours * 60;
}

/**
 * Determines battery status from power value
 * @param {number} power - Power in watts (+ charging, - discharging)
 * @param {number} [threshold=0] - Minimum power to consider active
 * @returns {'charging'|'discharging'|'idle'}
 */
function getBatteryStatus(power, threshold = 0) {
  if (power > threshold) return 'charging';
  if (power < -threshold) return 'discharging';
  return 'idle';
}

/**
 * Gets the color for a SOC percentage based on thresholds
 * @param {number} socPercent - State of charge percentage
 * @param {Object} config - Card configuration with threshold/color settings
 * @returns {string} CSS color value (rgb() or var())
 */
function getSocColor(socPercent, config) {
  const thresholds = [
    { threshold: config.soc_threshold_very_high ?? 80, color: config.soc_colour_very_high ?? [0, 128, 0] },
    { threshold: config.soc_threshold_high ?? 60, color: config.soc_colour_high ?? [0, 128, 0] },
    { threshold: config.soc_threshold_medium ?? 40, color: config.soc_colour_medium ?? [255, 166, 0] },
    { threshold: config.soc_threshold_low ?? 20, color: config.soc_colour_low ?? [219, 68, 55] },
  ];

  for (const t of thresholds) {
    if (socPercent >= t.threshold) {
      if (typeof t.color === 'string') return `var(${t.color})`;
      if (Array.isArray(t.color)) return `rgb(${t.color[0]}, ${t.color[1]}, ${t.color[2]})`;
    }
  }

  const veryLow = config.soc_colour_very_low ?? [139, 0, 0];
  if (typeof veryLow === 'string') return `var(${veryLow})`;
  return `rgb(${veryLow[0]}, ${veryLow[1]}, ${veryLow[2]})`;
}


/**
 * Gets the battery level icon for a SOC percentage
 * @param {number} socPercent - State of charge percentage
 * @returns {string} MDI battery icon name
 */
function getBatteryIcon(socPercent) {
  if (socPercent >= 95) return 'mdi:battery';
  if (socPercent >= 85) return 'mdi:battery-90';
  if (socPercent >= 75) return 'mdi:battery-80';
  if (socPercent >= 65) return 'mdi:battery-70';
  if (socPercent >= 55) return 'mdi:battery-60';
  if (socPercent >= 45) return 'mdi:battery-50';
  if (socPercent >= 35) return 'mdi:battery-40';
  if (socPercent >= 25) return 'mdi:battery-30';
  if (socPercent >= 15) return 'mdi:battery-20';
  if (socPercent >= 5) return 'mdi:battery-10';
  return 'mdi:battery-outline';
}

/**
 * Fires a custom DOM event
 * @param {HTMLElement} node - Element to dispatch from
 * @param {string} type - Event type name
 * @param {Object} [detail={}] - Event detail data
 */
function fireEvent(node, type, detail = {}) {
  node.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

/**
 * Converts a colour config value (CSS variable name string or [r,g,b] array)
 * into a CSS-usable colour string.
 */
function rgbToCss(value, fallback = 'var(--primary-color)') {
  if (typeof value === 'string') {
    return value.startsWith('var(') || value.startsWith('rgb') || value.startsWith('#')
      ? value
      : `var(${value})`;
  }
  if (Array.isArray(value) && value.length === 3) {
    return `rgb(${value[0]}, ${value[1]}, ${value[2]})`;
  }
  return fallback;
}

/**
 * Reads an entity value and normalises it to W (from kW) — used for power
 * sensors that may be reported in either unit. Returns 0 when unavailable.
 */
function readPowerWatts(hass, entityId) {
  if (!entityId) return { value: 0, available: false };
  const v = getEntityValue(hass, entityId);
  if (!v.available || v.value === null) return { value: 0, available: false };
  return { value: normalizeUnit(v.value, v.unit), available: true };
}

// ============================================================================
// STYLES
// ============================================================================

const cardStyles = css`
  :host {
    display: block;
    height: 100%;
    --ubc-text-color: var(--primary-text-color);
    --ubc-secondary-text: var(--secondary-text-color);
    --ubc-gauge-bg: var(--divider-color, #3a3a3a);
    --ubc-gauge-size: 180px;
    --ubc-power-gauge-size: 140px;
  }

  ha-card {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 16px;
    overflow: hidden;
  }

  /* Single-section mode: behave like the original UBC card — fill the
     allotted height so the gauge can use vertical space responsively. */
  ha-card.single-section {
    height: 100%;
  }
  ha-card.single-section .battery-section {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* Multi-section mode: sections stack at their natural height; the card
     grows to fit its content rather than the other way round. */
  ha-card.multi-section {
    height: auto;
  }
  ha-card.multi-section .battery-section {
    flex: 0 0 auto;
  }

  .battery-section {
    display: grid;
    grid-template-rows: auto 1fr auto;
    grid-template-columns: 1fr;
  }

  /* Divider between sections */
  .section + .section {
    border-top: 1px solid var(--divider-color, rgba(255,255,255,0.1));
    margin-top: 16px;
    padding-top: 16px;
  }

  .section-title {
    font-size: var(--egc-section-title-size, 1em);
    font-weight: bold;
    color: var(--ubc-text-color);
    margin-bottom: 8px;
    align-self: stretch;
    text-align: left;
  }

  /* Card-wide name (above all sections) */
  .card-name {
    font-size: 1.4em;
    font-weight: bold;
    color: var(--ubc-text-color);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--divider-color, rgba(255,255,255,0.1));
  }

  /* Header Section */
  .header {
    grid-row: 1;
    grid-column: 1;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
    position: relative;
    z-index: 1; /* keep header on top when gauges encroach into its vertical band */
  }

  /* Encroach mode: header and gauges share the top + middle rows.
     Header pinned to top of the merged area; gauges centered behind. */
  :host(.gauges-encroach-header) .header {
    grid-row: 1 / 3;
    align-self: start;
  }
  :host(.gauges-encroach-header) .gauges-container {
    grid-row: 1 / 3;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 0 1 auto; /* size to content; can shrink for truncation, but don't grab middle space */
    max-width: 100%;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .title {
    font-size: var(--egc-section-title-size, 1em);
    font-weight: bold;
    color: var(--ubc-text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .state-mode-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    font-size: 0.9em;
  }

  .separator {
    color: var(--ubc-secondary-text);
    opacity: 0.5;
  }

  .mode {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--ubc-text-color);
    cursor: pointer;
  }

  .mode:hover {
    opacity: 0.8;
  }

  .title-row ha-icon {
    --mdc-icon-size: 16px;
    color: var(--ubc-secondary-text);
    opacity: 0.7;
  }

  .state-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--ubc-text-color);
    cursor: pointer;
  }

  .state-row:hover {
    opacity: 0.8;
  }

  .state-row ha-icon {
    --mdc-icon-size: 16px;
    color: var(--ubc-secondary-text);
  }

  .capacity-row {
    font-size: 0.9em;
    color: var(--ubc-secondary-text);
  }

  /* Stats Panel */
  .stats-panel {
    display: var(--ubc-stats-display, flex);
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .stat {
    font-size: 0.85em;
    color: var(--ubc-secondary-text);
    cursor: pointer;
  }

  .stat:hover {
    opacity: 0.8;
  }

  .stat span {
    color: var(--ubc-text-color);
    font-weight: 500;
  }

  /* Gauges Container */
  .gauges-container {
    grid-row: 2;
    grid-column: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--ubc-gauge-gap, 40px);
    padding: 10px 0;
    min-height: 0; /* Allow shrinking */
  }

  /* Gauge Base Styles */
  .gauge-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
  }

  .gauge-wrapper:hover {
    opacity: 0.9;
  }

  .gauge {
    position: relative;
    width: var(--ubc-gauge-size);
    height: var(--ubc-gauge-size);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gauge::before {
    content: '';
    position: absolute;
    inset: var(--ring-thickness, 15%);
    border-radius: 50%;
    background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
    z-index: 1;
  }

  .gauge-cap {
    position: absolute;
    width: var(--ring-thickness, 15%);
    height: var(--ring-thickness, 15%);
    border-radius: 50%;
    z-index: 2;
    transform: translate(-50%, -50%);
  }

  .gauge-center {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  /* Main SOC Gauge */
  .main-gauge .gauge-center ha-icon {
    --mdc-icon-size: calc(var(--ubc-gauge-size) * 0.27);
  }

  .main-gauge .soc-value {
    font-size: calc(var(--ubc-gauge-size) * 0.14);
    font-weight: bold;
    line-height: 1;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .main-gauge .energy-value {
    font-size: calc(var(--ubc-gauge-size) * 0.06);
    color: var(--ubc-text-color);
    margin-top: 4px;
  }

  /* Gauge Labels (Reserve/Cutoff) */
  .gauge-labels {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    pointer-events: none;
  }

  .gauge-label {
    position: absolute;
    font-size: 0.75em;
    color: var(--ubc-secondary-text);
    white-space: nowrap;
    display: var(--ubc-label-display, block);
  }

  .gauge-label.reserve {
    top: -5px;
    left: 10%;
    transform: translateY(-100%);
  }

  .gauge-label.cutoff {
    top: -5px;
    right: 10%;
    transform: translateY(-100%);
  }

  /* Gauge Markers */
  .marker {
    position: absolute;
    width: 4px;
    height: calc(var(--ring-thickness, 15%) + 12px);
    border-radius: 2px;
    top: -6px;
    left: 50%;
    margin-left: -2px;
    z-index: 3;
  }

  .marker.reserve {
    background: var(--error-color, #db4437);
  }

  .marker.cutoff {
    background: var(--success-color, #43a047);
  }

  /* Power Gauge */
  .power-gauge-wrapper .gauge {
    width: var(--ubc-power-gauge-size);
    height: var(--ubc-power-gauge-size);
  }

  .power-gauge .gauge-center {
    gap: 2px;
  }

  .power-gauge .power-percent {
    font-size: calc(var(--ubc-power-gauge-size) * 0.09);
    color: var(--ubc-text-color);
  }

  .power-gauge .power-value {
    font-size: calc(var(--ubc-power-gauge-size) * 0.13);
    font-weight: bold;
    line-height: 1;
  }

  .power-gauge .power-direction {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: calc(var(--ubc-power-gauge-size) * 0.065);
    color: var(--ubc-secondary-text);
  }

  .power-gauge .power-direction ha-icon {
    --mdc-icon-size: calc(var(--ubc-power-gauge-size) * 0.14);
  }

  /* Rate Labels under power gauge */
  .rate-labels {
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin-top: 8px;
    padding: 0 10px;
  }

  .rate-label-item {
    font-size: 0.7em;
    color: var(--ubc-secondary-text);
    text-align: center;
  }

  .rate-label-item span {
    display: block;
    color: var(--ubc-text-color);
    font-weight: 500;
  }

  /* Error and Loading States */
  .error-container {
    padding: 16px;
    text-align: center;
    color: var(--error-color, #db4437);
  }

  .error-container ha-icon {
    --mdc-icon-size: 48px;
    margin-bottom: 8px;
  }

  .skeleton {
    opacity: 0.5;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.3; }
  }

  /* ================================================================== */
  /* CONSUMPTION SECTION                                                 */
  /* ================================================================== */
  .consumption-section {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .consumption-gauge-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
  }

  .consumption-gauge {
    position: relative;
    width: var(--egc-consumption-size, 160px);
    height: var(--egc-consumption-size, 160px);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .consumption-gauge::before {
    content: '';
    position: absolute;
    inset: var(--ring-thickness, 15%);
    border-radius: 50%;
    background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
    z-index: 1;
  }

  .consumption-gauge .gauge-center {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .consumption-value {
    font-size: calc(var(--egc-consumption-size, 160px) * 0.16);
    font-weight: bold;
    line-height: 1;
    color: var(--ubc-text-color);
  }

  .consumption-label {
    font-size: calc(var(--egc-consumption-size, 160px) * 0.075);
    color: var(--ubc-secondary-text);
    margin-top: 2px;
  }

  .consumption-energy-today {
    font-size: calc(var(--egc-consumption-size, 160px) * 0.07);
    color: var(--ubc-secondary-text);
    margin-top: 4px;
  }

  .consumption-legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px 16px;
    margin-top: 12px;
    font-size: 0.85em;
    color: var(--ubc-secondary-text);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .legend-item:hover { opacity: 0.85; }

  .legend-swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .legend-value {
    color: var(--ubc-text-color);
    font-weight: 500;
  }

  .legend-today {
    color: var(--ubc-secondary-text);
    font-size: 0.9em;
    margin-left: 4px;
  }

  /* ================================================================== */
  /* SOLAR SECTION                                                       */
  /* ================================================================== */
  .solar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  /* Two-column layout: total gauge left, panel grid right */
  .solar-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    width: 100%;
    flex-wrap: wrap;
  }

  .solar-total-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .solar-total-gauge {
    position: relative;
    width: var(--egc-solar-total-size, 160px);
    height: var(--egc-solar-total-size, 160px);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .solar-total-gauge::before {
    content: '';
    position: absolute;
    inset: var(--ring-thickness, 15%);
    border-radius: 50%;
    background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
    z-index: 1;
  }

  .solar-total-gauge .gauge-center {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .solar-total-value {
    font-size: calc(var(--egc-solar-total-size, 160px) * 0.16);
    font-weight: bold;
    line-height: 1;
  }

  .solar-total-label {
    font-size: calc(var(--egc-solar-total-size, 160px) * 0.075);
    color: var(--ubc-secondary-text);
    margin-top: 2px;
  }

  .solar-total-energy-today {
    font-size: calc(var(--egc-solar-total-size, 160px) * 0.07);
    color: var(--ubc-secondary-text);
    margin-top: 4px;
  }

  /* 2-column grid for the panels (default). Wrapping at lower row counts is
     fine — 1 panel = 1 cell, 4 panels = 2x2, 6 panels = 2x3, etc. */
  .solar-panels-grid {
    display: grid;
    grid-template-columns: repeat(var(--egc-panel-cols, 2), minmax(0, 1fr));
    gap: 8px 12px;
    align-content: center;
    justify-content: center;
  }

  .solar-panel-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    min-width: 0;
  }

  .solar-panel-gauge {
    position: relative;
    width: var(--egc-solar-panel-size, 70px);
    height: var(--egc-solar-panel-size, 70px);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .solar-panel-gauge::before {
    content: '';
    position: absolute;
    inset: var(--ring-thickness, 15%);
    border-radius: 50%;
    background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
    z-index: 1;
  }

  .solar-panel-gauge .gauge-center {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .solar-panel-value {
    font-size: calc(var(--egc-solar-panel-size, 70px) * 0.2);
    font-weight: bold;
    line-height: 1;
  }

  .solar-panel-name {
    font-size: 0.7em;
    color: var(--ubc-secondary-text);
    margin-top: 3px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .solar-panel-energy-today {
    font-size: 0.65em;
    color: var(--ubc-secondary-text);
    margin-top: 1px;
  }
`;

const editorStyles = css`
  .tab-bar {
    display: flex;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--divider-color);
    margin-bottom: 16px;
  }
  .tab {
    padding: 8px 16px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    font-size: 0.9em;
  }
  .tab:hover { background: var(--secondary-background-color); }
  .tab.active {
    border-bottom-color: var(--primary-color);
    color: var(--primary-color);
  }
  .helper-text {
    font-size: 0.85em;
    color: var(--secondary-text-color);
    margin-bottom: 16px;
  }

  .panels-editor {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .panel-row {
    border: 1px solid var(--divider-color);
    border-radius: 6px;
    padding: 12px;
    background: var(--card-background-color);
  }
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .panel-title {
    font-weight: 500;
  }
  .remove-btn, .add-btn {
    background: var(--secondary-background-color);
    border: 1px solid var(--divider-color);
    color: var(--primary-text-color);
    border-radius: 4px;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 0.85em;
    font-family: inherit;
  }
  .add-btn {
    align-self: flex-start;
    margin-top: 8px;
    background: var(--primary-color);
    color: var(--text-primary-color, white);
    border-color: var(--primary-color);
  }
  .remove-btn:hover { opacity: 0.85; }
  .add-btn:hover { opacity: 0.9; }

  .section-order-editor {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .order-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 1px solid var(--divider-color);
    border-radius: 6px;
    padding: 8px 12px;
    background: var(--card-background-color);
  }
  .order-label {
    font-weight: 500;
  }
  .order-buttons {
    display: flex;
    gap: 4px;
  }
  .order-buttons button {
    background: var(--secondary-background-color);
    border: 1px solid var(--divider-color);
    color: var(--primary-text-color);
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 1em;
    font-family: inherit;
    min-width: 32px;
  }
  .order-buttons button:hover:not(:disabled) { opacity: 0.85; }
  .order-buttons button:disabled { opacity: 0.35; cursor: not-allowed; }
`;

// ============================================================================
// SCHEMAS
// ============================================================================

const EDITOR_TABS = [
  { id: 'general', label: 'General' },
  { id: 'sections', label: 'Sections' },
  { id: 'entities', label: 'Battery' },
  { id: 'stats', label: 'Stats' },
  { id: 'consumption', label: 'Consumption' },
  { id: 'solar', label: 'Solar' },
  { id: 'soc', label: 'SOC Colors' },
  { id: 'filters', label: 'Filters' },
];

const SECTIONS_SCHEMA = [
  { name: 'show_battery', label: 'Show Battery Section', selector: { boolean: {} } },
  { name: 'show_battery_title', label: 'Show Battery Title', selector: { boolean: {} } },
  { name: 'battery_section_title', label: 'Battery Title (empty = "Battery")', selector: { text: {} } },
  { name: 'show_consumption', label: 'Show Consumption Section', selector: { boolean: {} } },
  { name: 'show_consumption_title', label: 'Show Consumption Title', selector: { boolean: {} } },
  { name: 'consumption_section_title', label: 'Consumption Title (empty = "Consumption")', selector: { text: {} } },
  { name: 'show_solar', label: 'Show Solar Section', selector: { boolean: {} } },
  { name: 'show_solar_title', label: 'Show Solar Title', selector: { boolean: {} } },
  { name: 'solar_section_title', label: 'Solar Title (empty = "Solar")', selector: { text: {} } },
  { name: 'section_title_font_size', label: 'Section Title Font Size (em)', selector: { number: { min: 0.7, max: 2.5, step: 0.1, mode: 'box' } } },
];

const CONSUMPTION_SCHEMA = [
  { name: 'consumption_calc_mode', label: 'Calculation Mode', selector: { select: { options: [
    { value: 'composed', label: 'Composed — three separate sensors (Grid / PV / Battery)' },
    { value: 'calculated', label: 'Calculated — total + signed grid + signed battery' },
    { value: 'direct', label: 'Direct — total + PV self-consumption + battery' },
  ] } } },
  { name: 'consumption_entity', label: 'Total Consumption Entity (W) — calculated/direct', selector: { entity: { domain: 'sensor' } } },
  { name: 'grid_import_entity', label: 'Grid Import Entity (W, >=0) — composed', selector: { entity: { domain: 'sensor' } } },
  { name: 'pv_direct_entity', label: 'PV Direct Consumption Entity (W, >=0) — composed', selector: { entity: { domain: 'sensor' } } },
  { name: 'battery_discharge_entity', label: 'Battery Discharge Entity (W, >=0) — composed', selector: { entity: { domain: 'sensor' } } },
  { name: 'grid_power_entity', label: 'Grid Power (signed) — calculated', selector: { entity: { domain: 'sensor' } } },
  { name: 'grid_invert', label: 'Invert Grid Sign', selector: { boolean: {} } },
  { name: 'battery_consumption_invert', label: 'Invert Battery Sign for Consumption', selector: { boolean: {} } },
  { name: 'pv_self_consumption_entity', label: 'PV Self-Consumption (W) — direct', selector: { entity: { domain: 'sensor' } } },
  { name: 'consumption_energy_today_entity', label: 'Today: Total Consumption (kWh)', selector: { entity: { domain: 'sensor' } } },
  { name: 'grid_energy_today_entity', label: 'Today: Grid Import (kWh)', selector: { entity: { domain: 'sensor' } } },
  { name: 'pv_self_energy_today_entity', label: 'Today: PV Self-Consumption (kWh)', selector: { entity: { domain: 'sensor' } } },
  { name: 'battery_discharge_energy_today_entity', label: 'Today: Battery Discharge (kWh)', selector: { entity: { domain: 'sensor' } } },
  { name: 'show_consumption_legend', label: 'Show Legend', selector: { boolean: {} } },
  { name: 'show_consumption_energy_today', label: 'Show Today\'s Energy', selector: { boolean: {} } },
  { name: 'consumption_color_grid', label: 'Grid Color', selector: { color_rgb: {} } },
  { name: 'consumption_color_pv', label: 'PV Color', selector: { color_rgb: {} } },
  { name: 'consumption_color_battery', label: 'Battery Color', selector: { color_rgb: {} } },
];

const SOLAR_SCHEMA = [
  { name: 'pv_total_entity', label: 'Total PV Power Entity (W)', selector: { entity: { domain: 'sensor' } } },
  { name: 'pv_total_peak', label: 'Total System Peak (Wp) — leave empty to sum panel peaks', selector: { number: { min: 0, max: 200000, mode: 'box' } } },
  { name: 'pv_total_energy_today_entity', label: 'Today: PV Production (kWh)', selector: { entity: { domain: 'sensor' } } },
  { name: 'solar_panel_cols', label: 'Panel Grid Columns (4 panels = 2x2 → set to 2)', selector: { number: { min: 1, max: 6, mode: 'box' } } },
  { name: 'show_solar_energy_today', label: 'Show Today\'s Energy', selector: { boolean: {} } },
  { name: 'solar_color', label: 'Solar Color', selector: { color_rgb: {} } },
];

const PANEL_SCHEMA = [
  { name: 'entity', label: 'Panel Power Entity (W)', selector: { entity: { domain: 'sensor' } } },
  { name: 'name', label: 'Label (optional)', selector: { text: {} } },
  { name: 'peak', label: 'Panel Peak (Wp)', selector: { number: { min: 0, max: 5000, mode: 'box' } } },
  { name: 'energy_today_entity', label: 'Today\'s Energy (kWh, optional)', selector: { entity: { domain: 'sensor' } } },
];

const GENERAL_SCHEMA = [
  { name: 'name', label: 'Card Name', selector: { text: {} } },
  { name: 'gauge_thickness', label: 'Gauge Ring Thickness (%)', selector: { number: { min: 5, max: 15, mode: 'slider' } } },
  { name: 'language', label: 'Language', selector: { select: { options: [
    { value: 'auto', label: 'Auto (follow HA)' },
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
    { value: 'fr', label: 'Français' },
    { value: 'es', label: 'Español' },
  ] } } },
];

const ENTITIES_SCHEMA = [
  // Display options for the battery section
  { name: 'header_style', label: 'Header Style', selector: { select: { options: [
    { value: 'full', label: 'Full Header (Title + State + Mode + Capacity)' },
    { value: 'title', label: 'Title Only' },
    { value: 'none', label: 'No Header' },
  ] } } },
  { name: 'decimal_places', label: 'Decimal Places for Energy', selector: { number: { min: 0, max: 4, mode: 'box' } } },
  { name: 'power_gauge_scale', label: 'Power Gauge Size vs SOC Gauge (%)', selector: { number: { min: 30, max: 100, mode: 'slider' } } },
  { name: 'show_rates', label: 'Display Power Gauge (Charge/Discharge Rates)', selector: { boolean: {} } },
  { name: 'show_rate_labels', label: 'Display Max Charge/Discharge Labels', selector: { boolean: {} } },
  { name: 'show_power_percent', label: 'Display Power Percentage', selector: { boolean: {} } },
  { name: 'show_power_direction', label: 'Display Power Direction Label', selector: { boolean: {} } },
  { name: 'show_gauge_labels', label: 'Display Reserve/Cutoff Labels', selector: { boolean: {} } },
  { name: 'show_capacity', label: 'Display Capacity in Header', selector: { boolean: {} } },
  { name: 'show_stats', label: 'Display Stats Panel (Temp/Cycles/Health)', selector: { boolean: {} } },
  // Required Sensors
  { name: 'soc_entity', label: 'SOC Entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'power_entity', label: 'Power Entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'invert_power', label: 'Invert Power Value', selector: { boolean: {} } },
  // Status Display (Optional)
  { name: 'state_entity', label: 'State Entity (overrides auto-detect)', selector: { entity: {} } },
  { name: 'mode_entity', label: 'Mode Entity (e.g. input_select)', selector: { entity: { domain: ['input_select', 'select', 'sensor'] } } },
  // Energy (Entity or Fixed Value)
  { name: 'soc_energy_entity', label: 'SOC Energy Entity', selector: { entity: { domain: 'sensor' } } },
  // Capacity (Entity or Fixed Value)
  { name: 'capacity_entity', label: 'Capacity Entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'capacity', label: 'OR Fixed Capacity (kWh)', selector: { number: { min: 0, max: 1000, step: 0.1, mode: 'box' } } },
  // Reserve (Entity or Fixed Value)
  { name: 'reserve_entity', label: 'Reserve Entity', selector: { entity: { domain: ['sensor', 'number'] } } },
  { name: 'reserve', label: 'OR Fixed Reserve (%)', selector: { number: { min: 0, max: 100, mode: 'box' } } },
  // Rates (Entity or Fixed Value)
  { name: 'charge_rate_entity', label: 'Max Charge Rate Entity', selector: { entity: { domain: ['sensor', 'number'] } } },
  { name: 'charge_rate', label: 'OR Fixed Max Charge Rate (W)', selector: { number: { min: 0, max: 50000, mode: 'box' } } },
  { name: 'discharge_rate_entity', label: 'Max Discharge Rate Entity', selector: { entity: { domain: ['sensor', 'number'] } } },
  { name: 'discharge_rate', label: 'OR Fixed Max Discharge Rate (W)', selector: { number: { min: 0, max: 50000, mode: 'box' } } },
  // Cutoff (max charge limit)
  { name: 'cutoff_entity', label: 'Cutoff Entity (max charge %)', selector: { entity: { domain: ['sensor', 'number'] } } },
  { name: 'cutoff', label: 'OR Fixed Cutoff (%)', selector: { number: { min: 0, max: 100, mode: 'box' } } },
];

const STATS_SCHEMA = [
  { name: 'temp_entity', label: 'Temperature Entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'cycles_entity', label: 'Battery Cycles Entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'health_entity', label: 'Battery Health Entity', selector: { entity: { domain: 'sensor' } } },
];

const SOC_SCHEMA = [
  { name: 'soc_threshold_very_high', label: 'Very High Threshold (%)', selector: { number: { min: 0, max: 100, mode: 'slider' } } },
  { name: 'soc_colour_very_high', label: 'Very High Color', selector: { color_rgb: {} } },
  { name: 'soc_threshold_high', label: 'High Threshold (%)', selector: { number: { min: 0, max: 100, mode: 'slider' } } },
  { name: 'soc_colour_high', label: 'High Color', selector: { color_rgb: {} } },
  { name: 'soc_threshold_medium', label: 'Medium Threshold (%)', selector: { number: { min: 0, max: 100, mode: 'slider' } } },
  { name: 'soc_colour_medium', label: 'Medium Color', selector: { color_rgb: {} } },
  { name: 'soc_threshold_low', label: 'Low Threshold (%)', selector: { number: { min: 0, max: 100, mode: 'slider' } } },
  { name: 'soc_colour_low', label: 'Low Color', selector: { color_rgb: {} } },
  { name: 'soc_colour_very_low', label: 'Very Low Color', selector: { color_rgb: {} } },
];

const FILTERS_SCHEMA = [
  { name: 'enable_trickle_charge_filter', label: 'Enable Trickle Charge Filter', selector: { boolean: {} } },
  { name: 'trickle_charge_threshold', label: 'Filter Threshold (W)', selector: { number: { min: 0, max: 100, mode: 'slider' } } },
];

function getSchemaForTab(tabId) {
  switch (tabId) {
    case 'general': return GENERAL_SCHEMA;
    case 'sections': return SECTIONS_SCHEMA;
    case 'entities': return ENTITIES_SCHEMA;
    case 'stats': return STATS_SCHEMA;
    case 'consumption': return CONSUMPTION_SCHEMA;
    case 'solar': return SOLAR_SCHEMA;
    case 'soc': return SOC_SCHEMA;
    case 'filters': return FILTERS_SCHEMA;
    default: return [];
  }
}

// ============================================================================
// EDITOR
// ============================================================================

class EnergyGaugeCardEditor extends LitElement {
  static get properties() {
    return {
      hass: { attribute: false },
      _config: { state: true },
      _currentTab: { state: true },
    };
  }

  static get styles() { return editorStyles; }

  constructor() {
    super();
    this._currentTab = 'general';
  }

  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) return;
    const detail = ev.detail;
    if (detail && detail.value !== undefined) {
      this._config = { ...this._config, ...detail.value };
      fireEvent(this, 'config-changed', { config: this._config });
    }
  }

  _computeLabel(schema) { return schema.label || schema.name; }

  _addPanel() {
    const panels = Array.isArray(this._config.pv_panels) ? [...this._config.pv_panels] : [];
    panels.push({ entity: '', name: '', peak: null });
    this._config = { ...this._config, pv_panels: panels };
    fireEvent(this, 'config-changed', { config: this._config });
  }

  _removePanel(idx) {
    const panels = Array.isArray(this._config.pv_panels) ? [...this._config.pv_panels] : [];
    panels.splice(idx, 1);
    this._config = { ...this._config, pv_panels: panels };
    fireEvent(this, 'config-changed', { config: this._config });
  }

  _panelValueChanged(idx, ev) {
    if (!ev.detail || ev.detail.value === undefined) return;
    const panels = Array.isArray(this._config.pv_panels) ? [...this._config.pv_panels] : [];
    panels[idx] = { ...(panels[idx] || {}), ...ev.detail.value };
    this._config = { ...this._config, pv_panels: panels };
    fireEvent(this, 'config-changed', { config: this._config });
  }

  _getSectionOrder() {
    const known = ['battery', 'consumption', 'solar'];
    const raw = Array.isArray(this._config.section_order) ? this._config.section_order : [];
    const order = raw.filter(k => known.includes(k));
    known.forEach(k => { if (!order.includes(k)) order.push(k); });
    return order;
  }

  _moveSection(idx, delta) {
    const order = [...this._getSectionOrder()];
    const target = idx + delta;
    if (target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    this._config = { ...this._config, section_order: order };
    fireEvent(this, 'config-changed', { config: this._config });
  }

  _renderSectionOrderEditor() {
    const order = this._getSectionOrder();
    const labels = {
      battery: this._config.battery_section_title || 'Battery',
      consumption: this._config.consumption_section_title || 'Consumption',
      solar: this._config.solar_section_title || 'Solar',
    };
    return html`
      <div class="section-order-editor">
        <div class="helper-text">Section order (Up/Down to rearrange). Hidden sections keep their position but render nothing.</div>
        ${order.map((key, idx) => html`
          <div class="order-row">
            <span class="order-label">${idx + 1}. ${labels[key]}</span>
            <div class="order-buttons">
              <button @click=${() => this._moveSection(idx, -1)} ?disabled=${idx === 0} title="Move up">↑</button>
              <button @click=${() => this._moveSection(idx, +1)} ?disabled=${idx === order.length - 1} title="Move down">↓</button>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  _renderPanelsEditor() {
    const panels = Array.isArray(this._config.pv_panels) ? this._config.pv_panels : [];
    return html`
      <div class="panels-editor">
        <div class="helper-text">Panels (${panels.length}). Add one entry per PV string. "Peak" is the panel's rated power in Wp and determines the gauge's 100 % mark.</div>
        ${panels.map((panel, idx) => html`
          <div class="panel-row">
            <div class="panel-header">
              <span class="panel-title">Panel ${idx + 1}${panel && panel.name ? ` — ${panel.name}` : ''}</span>
              <button class="remove-btn" @click=${() => this._removePanel(idx)}>Remove</button>
            </div>
            <ha-form
              .hass=${this.hass}
              .data=${panel || {}}
              .schema=${PANEL_SCHEMA}
              .computeLabel=${this._computeLabel}
              @value-changed=${(ev) => this._panelValueChanged(idx, ev)}
            ></ha-form>
          </div>
        `)}
        <button class="add-btn" @click=${this._addPanel}>+ Add Panel</button>
      </div>
    `;
  }

  render() {
    if (!this.hass || !this._config) return html``;

    return html`
      <div class="card-config">
        <div class="tab-bar">
          ${EDITOR_TABS.map(tab => html`
            <div class="tab ${this._currentTab === tab.id ? 'active' : ''}"
                 @click=${() => this._currentTab = tab.id}>
              ${tab.label}
            </div>
          `)}
        </div>
        <div class="tab-content">
          ${this._currentTab === 'sections' ? html`
            <div class="helper-text">
              Toggle which sections appear in the card. At least one must be enabled.
            </div>
          ` : ''}
          ${this._currentTab === 'entities' ? html`
            <div class="helper-text">
              For static values (capacity, reserve, rates, cutoff), you can either select an entity OR enter a fixed value. Fixed values take priority.
            </div>
          ` : ''}
          ${this._currentTab === 'stats' ? html`
            <div class="helper-text">
              Optional battery stats displayed in top-right panel. Stats panel only appears if at least one entity is configured.
            </div>
          ` : ''}
          ${this._currentTab === 'consumption' ? html`
            <div class="helper-text">
              Three calculation modes — pick the one that fits your sensors. <b>Composed</b>: three explicit positive sensors. <b>Calculated</b>: total + signed grid + signed battery. <b>Direct</b>: total + PV self-consumption sensor + battery. Battery uses the same Power Entity as the battery section.
            </div>
          ` : ''}
          ${this._currentTab === 'solar' ? html`
            <div class="helper-text">
              Total PV power gauge (optional) plus one gauge per string. Peak values drive the gauge fill percentage.
            </div>
          ` : ''}
          ${this._currentTab === 'soc' ? html`
            <div class="helper-text">
              Set color thresholds for SOC levels. "Very Low" color applies to any value below the "Low" threshold.
            </div>
          ` : ''}
          <ha-form
            .hass=${this.hass}
            .data=${this._config}
            .schema=${getSchemaForTab(this._currentTab)}
            .computeLabel=${this._computeLabel}
            @value-changed=${this._valueChanged}
          ></ha-form>
          ${this._currentTab === 'solar' ? this._renderPanelsEditor() : ''}
          ${this._currentTab === 'sections' ? this._renderSectionOrderEditor() : ''}
        </div>
      </div>
    `;
  }
}

if (!customElements.get('energy-gauge-card-editor')) {
  customElements.define('energy-gauge-card-editor', EnergyGaugeCardEditor);
}

// ============================================================================
// MAIN CARD
// ============================================================================

class EnergyGaugeCard extends LitElement {
  static get properties() {
    return {
      hass: { attribute: false },
      _config: { state: true },
    };
  }

  static get styles() { return cardStyles; }

  static getConfigElement() {
    return document.createElement('energy-gauge-card-editor');
  }

  static getStubConfig() {
    return { type: 'custom:energy-gauge-card', name: 'Energy', show_battery: true, soc_entity: '', power_entity: '' };
  }

  constructor() {
    super();
    this._resizeObserver = null;
  }

  connectedCallback() {
    super.connectedCallback();
    // Wrap in try/catch so a failure here (e.g. missing browser API on an old
    // WebView) doesn't propagate up and render the card as a generic
    // "Configuration error" — the card can still render at CSS-default sizes.
    try {
      if (typeof ResizeObserver === 'undefined') {
        // Older WebViews (some Amazon Fire HD builds, pre-2018 browsers) lack
        // ResizeObserver. The card renders at the static CSS defaults from
        // cardStyles (--ubc-gauge-size: 180px, --ubc-power-gauge-size: 140px);
        // responsive resizing is just disabled.
        console.warn('[energy-gauge-card] ResizeObserver unavailable; responsive sizing disabled');
        return;
      }
      // Set up ResizeObserver for responsive sizing.
      // Wrap callback in requestAnimationFrame to batch with paint and avoid the
      // "ResizeObserver loop limit exceeded" warning during editor drag-resize.
      this._resizeObserver = new ResizeObserver(entries => {
        if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
        this._resizeRaf = requestAnimationFrame(() => {
          this._resizeRaf = null;
          if (entries[0]) {
            const { width, height } = entries[0].contentRect;
            this._updateGaugeSize(width, height);
          }
        });
      });
      this._resizeObserver.observe(this);
    } catch (err) {
      console.error('[energy-gauge-card] connectedCallback failed:', err);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._resizeRaf) {
      cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = null;
    }
  }

  setConfig(config) {
    this._validateConfig(config);
    this._config = { ...DEFAULT_CONFIG, ...config };
    // Bust the no-op cache so editor changes that don't alter output dimensions still re-evaluate.
    this._lastSizing = null;
    // Re-run sizing so options like power_gauge_scale apply live in the editor
    if (this.isConnected && this.clientWidth > 0) {
      this._updateGaugeSize(this.clientWidth, this.clientHeight);
    }
  }

  _validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration must be an object');
    }

    const inRange = (key, min, max) => {
      const v = config[key];
      if (v === undefined || v === null) return;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
        throw new Error(`${key} must be a number between ${min} and ${max} (got ${JSON.stringify(v)})`);
      }
    };

    // Numeric ranges (mirror the editor sliders/boxes)
    inRange('decimal_places', 0, 4);
    inRange('gauge_thickness', 5, 15);
    inRange('power_gauge_scale', 30, 100);
    inRange('trickle_charge_threshold', 0, 10000);
    for (const k of ['soc_threshold_very_high', 'soc_threshold_high', 'soc_threshold_medium', 'soc_threshold_low']) {
      inRange(k, 0, 100);
    }

    // SOC thresholds must be strictly descending (very_high > high > medium > low).
    const merged = { ...DEFAULT_CONFIG, ...config };
    const order = [
      ['soc_threshold_very_high', merged.soc_threshold_very_high],
      ['soc_threshold_high', merged.soc_threshold_high],
      ['soc_threshold_medium', merged.soc_threshold_medium],
      ['soc_threshold_low', merged.soc_threshold_low],
    ];
    for (let i = 1; i < order.length; i++) {
      const [prevKey, prev] = order[i - 1];
      const [key, val] = order[i];
      if (val >= prev) {
        throw new Error(`${prevKey} (${prev}) must be greater than ${key} (${val})`);
      }
    }

    // SOC colors: either a CSS variable name (string) or an [r,g,b] tuple of 0-255 ints.
    for (const k of ['soc_colour_very_high', 'soc_colour_high', 'soc_colour_medium', 'soc_colour_low', 'soc_colour_very_low']) {
      const v = config[k];
      if (v === undefined || v === null) continue;
      if (typeof v === 'string') continue; // accept any string (CSS var / colour name)
      if (!Array.isArray(v) || v.length !== 3 || !v.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
        throw new Error(`${k} must be a CSS variable name or an [r, g, b] array of integers 0-255 (got ${JSON.stringify(v)})`);
      }
    }

    // header_style enum
    if (config.header_style !== undefined && !['full', 'title', 'none'].includes(config.header_style)) {
      throw new Error(`header_style must be 'full', 'title', or 'none' (got ${JSON.stringify(config.header_style)})`);
    }

    // language enum
    if (config.language !== undefined && !SUPPORTED_LANGUAGES.includes(config.language)) {
      throw new Error(`language must be one of ${JSON.stringify(SUPPORTED_LANGUAGES)} (got ${JSON.stringify(config.language)})`);
    }

    // consumption_calc_mode enum
    if (config.consumption_calc_mode !== undefined &&
        !['composed', 'calculated', 'direct'].includes(config.consumption_calc_mode)) {
      throw new Error(`consumption_calc_mode must be 'composed', 'calculated', or 'direct' (got ${JSON.stringify(config.consumption_calc_mode)})`);
    }

    // Entity IDs: must look like 'domain.entity_id' when provided.
    const entityKeys = [
      // Battery
      'soc_entity', 'power_entity', 'capacity_entity', 'state_entity', 'mode_entity',
      'soc_energy_entity', 'reserve_entity', 'temp_entity', 'cycles_entity', 'health_entity',
      'cutoff_entity', 'charge_rate_entity', 'discharge_rate_entity',
      // Consumption
      'consumption_entity',
      'grid_import_entity', 'pv_direct_entity', 'battery_discharge_entity',
      'grid_power_entity', 'pv_self_consumption_entity',
      'consumption_energy_today_entity', 'grid_energy_today_entity',
      'pv_self_energy_today_entity', 'battery_discharge_energy_today_entity',
      // Solar
      'pv_total_entity', 'pv_total_energy_today_entity',
    ];
    for (const k of entityKeys) {
      const v = config[k];
      if (!v) continue;
      if (typeof v !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(v)) {
        throw new Error(`${k} must be an entity id like 'sensor.foo' (got ${JSON.stringify(v)})`);
      }
    }

    // section_order
    if (config.section_order !== undefined && config.section_order !== null) {
      if (!Array.isArray(config.section_order)) {
        throw new Error(`section_order must be an array (got ${JSON.stringify(config.section_order)})`);
      }
      const known = ['battery', 'consumption', 'solar'];
      for (const k of config.section_order) {
        if (!known.includes(k)) {
          throw new Error(`section_order entries must be one of ${JSON.stringify(known)} (got ${JSON.stringify(k)})`);
        }
      }
    }

    // pv_panels array
    if (config.pv_panels !== undefined && config.pv_panels !== null) {
      if (!Array.isArray(config.pv_panels)) {
        throw new Error(`pv_panels must be an array (got ${JSON.stringify(config.pv_panels)})`);
      }
      config.pv_panels.forEach((p, i) => {
        if (!p || typeof p !== 'object') {
          throw new Error(`pv_panels[${i}] must be an object`);
        }
        if (p.entity && (typeof p.entity !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(p.entity))) {
          throw new Error(`pv_panels[${i}].entity must be an entity id (got ${JSON.stringify(p.entity)})`);
        }
        if (p.energy_today_entity && (typeof p.energy_today_entity !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(p.energy_today_entity))) {
          throw new Error(`pv_panels[${i}].energy_today_entity must be an entity id (got ${JSON.stringify(p.energy_today_entity)})`);
        }
        if (p.peak !== undefined && p.peak !== null && p.peak !== '' && !Number.isFinite(parseFloat(p.peak))) {
          throw new Error(`pv_panels[${i}].peak must be a number (got ${JSON.stringify(p.peak)})`);
        }
      });
    }
  }

  updated(changedProps) {
    super.updated?.(changedProps);
    // Re-measure after every render. State changes can alter header content
    // (mode text, state row, entity availability) which changes header height
    // and therefore the available gauge area. The no-op sizing cache absorbs
    // redundant work when nothing actually changed.
    if (this.isConnected && this.clientWidth > 0) {
      this._updateGaugeSize(this.clientWidth, this.clientHeight);
    }
  }

  _openMoreInfo(e, entityId) {
    if (!entityId) return;
    e.stopPropagation();
    fireEvent(this, 'hass-more-info', { entityId });
  }

  /** Translation lookup helper — picks language from config or HA */
  _t(key) {
    return tr(key, this.hass, this._config);
  }

  // Derive layout-relevant flags from the current config in one place.
  _layoutFlags() {
    const c = this._config ?? {};
    const headerStyle = c.header_style ?? 'full';
    const showRates = c.show_rates !== false;
    const hasRates = c.charge_rate_entity || c.charge_rate ||
                     c.discharge_rate_entity || c.discharge_rate;
    const showPowerGauge = hasRates && showRates;
    const powerScale = Math.max(30, Math.min(100, c.power_gauge_scale ?? 78)) / 100;
    return { headerStyle, showPowerGauge, powerScale };
  }

  // Static estimates for header height — used pre-render and by HA layout APIs.
  _estimateChrome({ headerStyle }) {
    const headerPx = headerStyle === 'full' ? HEADER_FALLBACK_FULL
                   : headerStyle === 'title' ? HEADER_FALLBACK_TITLE : 0;
    return { headerPx, footerPx: 0 };
  }

  // Measure rendered chrome where possible; fall back to estimates on first paint.
  _measureChrome(flags) {
    const fallback = this._estimateChrome(flags);
    const headerEl = this.renderRoot?.querySelector?.('.header');
    const footerEl = this.renderRoot?.querySelector?.('.footer');
    return {
      headerEl,
      headerHeight: headerEl?.offsetHeight ?? fallback.headerPx,
      footerHeight: footerEl?.offsetHeight ?? fallback.footerPx,
    };
  }

  // Compute the auto gap between gauges given the current available width.
  _computeGaugeGap(availableWidth, flags) {
    const ramp = (availableWidth - GAUGE_GAP_RAMP_WIDTH) * GAUGE_GAP_RAMP_SLOPE;
    let gap = Math.max(GAUGE_GAP_MIN, Math.min(GAUGE_GAP_MAX, ramp));
    if (flags.showPowerGauge) {
      // Don't let the gap eat so much width that two gauges can't fit at HARD_FLOOR.
      const maxGap = Math.max(0, availableWidth - HARD_FLOOR_PX * (1 + flags.powerScale));
      gap = Math.min(gap, maxGap);
    }
    return gap;
  }

  // Centered gauges encroach into the header's vertical band only when they horizontally
  // clear both the header's left content block and right stats panel with margin to spare.
  _isEncroachSafe(headerEl, totalGaugesWidth, containerWidth) {
    if (!headerEl) return false;
    const headerLeftEl = headerEl.querySelector?.('.header-left');
    const statsEl = headerEl.querySelector?.('.stats-panel');
    const leftWidth = headerLeftEl?.offsetWidth ?? 0;
    const rightWidth = (statsEl && statsEl.offsetParent !== null) ? statsEl.offsetWidth : 0;
    const middleSpace = containerWidth - CARD_PADDING_X - leftWidth - rightWidth - ENCROACH_SAFETY_PX * 2;
    return totalGaugesWidth <= middleSpace;
  }

  // Apply computed sizing values to CSS vars / host class, with a no-op guard so
  // unchanged frames don't trigger style recalculation (and don't risk RO loops).
  _applySizing(values) {
    const last = this._lastSizing;
    if (last
      && last.gaugeSize === values.gaugeSize
      && last.powerGaugeSize === values.powerGaugeSize
      && last.gaugeGap === values.gaugeGap
      && last.labelDisplay === values.labelDisplay
      && last.statsDisplay === values.statsDisplay
      && last.useEncroach === values.useEncroach) {
      return;
    }
    this._lastSizing = values;
    this.style.setProperty('--ubc-gauge-size', `${values.gaugeSize}px`);
    this.style.setProperty('--ubc-power-gauge-size', `${values.powerGaugeSize}px`);
    this.style.setProperty('--ubc-gauge-gap', `${values.gaugeGap}px`);
    this.style.setProperty('--ubc-label-display', values.labelDisplay);
    this.style.setProperty('--ubc-stats-display', values.statsDisplay);
    this.classList.toggle('gauges-encroach-header', values.useEncroach);
  }

  _updateGaugeSize(containerWidth, containerHeight) {
    if (!this._config) return;
    if (containerWidth <= 0 || containerHeight <= 0) return;

    // In multi-section mode the battery section does not own the full card
    // height, so the original height-driven responsive sizing would oversize
    // the gauges and push other sections out of view. Pick conservative fixed
    // sizes scaled to width only, and disable encroach/labels which assume
    // the battery section is the sole occupant.
    const c = this._config;
    const sectionCount =
      (c.show_battery !== false ? 1 : 0) +
      (c.show_consumption === true ? 1 : 0) +
      (c.show_solar === true ? 1 : 0);

    if (sectionCount > 1) {
      const flagsMulti = this._layoutFlags();
      // Scale gauge by available width but cap so it doesn't dwarf the rest.
      const widthBudget = containerWidth - CARD_PADDING_X;
      const denom = flagsMulti.showPowerGauge ? (1 + flagsMulti.powerScale) : 1;
      const naturalSize = Math.min(160, (widthBudget - 20) / denom);
      const gaugeSize = Math.round(Math.max(HARD_FLOOR_PX, naturalSize));
      const powerGaugeSize = Math.round(gaugeSize * flagsMulti.powerScale);
      this._applySizing({
        gaugeSize,
        powerGaugeSize,
        gaugeGap: 16,
        labelDisplay: 'none',     // Reserve/Cutoff text labels off — they sit above the ring
        statsDisplay: containerWidth < STATS_PANEL_HIDE_BELOW_PX ? 'none' : 'flex',
        useEncroach: false,
      });
      return;
    }

    const flags = this._layoutFlags();
    const { headerEl, headerHeight, footerHeight } = this._measureChrome(flags);

    // Vertical space accounting:
    //   standardHeight  → gauges sit between header and footer
    //   encroachHeight  → gauges allowed to extend into the header row
    const fixedVertical = footerHeight + CARD_PADDING_Y + GAUGE_PADDING_PX;
    const standardHeight = containerHeight - headerHeight - fixedVertical;
    const encroachHeight = containerHeight - fixedVertical;

    const availableWidth = containerWidth - CARD_PADDING_X;
    let gaugeGap = this._computeGaugeGap(availableWidth, flags);

    const widthCap = flags.showPowerGauge
      ? (availableWidth - gaugeGap) / (1 + flags.powerScale)
      : availableWidth;
    const standardSize = Math.min(widthCap, standardHeight - GAUGE_PADDING_PX);
    const encroachSize = Math.min(widthCap, encroachHeight - GAUGE_PADDING_PX);

    // Engage encroach only when it grows the gauge meaningfully and is visually safe.
    let useEncroach = false;
    if (encroachSize > standardSize + ENCROACH_THRESHOLD_PX) {
      const totalGaugesWidth = flags.showPowerGauge
        ? encroachSize * (1 + flags.powerScale) + gaugeGap
        : encroachSize;
      useEncroach = this._isEncroachSafe(headerEl, totalGaugesWidth, containerWidth);
    }

    const naturalSize = useEncroach ? encroachSize : standardSize;
    const gaugeSize = Math.round(Math.max(HARD_FLOOR_PX, naturalSize));
    const powerGaugeSize = Math.round(gaugeSize * flags.powerScale);
    gaugeGap = Math.round(gaugeGap);

    const hideLabels = gaugeSize < LABELS_HIDE_BELOW_PX
      || (flags.headerStyle !== 'none' && gaugeSize < LABELS_HIDE_BELOW_PX_WITH_HEADER);
    const labelDisplay = hideLabels ? 'none' : 'block';
    const statsDisplay = containerWidth < STATS_PANEL_HIDE_BELOW_PX ? 'none' : 'flex';

    this._applySizing({ gaugeSize, powerGaugeSize, gaugeGap, labelDisplay, statsDisplay, useEncroach });
  }

  getCardSize() {
    // 1 unit = 50px (HA docs). Used by masonry view for height estimation.
    // Deliberately static — runtime gauge size fills available space and isn't known
    // ahead of layout; this just gives masonry a sensible initial slot (~200px gauges).
    const flags = this._layoutFlags();
    const { headerPx, footerPx } = this._estimateChrome(flags);
    const defaultGaugeAreaPx = 200 + GAUGE_PADDING_PX;
    const totalPx = CARD_PADDING_Y + headerPx + defaultGaugeAreaPx + footerPx;
    return Math.ceil(totalPx / MASONRY_UNIT_PX);
  }

  getGridOptions() {
    // Compute floors from chrome estimates + a HARD_FLOOR gauge; HA decides ceilings.
    const flags = this._layoutFlags();
    const { headerPx, footerPx } = this._estimateChrome(flags);
    const cellRow = SECTION_ROW_PX + SECTION_GAP_PX;
    const cellCol = SECTION_COL_PX + SECTION_GAP_PX;

    const minHeightPx = headerPx + footerPx + CARD_PADDING_Y + GAUGE_PADDING_PX + HARD_FLOOR_PX;
    const minRows = Math.max(2, Math.ceil((minHeightPx + SECTION_GAP_PX) / cellRow));

    const minGaugesPx = flags.showPowerGauge
      ? HARD_FLOOR_PX * (1 + flags.powerScale) + GAUGE_GAP_MIN
      : HARD_FLOOR_PX;
    const minWidthPx = minGaugesPx + CARD_PADDING_X;
    const minColumns = Math.max(3, Math.ceil((minWidthPx + SECTION_GAP_PX) / cellCol));

    return {
      rows: Math.max(minRows, this.getCardSize()),
      min_columns: minColumns,
      min_rows: minRows,
      // No max_columns / max_rows — HA's layout decides the ceiling.
    };
  }

  _calculateStats() {
    if (!this.hass || !this._config) return null;

    const config = this._config;
    const decimals = config.decimal_places ?? 3;

    // Required: SOC
    const socValue = getEntityValue(this.hass, config.soc_entity);
    if (!socValue.available || socValue.value === null) return null;

    // Required: Power
    const powerValue = getEntityValue(this.hass, config.power_entity);
    if (!powerValue.available || powerValue.value === null) return null;

    let power = powerValue.value;
    if ((powerValue.unit || '').toLowerCase() === 'kw') power *= 1000;
    if (config.invert_power) power = -power;
    if (config.enable_trickle_charge_filter && Math.abs(power) < (config.trickle_charge_threshold ?? 25)) {
      power = 0;
    }

    const status = getBatteryStatus(power, 0);

    // SOC Energy (entity only)
    const socEnergyValue = getEntityValue(this.hass, config.soc_energy_entity);
    let socEnergyWh = null;
    if (socEnergyValue.available && socEnergyValue.value !== null) {
      socEnergyWh = normalizeUnit(socEnergyValue.value, socEnergyValue.unit);
    }

    // Capacity (entity or fixed, fixed is in kWh)
    const capacityData = getEntityOrFixedValue(this.hass, config, 'capacity_entity', 'capacity', 'kWh');
    let capacityWh = null;
    if (capacityData.available && capacityData.value !== null) {
      capacityWh = capacityData.isFixed ? capacityData.value * 1000 : normalizeUnit(capacityData.value, capacityData.unit);
    }

    // Reserve (entity or fixed, both in %)
    const reserveData = getEntityOrFixedValue(this.hass, config, 'reserve_entity', 'reserve', '%');
    let reservePercent = null;
    if (reserveData.available && reserveData.value !== null) {
      reservePercent = reserveData.value;
    }

    // Calculate reserve in Wh
    let reserveWh = null;
    if (reservePercent !== null && capacityWh !== null) {
      reserveWh = capacityWh * (reservePercent / 100);
    }

    // Cutoff (max charge limit %) - calculated early for time estimates
    const cutoffData = getEntityOrFixedValue(this.hass, config, 'cutoff_entity', 'cutoff', '%');
    let cutoffPercent = null;
    if (cutoffData.available && cutoffData.value !== null) {
      cutoffPercent = cutoffData.value;
    }

    // Time estimates
    let timeToTarget = null;
    let targetPercent = null;

    if (socEnergyWh !== null && capacityWh !== null && power !== 0) {
      if (status === 'charging') {
        // Use cutoff percentage if configured, otherwise 100%
        targetPercent = cutoffPercent !== null ? cutoffPercent : 100;
        const targetEnergy = capacityWh * (targetPercent / 100);
        timeToTarget = calculateTimeToTarget(socEnergyWh, targetEnergy, power);
      } else if (status === 'discharging' && reservePercent !== null) {
        targetPercent = reservePercent;
        const targetEnergy = capacityWh * (reservePercent / 100);
        timeToTarget = calculateTimeToTarget(socEnergyWh, targetEnergy, power);
      }
    }

    // Charge/Discharge rates (entity or fixed, fixed is in W)
    const chargeRateData = getEntityOrFixedValue(this.hass, config, 'charge_rate_entity', 'charge_rate', 'W');
    let chargeRateW = null;
    let chargeRatePercent = null;
    if (chargeRateData.available && chargeRateData.value !== null) {
      chargeRateW = chargeRateData.isFixed ? chargeRateData.value : normalizeUnit(chargeRateData.value, chargeRateData.unit);
      if (power > 0 && chargeRateW > 0) {
        chargeRatePercent = Math.min(100, (power / chargeRateW) * 100);
      }
    }

    const dischargeRateData = getEntityOrFixedValue(this.hass, config, 'discharge_rate_entity', 'discharge_rate', 'W');
    let dischargeRateW = null;
    let dischargeRatePercent = null;
    if (dischargeRateData.available && dischargeRateData.value !== null) {
      dischargeRateW = dischargeRateData.isFixed ? dischargeRateData.value : normalizeUnit(dischargeRateData.value, dischargeRateData.unit);
      if (power < 0 && dischargeRateW > 0) {
        dischargeRatePercent = Math.min(100, (Math.abs(power) / dischargeRateW) * 100);
      }
    }

    // Power percentage (relative to max rate)
    let powerPercent = 0;
    if (status === 'charging' && chargeRateW && chargeRateW > 0) {
      powerPercent = Math.min(100, (Math.abs(power) / chargeRateW) * 100);
    } else if (status === 'discharging' && dischargeRateW && dischargeRateW > 0) {
      powerPercent = Math.min(100, (Math.abs(power) / dischargeRateW) * 100);
    }

    // Stats panel entities
    const tempValue = getEntityValue(this.hass, config.temp_entity);
    const cyclesValue = getEntityValue(this.hass, config.cycles_entity);
    const healthValue = getEntityValue(this.hass, config.health_entity);

    const temp = tempValue.available ? tempValue.value : null;
    const tempUnit = tempValue.unit || '°C';
    const cycles = cyclesValue.available ? cyclesValue.value : null;
    const health = healthValue.available ? healthValue.value : null;

    const hasStats = temp !== null || cycles !== null || health !== null;

    return {
      socPercent: socValue.value,
      socEnergyWh,
      power,
      status,
      capacityWh,
      reservePercent,
      reserveWh,
      timeToTarget,
      targetPercent,
      chargeRateW,
      chargeRatePercent,
      dischargeRateW,
      dischargeRatePercent,
      cutoffPercent,
      powerPercent,
      temp,
      tempUnit,
      cycles,
      health,
      hasStats,
      decimals,
    };
  }

  // ==========================================================================
  // CONSUMPTION CALCULATION
  // ==========================================================================
  _calculateConsumption() {
    const config = this._config;
    const mode = config.consumption_calc_mode || 'composed';

    let grid = 0;
    let pv = 0;
    let battery = 0;
    let total = 0;
    let available = false;

    const batteryDischargeFromSigned = (signedPowerEntity) => {
      const v = readPowerWatts(this.hass, signedPowerEntity);
      if (!v.available) return 0;
      let bp = v.value;
      if (config.invert_power) bp = -bp;
      if (config.battery_consumption_invert) bp = -bp;
      // After normalisation: + = charging, − = discharging
      return bp < 0 ? Math.abs(bp) : 0;
    };

    if (mode === 'composed') {
      const g = readPowerWatts(this.hass, config.grid_import_entity);
      const p = readPowerWatts(this.hass, config.pv_direct_entity);
      const b = readPowerWatts(this.hass, config.battery_discharge_entity);
      grid = Math.max(0, g.value);
      pv = Math.max(0, p.value);
      battery = Math.max(0, b.value);
      total = grid + pv + battery;
      available = g.available || p.available || b.available;
    } else if (mode === 'calculated') {
      const cons = readPowerWatts(this.hass, config.consumption_entity);
      if (!cons.available) {
        available = false;
      } else {
        total = Math.max(0, cons.value);
        const gridSigned = readPowerWatts(this.hass, config.grid_power_entity);
        let gridV = gridSigned.value;
        if (config.grid_invert) gridV = -gridV;
        grid = Math.max(0, gridV);
        battery = batteryDischargeFromSigned(config.power_entity);
        pv = Math.max(0, total - grid - battery);
        available = true;
      }
    } else if (mode === 'direct') {
      const cons = readPowerWatts(this.hass, config.consumption_entity);
      if (!cons.available) {
        available = false;
      } else {
        total = Math.max(0, cons.value);
        const pvSelf = readPowerWatts(this.hass, config.pv_self_consumption_entity);
        pv = Math.max(0, pvSelf.value);
        battery = batteryDischargeFromSigned(config.power_entity);
        grid = Math.max(0, total - pv - battery);
        available = true;
      }
    }

    // Tagesenergie (kWh — angenommen, dass Energie-Sensoren kWh-Einheiten haben)
    const ge = getEntityValue(this.hass, config.grid_energy_today_entity);
    const pe = getEntityValue(this.hass, config.pv_self_energy_today_entity);
    const be = getEntityValue(this.hass, config.battery_discharge_energy_today_entity);
    const ce = getEntityValue(this.hass, config.consumption_energy_today_entity);

    return {
      available,
      grid, pv, battery, total,
      gridEnergyToday: ge.available ? ge.value : null,
      gridEnergyTodayUnit: ge.available ? (ge.unit || 'kWh') : 'kWh',
      pvEnergyToday: pe.available ? pe.value : null,
      pvEnergyTodayUnit: pe.available ? (pe.unit || 'kWh') : 'kWh',
      batteryEnergyToday: be.available ? be.value : null,
      batteryEnergyTodayUnit: be.available ? (be.unit || 'kWh') : 'kWh',
      consumptionEnergyToday: ce.available ? ce.value : null,
      consumptionEnergyTodayUnit: ce.available ? (ce.unit || 'kWh') : 'kWh',
    };
  }

  _getConsumptionDonutBackground(grid, pv, battery, total, colors) {
    if (total <= 0) {
      return `conic-gradient(from 0deg, var(--ubc-gauge-bg) 0deg 360deg)`;
    }
    const gridDeg = (grid / total) * 360;
    const pvDeg = (pv / total) * 360;
    const startPv = gridDeg;
    const startBatt = gridDeg + pvDeg;
    return `conic-gradient(from 0deg,` +
      ` ${colors.grid} 0deg ${gridDeg}deg,` +
      ` ${colors.pv} ${gridDeg}deg ${startBatt}deg,` +
      ` ${colors.battery} ${startBatt}deg 360deg)`;
  }

  // ==========================================================================
  // SOLAR CALCULATION
  // ==========================================================================
  _calculateSolar() {
    const config = this._config;

    const panels = (Array.isArray(config.pv_panels) ? config.pv_panels : []).map((p, idx) => {
      const power = readPowerWatts(this.hass, p && p.entity);
      const energyEntity = p && p.energy_today_entity;
      const en = energyEntity ? getEntityValue(this.hass, energyEntity) : { available: false, value: null, unit: '' };
      const peak = (p && Number.isFinite(parseFloat(p.peak))) ? parseFloat(p.peak) : null;
      return {
        index: idx,
        entity: p && p.entity,
        name: (p && p.name) || `Panel ${idx + 1}`,
        peak,
        power: power.available ? power.value : 0,
        available: power.available,
        energyToday: en.available ? en.value : null,
        energyTodayUnit: en.available ? (en.unit || 'kWh') : 'kWh',
      };
    });

    const totalPower = readPowerWatts(this.hass, config.pv_total_entity);
    const panelsSum = panels.reduce((s, p) => s + (p.available ? p.power : 0), 0);
    const total = totalPower.available ? totalPower.value : panelsSum;

    // System peak: explicit config wins, else sum of panel peaks (if all set)
    let totalPeak = parseFloat(config.pv_total_peak);
    if (!Number.isFinite(totalPeak) || totalPeak <= 0) {
      const peaks = panels.map(p => p.peak).filter(v => Number.isFinite(v) && v > 0);
      totalPeak = peaks.length === panels.length && peaks.length > 0
        ? peaks.reduce((s, v) => s + v, 0)
        : null;
    }

    const totalEnergyTodayVal = getEntityValue(this.hass, config.pv_total_energy_today_entity);

    return {
      available: totalPower.available || panels.some(p => p.available),
      total,
      totalPeak,
      totalEnergyToday: totalEnergyTodayVal.available ? totalEnergyTodayVal.value : null,
      totalEnergyTodayUnit: totalEnergyTodayVal.available ? (totalEnergyTodayVal.unit || 'kWh') : 'kWh',
      panels,
    };
  }

  /**
   * Generates conic-gradient background for gauge
   * @param {number} value - Percentage (0-100)
   * @param {string} color - CSS color for filled portion
   * @returns {string} CSS background value
   */
  _getGaugeBackground(value, color) {
    // Full 360 degree circle, color starts at top and fills counter-clockwise
    const degrees = Math.min(100, Math.max(0, value)) * 3.6;
    const startAngle = 360 - degrees;
    return `conic-gradient(from 0deg, var(--ubc-gauge-bg) 0deg ${startAngle}deg, ${color} ${startAngle}deg 360deg)`;
  }

  /**
   * Generates conic-gradient background for power gauge with direction support
   * @param {number} value - Percentage (0-100)
   * @param {string} color - CSS color for filled portion
   * @param {boolean} isCharging - If true, fills clockwise; if false, fills counter-clockwise
   * @returns {string} CSS background value
   */
  _getPowerGaugeBackground(value, color, isCharging) {
    const degrees = Math.min(100, Math.max(0, value)) * 3.6;
    if (isCharging) {
      // Clockwise from top: color from 0 to degrees
      return `conic-gradient(from 0deg, ${color} 0deg ${degrees}deg, var(--ubc-gauge-bg) ${degrees}deg 360deg)`;
    } else {
      // Counter-clockwise from top: color from (360-degrees) to 360
      const startAngle = 360 - degrees;
      return `conic-gradient(from 0deg, var(--ubc-gauge-bg) 0deg ${startAngle}deg, ${color} ${startAngle}deg 360deg)`;
    }
  }

  /**
   * Calculates marker rotation for gauge position
   * @param {number} percent - Position as percentage (0-100)
   * @returns {string} CSS transform value
   */
  _getMarkerRotation(percent) {
    // Full circle starting at top (0deg), going counter-clockwise
    // So 0% = 0deg (top), 50% = 180deg (bottom going left), 100% = 360deg
    const rotation = 360 - (percent * 3.6);
    return `rotate(${rotation}deg)`;
  }

  /**
   * Gets the position for a rounded end cap on the gauge
   * @param {number} percent - Position as percentage (0-100)
   * @param {number} thickness - Ring thickness as percentage (default 15)
   * @returns {{x: number, y: number, startY: number}} Position as percentage from top-left
   */
  _getCapPosition(percent, thickness = 15) {
    // Counter-clockwise from top: angle = -(percent * 3.6) degrees
    // Ring midpoint = 50% - (thickness/2)
    const ringRadius = 50 - (thickness / 2);
    const angleRad = -(percent * 3.6) * (Math.PI / 180);
    const x = 50 + ringRadius * Math.sin(angleRad);
    const y = 50 - ringRadius * Math.cos(angleRad);
    const startY = 50 - ringRadius; // Top position for start cap
    return { x, y, startY };
  }

  /**
   * Gets the position for a rounded end cap on the power gauge with direction support
   * @param {number} percent - Position as percentage (0-100)
   * @param {number} thickness - Ring thickness as percentage
   * @param {boolean} isCharging - If true, calculates for clockwise fill; if false, counter-clockwise
   * @returns {{x: number, y: number, startY: number}} Position as percentage from top-left
   */
  _getPowerCapPosition(percent, thickness, isCharging) {
    const ringRadius = 50 - (thickness / 2);
    const direction = isCharging ? 1 : -1; // Clockwise = +, Counter-clockwise = -
    const angleRad = direction * (percent * 3.6) * (Math.PI / 180);
    const x = 50 + ringRadius * Math.sin(angleRad);
    const y = 50 - ringRadius * Math.cos(angleRad);
    const startY = 50 - ringRadius;
    return { x, y, startY };
  }

  render() {
    if (!this.hass || !this._config) return html``;

    // Show loading state if hass.states is empty (initial load)
    if (Object.keys(this.hass.states).length === 0) {
      return this._renderLoading();
    }

    const showBattery = this._config.show_battery !== false;
    const showConsumption = this._config.show_consumption === true;
    const showSolar = this._config.show_solar === true;
    const sectionCount = (showBattery ? 1 : 0) + (showConsumption ? 1 : 0) + (showSolar ? 1 : 0);

    if (sectionCount === 0) {
      return this._renderError(this._t('no_sections'));
    }

    const cardClass = sectionCount === 1 ? 'single-section' : 'multi-section';
    const cardName = (this._config.name || '').trim();
    const rawTitleSize = parseFloat(this._config.section_title_font_size);
    const titleSize = Number.isFinite(rawTitleSize) && rawTitleSize > 0 ? rawTitleSize : 1.0;

    // Build section render map, then render in configured order
    const sectionMap = {
      battery: showBattery ? this._renderBatterySectionOrPreview() : '',
      consumption: showConsumption ? this._renderConsumptionSection() : '',
      solar: showSolar ? this._renderSolarSection() : '',
    };
    const known = ['battery', 'consumption', 'solar'];
    const rawOrder = Array.isArray(this._config.section_order) ? this._config.section_order : [];
    const order = rawOrder.filter(k => known.includes(k));
    known.forEach(k => { if (!order.includes(k)) order.push(k); });

    return html`
      <ha-card class="${cardClass}" style="--egc-section-title-size: ${titleSize}em">
        ${cardName ? html`<div class="card-name">${cardName}</div>` : ''}
        ${order.map(k => sectionMap[k])}
      </ha-card>
    `;
  }

  _renderBatterySectionOrPreview() {
    const socMissing = !this._config.soc_entity || !entityExists(this.hass, this._config.soc_entity);
    const powerMissing = !this._config.power_entity || !entityExists(this.hass, this._config.power_entity);
    if (socMissing || powerMissing) {
      return this._renderBatteryPreview();
    }
    const stats = this._calculateStats();
    if (!stats) {
      return html`<div class="section battery-section"><div class="error-container">${this._t('battery_sensors_unavailable')}</div></div>`;
    }
    return this._renderBatterySection(stats);
  }

  _renderBatterySection(stats) {
    const socColor = getSocColor(stats.socPercent, this._config);
    const batteryIcon = getBatteryIcon(stats.socPercent);

    // Get state text - from entity or auto-detect
    let statusText = stats.status.charAt(0).toUpperCase() + stats.status.slice(1);
    let stateEntityText = null;
    if (this._config.state_entity && this.hass.states[this._config.state_entity]) {
      stateEntityText = this.hass.states[this._config.state_entity].state;
    }

    // Get mode text from entity
    let modeText = null;
    if (this._config.mode_entity && this.hass.states[this._config.mode_entity]) {
      modeText = this.hass.states[this._config.mode_entity].state;
    }

    // Format values
    const socEnergyFormatted = stats.socEnergyWh !== null ? formatEnergy(stats.socEnergyWh, stats.decimals) : null;
    const capacityFormatted = stats.capacityWh !== null ? formatEnergy(stats.capacityWh, stats.decimals) : null;
    const powerFormatted = formatPower(Math.abs(stats.power));
    const chargeRateFormatted = stats.chargeRateW !== null ? formatPower(stats.chargeRateW) : null;
    const dischargeRateFormatted = stats.dischargeRateW !== null ? formatPower(stats.dischargeRateW) : null;

    // Power direction
    const powerDirection = stats.status === 'charging' ? this._t('charging') : stats.status === 'discharging' ? this._t('discharging') : this._t('idle');
    const powerIcon = stats.status === 'charging' ? 'mdi:arrow-left' : stats.status === 'discharging' ? 'mdi:arrow-right' : '';

    // Status icon for display
    const statusIcon = stats.status === 'charging' ? 'mdi:power-plug' :
                       stats.status === 'discharging' ? 'mdi:power-plug-off' : 'mdi:power-plug';

    // Gauge backgrounds
    const socGaugeBackground = this._getGaugeBackground(stats.socPercent, socColor);

    // Power gauge: direction and color based on charging/discharging/idle
    const isCharging = stats.status === 'charging';
    const isIdle = stats.status === 'idle';
    const powerGaugeColor = isIdle ? 'var(--secondary-text-color)' : (isCharging ? 'rgb(0, 128, 0)' : 'rgb(255, 166, 0)');
    const powerGaugeBackground = this._getPowerGaugeBackground(stats.powerPercent, powerGaugeColor, isCharging);

    // Gauge thickness
    const thickness = this._config.gauge_thickness ?? 15;
    const socCapPos = this._getCapPosition(stats.socPercent, thickness);
    const powerCapPos = this._getPowerCapPosition(stats.powerPercent, thickness, isCharging);

    // Has rates configured for power gauge
    const hasRates = stats.chargeRateW !== null || stats.dischargeRateW !== null;

    return html`
      <div class="section battery-section">
        <!-- Header -->
        ${this._config.header_style !== 'none' ? html`
          <div class="header">
            <div class="header-left">
              ${this._config.show_battery_title !== false ? html`
                <div class="title-row">
                  <span class="title">${this._config.battery_section_title || this._t('battery')}</span>
                </div>
              ` : ''}
              ${this._config.header_style === 'full' ? html`
                <div class="state-mode-row">
                  <span class="state-row" @click=${(e) => this._openMoreInfo(e, this._config.state_entity)}>
                    ${stateEntityText ? stateEntityText : statusText}
                    <ha-icon icon="${statusIcon}"></ha-icon>
                  </span>
                  ${modeText ? html`
                    <span class="separator">·</span>
                    <span class="mode" @click=${(e) => this._openMoreInfo(e, this._config.mode_entity)}>
                      ${modeText}
                      <ha-icon icon="mdi:cog"></ha-icon>
                    </span>
                  ` : ''}
                </div>
              ` : ''}
              ${this._config.header_style === 'full' && capacityFormatted && this._config.show_capacity !== false ? html`
                <div class="capacity-row">${this._t('capacity')}: ${capacityFormatted.value} ${capacityFormatted.unit}</div>
              ` : ''}
            </div>
            ${this._config.header_style === 'full' && stats.hasStats && this._config.show_stats !== false ? html`
              <div class="stats-panel">
                ${stats.temp !== null ? html`
                  <div class="stat" @click=${(e) => this._openMoreInfo(e, this._config.temp_entity)}>${this._t('temp')}: <span>${stats.temp}${stats.tempUnit}</span></div>
                ` : ''}
                ${stats.cycles !== null ? html`
                  <div class="stat" @click=${(e) => this._openMoreInfo(e, this._config.cycles_entity)}>${this._t('cycles')}: <span>${stats.cycles}</span></div>
                ` : ''}
                ${stats.health !== null ? html`
                  <div class="stat" @click=${(e) => this._openMoreInfo(e, this._config.health_entity)}>${this._t('health')}: <span>${stats.health}%</span></div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Gauges -->
        <div class="gauges-container">
          <!-- Main SOC Gauge -->
          <div class="gauge-wrapper main-gauge-wrapper" @click=${(e) => this._openMoreInfo(e, this._config.soc_entity)}>
            <div class="gauge main-gauge" style="background: ${socGaugeBackground}; --ring-thickness: ${thickness}%">
              <!-- Rounded end caps -->
              ${stats.socPercent > 0 ? html`
                <div class="gauge-cap" style="background: ${socColor}; top: ${socCapPos.startY}%; left: 50%;"></div>
                <div class="gauge-cap" style="background: ${socColor}; top: ${socCapPos.y}%; left: ${socCapPos.x}%;"></div>
              ` : ''}
              <!-- Markers -->
              ${stats.reservePercent !== null ? html`
                <div class="marker reserve" style="transform-origin: center calc(var(--ubc-gauge-size) / 2 + 6px); transform: ${this._getMarkerRotation(stats.reservePercent)}"></div>
              ` : ''}
              ${stats.cutoffPercent !== null ? html`
                <div class="marker cutoff" style="transform-origin: center calc(var(--ubc-gauge-size) / 2 + 6px); transform: ${this._getMarkerRotation(stats.cutoffPercent)}"></div>
              ` : ''}
              <div class="gauge-center">
                <ha-icon icon="${batteryIcon}" style="color: ${socColor}"></ha-icon>
                <span class="soc-value" style="color: ${socColor}">${Math.round(stats.socPercent)}%</span>
                ${socEnergyFormatted ? html`
                  <span class="energy-value">${socEnergyFormatted.value} ${socEnergyFormatted.unit}</span>
                ` : ''}
              </div>
            </div>
            <!-- Labels outside gauge -->
            ${this._config.show_gauge_labels !== false ? html`
              <div class="gauge-labels">
                ${stats.reservePercent !== null ? html`
                  <div class="gauge-label reserve">${this._t('reserve')} ${Math.round(stats.reservePercent)}%</div>
                ` : ''}
                ${stats.cutoffPercent !== null ? html`
                  <div class="gauge-label cutoff">${this._t('cutoff')} ${Math.round(stats.cutoffPercent)}%</div>
                ` : ''}
              </div>
            ` : ''}
          </div>

          <!-- Power Gauge (only if rates configured and enabled) -->
          ${hasRates && this._config.show_rates !== false ? html`
            <div class="gauge-wrapper power-gauge-wrapper" @click=${(e) => this._openMoreInfo(e, this._config.power_entity)}>
              <div class="gauge power-gauge" style="background: ${powerGaugeBackground}; --ring-thickness: ${thickness}%">
                <!-- Rounded end caps -->
                ${stats.powerPercent > 0 ? html`
                  <div class="gauge-cap" style="background: ${powerGaugeColor}; top: ${powerCapPos.startY}%; left: 50%;"></div>
                  <div class="gauge-cap" style="background: ${powerGaugeColor}; top: ${powerCapPos.y}%; left: ${powerCapPos.x}%;"></div>
                ` : ''}
                <div class="gauge-center">
                  ${this._config.show_power_percent !== false ? html`
                    <span class="power-percent">${Math.round(stats.powerPercent)}%</span>
                  ` : ''}
                  <span class="power-value" style="color: ${powerGaugeColor}">${powerFormatted.value} ${powerFormatted.unit}</span>
                  ${this._config.show_power_direction !== false ? html`
                    <span class="power-direction">
                      ${powerDirection}
                      ${powerIcon ? html`<ha-icon icon="${powerIcon}" style="color: ${powerGaugeColor}"></ha-icon>` : ''}
                    </span>
                  ` : ''}
                </div>
              </div>
              ${this._config.show_rate_labels !== false ? html`
                <div class="rate-labels">
                  ${dischargeRateFormatted ? html`
                    <div class="rate-label-item">
                      ${this._t('max_discharge')}
                      <span>${dischargeRateFormatted.value} ${dischargeRateFormatted.unit}</span>
                    </div>
                  ` : ''}
                  ${chargeRateFormatted ? html`
                    <div class="rate-label-item">
                      ${this._t('max_charge')}
                      <span>${chargeRateFormatted.value} ${chargeRateFormatted.unit}</span>
                    </div>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>

      </div>
    `;
  }

  _renderError(message) {
    return html`
      <ha-card>
        <div class="error-container">
          <ha-icon icon="mdi:alert-circle"></ha-icon>
          <div>${message}</div>
        </div>
      </ha-card>
    `;
  }

  _renderLoading() {
    return html`
      <ha-card>
        <div class="header">
          <div class="header-left">
            <div class="title-row">
              <span class="title">${this._config.battery_section_title || this._t('battery')}</span>
            </div>
            <div class="state-row skeleton">${this._t('loading')}</div>
          </div>
        </div>
        <div class="gauges-container">
          <div class="gauge-wrapper main-gauge-wrapper">
            <div class="gauge main-gauge skeleton" style="background: var(--ubc-gauge-bg)">
              <div class="gauge-center">
                <ha-icon icon="mdi:battery-50" class="skeleton"></ha-icon>
                <span class="soc-value skeleton">--%</span>
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  _renderBatteryPreview() {
    // Demo values for preview
    const socPercent = 72;
    const socColor = 'rgb(0, 128, 0)';
    const thickness = this._config.gauge_thickness ?? 15;
    const socCapPos = this._getCapPosition(socPercent, thickness);
    const socGaugeBackground = this._getGaugeBackground(socPercent, socColor);

    return html`
      <div class="section battery-section">
        <div class="header">
          <div class="header-left">
            <div class="title-row">
              <span class="title">${this._config.battery_section_title || this._t('battery')}</span>
            </div>
            <div class="state-row" style="opacity: 0.6">
              ${this._t('configure_entities')}
            </div>
          </div>
        </div>
        <div class="gauges-container">
          <div class="gauge-wrapper main-gauge-wrapper">
            <div class="gauge main-gauge" style="background: ${socGaugeBackground}; --ring-thickness: ${thickness}%">
              ${socPercent > 0 ? html`
                <div class="gauge-cap" style="background: ${socColor}; top: ${socCapPos.startY}%; left: 50%;"></div>
                <div class="gauge-cap" style="background: ${socColor}; top: ${socCapPos.y}%; left: ${socCapPos.x}%;"></div>
              ` : ''}
              <div class="gauge-center">
                <ha-icon icon="mdi:battery-70" style="color: ${socColor}"></ha-icon>
                <span class="soc-value" style="color: ${socColor}">${socPercent}%</span>
                <span class="energy-value">3.74 kWh</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // CONSUMPTION SECTION
  // ==========================================================================
  _renderConsumptionSection() {
    const config = this._config;
    const c = this._calculateConsumption();
    if (!c.available) {
      return html`
        <div class="section consumption-section">
          ${config.show_consumption_title !== false ? html`
            <div class="section-title">${config.consumption_section_title || this._t('consumption')}</div>
          ` : ''}
          <div class="error-container">
            <ha-icon icon="mdi:flash-alert"></ha-icon>
            <div>${this._t('consumption_sensors_unavailable')}</div>
          </div>
        </div>`;
    }

    const colors = {
      grid: rgbToCss(config.consumption_color_grid, 'rgb(219, 68, 55)'),
      pv: rgbToCss(config.consumption_color_pv, 'rgb(255, 166, 0)'),
      battery: rgbToCss(config.consumption_color_battery, 'rgb(0, 128, 0)'),
    };

    const thickness = config.gauge_thickness ?? 15;
    const background = this._getConsumptionDonutBackground(c.grid, c.pv, c.battery, c.total, colors);
    const totalFmt = formatPower(c.total);
    const gridFmt = formatPower(c.grid);
    const pvFmt = formatPower(c.pv);
    const battFmt = formatPower(c.battery);

    const showEnergyToday = config.show_consumption_energy_today !== false;
    const showLegend = config.show_consumption_legend !== false;

    const fmtKwh = (v, unit) => v == null ? null : `${parseFloat(v).toFixed(2)} ${unit || 'kWh'}`;
    const gridToday = fmtKwh(c.gridEnergyToday, c.gridEnergyTodayUnit);
    const pvToday = fmtKwh(c.pvEnergyToday, c.pvEnergyTodayUnit);
    const battToday = fmtKwh(c.batteryEnergyToday, c.batteryEnergyTodayUnit);
    const consToday = fmtKwh(c.consumptionEnergyToday, c.consumptionEnergyTodayUnit);

    const clickEntity = config.consumption_entity || config.grid_import_entity || config.grid_power_entity;

    return html`
      <div class="section consumption-section">
        ${config.show_consumption_title !== false ? html`
          <div class="section-title">${config.consumption_section_title || this._t('consumption')}</div>
        ` : ''}
        <div class="consumption-gauge-wrapper" @click=${(e) => this._openMoreInfo(e, clickEntity)}>
          <div class="consumption-gauge" style="background: ${background}; --ring-thickness: ${thickness}%">
            <div class="gauge-center">
              <span class="consumption-value">${totalFmt.value} ${totalFmt.unit}</span>
              <span class="consumption-label">${this._t('consumption_label')}</span>
              ${showEnergyToday && consToday ? html`<span class="consumption-energy-today">${this._t('today_colon')} ${consToday}</span>` : ''}
            </div>
          </div>
        </div>
        ${showLegend ? html`
          <div class="consumption-legend">
            <div class="legend-item" @click=${(e) => this._openMoreInfo(e, config.grid_import_entity || config.grid_power_entity)}>
              <span class="legend-swatch" style="background: ${colors.grid}"></span>
              ${this._t('grid')}: <span class="legend-value">${gridFmt.value} ${gridFmt.unit}</span>
              ${showEnergyToday && gridToday ? html`<span class="legend-today">(${gridToday} ${this._t('today')})</span>` : ''}
            </div>
            <div class="legend-item" @click=${(e) => this._openMoreInfo(e, config.pv_direct_entity || config.pv_self_consumption_entity || config.pv_total_entity)}>
              <span class="legend-swatch" style="background: ${colors.pv}"></span>
              ${this._t('solar_short')}: <span class="legend-value">${pvFmt.value} ${pvFmt.unit}</span>
              ${showEnergyToday && pvToday ? html`<span class="legend-today">(${pvToday} ${this._t('today')})</span>` : ''}
            </div>
            <div class="legend-item" @click=${(e) => this._openMoreInfo(e, config.battery_discharge_entity || config.power_entity)}>
              <span class="legend-swatch" style="background: ${colors.battery}"></span>
              ${this._t('battery_short')}: <span class="legend-value">${battFmt.value} ${battFmt.unit}</span>
              ${showEnergyToday && battToday ? html`<span class="legend-today">(${battToday} ${this._t('today')})</span>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ==========================================================================
  // SOLAR SECTION
  // ==========================================================================
  _renderSolarSection() {
    const config = this._config;
    const s = this._calculateSolar();

    if (!s.available && (!config.pv_panels || config.pv_panels.length === 0) && !config.pv_total_entity) {
      return html`
        <div class="section solar-section">
          ${config.show_solar_title !== false ? html`
            <div class="section-title">${config.solar_section_title || this._t('solar')}</div>
          ` : ''}
          <div class="error-container">
            <ha-icon icon="mdi:solar-power"></ha-icon>
            <div>${this._t('solar_sensors_unavailable')}</div>
          </div>
        </div>`;
    }

    const color = rgbToCss(config.solar_color, 'rgb(255, 166, 0)');
    const thickness = config.gauge_thickness ?? 15;
    const showEnergyToday = config.show_solar_energy_today !== false;

    // Total gauge
    const totalPct = (s.totalPeak && s.totalPeak > 0)
      ? Math.min(100, Math.max(0, (s.total / s.totalPeak) * 100))
      : 0;
    const totalBg = this._getGaugeBackground(totalPct, color);
    const totalFmt = formatPower(s.total);
    const totalToday = s.totalEnergyToday != null
      ? `${parseFloat(s.totalEnergyToday).toFixed(2)} ${s.totalEnergyTodayUnit || 'kWh'}`
      : null;

    // Panel grid columns: default 2 (so 4 panels render as 2x2). Allow
     // override via config; clamp to a sensible range.
    const cols = Math.max(1, Math.min(6, parseInt(config.solar_panel_cols, 10) || 2));

    const hasTotal = !!(config.pv_total_entity || s.totalPeak);

    return html`
      <div class="section solar-section" style="--egc-panel-cols: ${cols}">
        ${config.show_solar_title !== false ? html`
          <div class="section-title">${config.solar_section_title || this._t('solar')}</div>
        ` : ''}
        <div class="solar-content">
          ${hasTotal ? html`
            <div class="solar-total-wrapper" @click=${(e) => this._openMoreInfo(e, config.pv_total_entity)}>
              <div class="solar-total-gauge" style="background: ${totalBg}; --ring-thickness: ${thickness}%">
                <div class="gauge-center">
                  <span class="solar-total-value" style="color: ${color}">${totalFmt.value} ${totalFmt.unit}</span>
                  <span class="solar-total-label">${this._t('pv_total')}${s.totalPeak ? ` · ${Math.round(totalPct)}%` : ''}</span>
                  ${showEnergyToday && totalToday ? html`<span class="solar-total-energy-today">${this._t('today_colon')} ${totalToday}</span>` : ''}
                </div>
              </div>
            </div>
          ` : ''}
          ${s.panels.length > 0 ? html`
            <div class="solar-panels-grid">
              ${s.panels.map(p => {
                const pct = (p.peak && p.peak > 0)
                  ? Math.min(100, Math.max(0, (p.power / p.peak) * 100))
                  : 0;
                const bg = this._getGaugeBackground(pct, color);
                const pf = formatPower(p.power);
                const today = p.energyToday != null
                  ? `${parseFloat(p.energyToday).toFixed(2)} ${p.energyTodayUnit || 'kWh'}`
                  : null;
                return html`
                  <div class="solar-panel-wrapper" @click=${(e) => this._openMoreInfo(e, p.entity)}>
                    <div class="solar-panel-gauge" style="background: ${bg}; --ring-thickness: ${thickness}%">
                      <div class="gauge-center">
                        <span class="solar-panel-value" style="color: ${color}">${pf.value} ${pf.unit}</span>
                      </div>
                    </div>
                    <div class="solar-panel-name">${p.name}</div>
                    ${showEnergyToday && today ? html`<div class="solar-panel-energy-today">${today}</div>` : ''}
                  </div>
                `;
              })}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}

if (!customElements.get('energy-gauge-card')) {
  customElements.define('energy-gauge-card', EnergyGaugeCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'energy-gauge-card',
  name: CARD_NAME,
  description: CARD_DESCRIPTION,
  preview: true,
});

console.info(
  `%c ENERGY-GAUGE-CARD %c v${VERSION} `,
  'color: white; background: #2ecc71; font-weight: bold;',
  'color: #2ecc71; background: white; font-weight: bold;'
);
