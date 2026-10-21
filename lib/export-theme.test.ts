import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EXPORT_THEME_TOKENS, recolorSvgMarkupForExportTheme } from "./export-theme";

// A trimmed, representative serialization of one D3Treemap.tsx tile: tile
// border, focus ring, name text, identity text, and value text — the full
// set of dark-theme chrome literals the export path has to recolor.
const FIXTURE_TILE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">',
  '<style>g[tabindex]:focus-visible .tile-rect { stroke: #0B0E14 !important; }</style>',
  '<g><rect class="focus-ring" fill="none" stroke="#ffffff" stroke-width="2"></rect>',
  '<rect class="tile-rect" fill="#7b61ff" stroke="#0B0E14" stroke-width="1.5"></rect>',
  '<text fill="#ffffff" font-size="14">Soroban</text>',
  '<text fill="rgba(255,255,255,0.65)" font-size="10">GABC...WXYZ</text>',
  '<text fill="rgba(255,255,255,0.9)" font-size="13">1,204 ops</text>',
  '<text fill="rgba(255,255,255,0.65)" font-size="11">12.3%</text>',
  "</g></svg>",
].join("");

describe("export-theme", () => {
  test("dark theme is a no-op passthrough", () => {
    assert.equal(recolorSvgMarkupForExportTheme(FIXTURE_TILE_SVG, "dark"), FIXTURE_TILE_SVG);
  });

  test("light theme recolors tile text, focus ring, and border without touching data-category fill", () => {
    const light = recolorSvgMarkupForExportTheme(FIXTURE_TILE_SVG, "light");

    // Chrome literals flip to their light equivalents.
    assert.ok(light.includes(`fill="${EXPORT_THEME_TOKENS.light.textPrimary}"`), "name text recolored");
    assert.ok(light.includes(`stroke="${EXPORT_THEME_TOKENS.light.textPrimary}"`), "focus ring recolored");
    assert.ok(light.includes(`stroke="${EXPORT_THEME_TOKENS.light.tileBorder}"`), "tile border target color present");
    assert.ok(
      light.includes(`fill="${EXPORT_THEME_TOKENS.light.textSecondary65}"`),
      "65%-opacity metadata text recolored",
    );
    assert.ok(
      light.includes(`fill="${EXPORT_THEME_TOKENS.light.textSecondary90}"`),
      "90%-opacity value text recolored",
    );

    // #ffffff is a genuine mutual inverse here: it's the dark theme's text
    // color AND the light theme's new border color, so it legitimately
    // reappears post-swap (as the border) — only the uppercase dark border
    // literal (#0B0E14) must fully disappear, since nothing in the light
    // theme maps to it.
    assert.ok(!light.includes("#0B0E14"), "no dark border literal left behind");
    assert.ok(!light.includes("rgba(255,255,255"), "no dark rgba text literal left behind");

    // The data-category tile fill (#7b61ff) is not chrome — untouched.
    assert.ok(light.includes('fill="#7b61ff"'), "category fill color is preserved");
  });

  test("light theme chrome tokens meet WCAG AA contrast against the light background", () => {
    const srgbToLinear = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r, g, b]: [number, number, number]) =>
      0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
    const contrastRatio = (a: [number, number, number], b: [number, number, number]) => {
      const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const blendOnWhite = (rgb: [number, number, number], alpha: number): [number, number, number] => [
      alpha * rgb[0] + (1 - alpha) * 255,
      alpha * rgb[1] + (1 - alpha) * 255,
      alpha * rgb[2] + (1 - alpha) * 255,
    ];

    const white: [number, number, number] = [255, 255, 255];
    const ink: [number, number, number] = [11, 14, 20]; // #0b0e14

    assert.ok(contrastRatio(ink, white) >= 4.5, "primary text clears AA (4.5:1) on white");
    assert.ok(contrastRatio(blendOnWhite(ink, 0.72), white) >= 4.5, "65%-slot text clears AA on white");
    assert.ok(contrastRatio(blendOnWhite(ink, 0.85), white) >= 4.5, "90%-slot text clears AA on white");
  });
});
