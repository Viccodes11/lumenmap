/**
 * Export-time theme for PNG/PDF capture paths.
 *
 * This is deliberately separate from the app's interactive theme: the
 * dashboard chrome always stays dark, and `light` only ever applies to a
 * cloned, serialized copy of a chart made at export time (see
 * `exportSvgToPng` in `lib/export-utils.ts`). Nothing here mutates the live
 * DOM's theme.
 *
 * The treemap SVG (`components/dashboard/D3Treemap.tsx`) paints its text and
 * tile borders with literal dark-theme colors rather than CSS custom
 * properties, so recoloring for export means rewriting those literals in the
 * serialized SVG markup, not toggling a class. `EXPORT_THEME_TOKENS` is the
 * source of truth for both directions of that rewrite — see
 * `docs/visual-tokens.md#export-time-light-theme` for the measured contrast
 * ratios behind the `light` values.
 */

export type ExportTheme = "dark" | "light";

export interface ExportThemeTokens {
  /** Canvas/page background painted behind the SVG during PNG rasterization */
  background: string;
  /** Tile border — blends adjacent treemap tiles into the background */
  tileBorder: string;
  /** Tile name text and the keyboard focus ring */
  textPrimary: string;
  /** Identity / share metadata text (~65% opacity in the dark theme) */
  textSecondary65: string;
  /** Value text (~90% opacity in the dark theme) */
  textSecondary90: string;
}

export const EXPORT_THEME_TOKENS: Readonly<Record<ExportTheme, ExportThemeTokens>> = {
  dark: {
    background: "#0B0E14",
    tileBorder: "#0B0E14",
    textPrimary: "#ffffff",
    textSecondary65: "rgba(255,255,255,0.65)",
    textSecondary90: "rgba(255,255,255,0.9)",
  },
  light: {
    background: "#ffffff",
    tileBorder: "#ffffff",
    textPrimary: "#0b0e14",
    textSecondary65: "rgba(11,14,20,0.72)",
    textSecondary90: "rgba(11,14,20,0.85)",
  },
};

/**
 * Exact dark-theme literal -> light-theme literal substitutions, applied in
 * a single pass over serialized SVG markup. Order doesn't matter: `replace`
 * with a combined regex scans the *original* string once, so the
 * `#ffffff` <-> `#0B0E14` swap (tile text vs. tile border — genuine mutual
 * inverses) can't clobber itself the way two sequential `.replace()` calls
 * would.
 */
const DARK_TO_LIGHT_LITERALS: ReadonlyArray<readonly [string, string]> = [
  [EXPORT_THEME_TOKENS.dark.textPrimary, EXPORT_THEME_TOKENS.light.textPrimary],
  [EXPORT_THEME_TOKENS.dark.tileBorder, EXPORT_THEME_TOKENS.light.tileBorder],
  [EXPORT_THEME_TOKENS.dark.textSecondary65, EXPORT_THEME_TOKENS.light.textSecondary65],
  [EXPORT_THEME_TOKENS.dark.textSecondary90, EXPORT_THEME_TOKENS.light.textSecondary90],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SWAP_PATTERN = new RegExp(DARK_TO_LIGHT_LITERALS.map(([from]) => escapeRegExp(from)).join("|"), "g");
const SWAP_LOOKUP = new Map(DARK_TO_LIGHT_LITERALS);

/**
 * Rewrites the dark-theme chrome literals (tile text, focus ring, tile
 * border) found in a serialized `<svg>` string to their light-theme
 * equivalents. A no-op for `theme: "dark"`. Data-category fill/pattern
 * colors (`CATEGORY_COLORS`, the hatching patterns in
 * `lib/treemap-patterns.ts`) are untouched — they're semantic data colors,
 * not chrome, and stay the same in both themes.
 */
export function recolorSvgMarkupForExportTheme(svgMarkup: string, theme: ExportTheme): string {
  if (theme === "dark") {
    return svgMarkup;
  }
  return svgMarkup.replace(SWAP_PATTERN, (match) => SWAP_LOOKUP.get(match) ?? match);
}
