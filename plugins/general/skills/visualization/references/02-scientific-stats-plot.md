# 2D Scientific & Statistical Plots (Observable Plot + LinkeDOM)

Reference guide for rendering 2D experimental curves, uncertainty intervals, statistical distributions, regressions, scalar contours, and 2D vector fields to deterministic SVG via `@observablehq/plot` and `linkedom`. `scripts/render-plot.mjs` provides both a CLI runner and a Node helper API.

Never use `PyVista` for 2D statistical charts: VTK `GL2PS` exports `pv.Chart2D` as blank raster wrappers and lacks kernel density, regression, and faceting transforms.

## Contents

1. [Programmatic & CLI Usage](#programmatic--cli-usage)
2. [Quantitative & Academic Plotting Rules](#quantitative--academic-plotting-rules)
3. [Scientific Color System](#scientific-color-system)
4. [Dark/Light Theme Adaptation](#darklight-theme-adaptation)
5. [High-Value Scientific Mark Recipes](#high-value-scientific-mark-recipes)

---

## Programmatic & CLI Usage

`<SKILL_DIR>` denotes the directory containing `SKILL.md`.

### 1. Import `createPlotRunner` in a Node Script

```js
import { createPlotRunner } from '<SKILL_DIR>/scripts/render-plot.mjs';

const { Plot, renderSvg } = await createPlotRunner();
const svg = renderSvg({
  width: 640,
  height: 300,
  marginLeft: 52,
  marginBottom: 38,
  grid: true,
  x: { label: 'Concurrent Workers (count) ->' },
  y: { label: '^ Throughput (req/s)', zero: true },
  marks: [
    Plot.ruleY([0]),
    Plot.areaY(data, { x: 'workers', y1: 'ciLow', y2: 'ciHigh', fill: '#0072B2', fillOpacity: 0.18 }),
    Plot.lineY(data, { x: 'workers', y: 'mean', stroke: '#0072B2', strokeWidth: 2 }),
    Plot.dot(data, { x: 'workers', y: 'mean', fill: '#0072B2', r: 3 }),
  ],
});
process.stdout.write(svg);
```

### 2. Run a Spec Module via CLI

```bash
node "<SKILL_DIR>/scripts/render-plot.mjs" spec.mjs --out chart.svg
```

---

## Quantitative & Academic Plotting Rules

1. **Physical quantities and units on every axis**: Write both the variable name and measurement unit on `x` and `y` labels (for example `Batch Size (tokens)`, `P99 Latency (ms)`, `Validation Accuracy (%)`, `Standardized Residual z`). Bare `x` or `y` labels without units are forbidden.
2. **Explicit uncertainty and sample size**: Whenever measurements carry sampling variance, plot error bars (`Plot.ruleY` / `Plot.ruleX`), confidence bands (`Plot.areaY`), or interquartile boxes (`Plot.boxX` / `Plot.boxY`), and state sample size $n$ and interval definition in the subtitle or caption (for example `Shaded band: 95% CI across n = 32 runs`).
3. **Explicit baselines and thresholds**: Add reference lines (`Plot.ruleY([0])`, `y = x` calibration diagonals, or dashed SLA/baseline rules via `strokeDasharray: '4,4'`) whenever evaluating residuals, calibration, or speedups.
4. **Tabular numerals**: Apply `font-variant-numeric: tabular-nums` to tick labels, legends, and summary readouts.
5. **Caption & label language**: Unless the user instructs otherwise, write chart titles, subtitles, captions, legend labels, and axis quantity names in the language used by the user while keeping standard unit symbols (`ms`, `GB/s`, `tok/s`, `%`) and mathematical notation intact.

---

## Scientific Color System

Scientific plot colors encode data magnitudes and group identities. Keep them strictly separate from UI chrome tokens and select palettes according to data scale:

### 1. Categorical Series (`<= 6` Groups): Okabe-Ito Colorblind-Safe Palette

1. **Primary treatment (`#0072B2`)**: Deep ocean blue for the primary experimental method or focal curve.
2. **Comparison group 2 (`#E69F00`)**: Amber orange for the main competing method.
3. **Comparison group 3 (`#009E73`)**: Bluish green for the secondary competing method.
4. **Comparison group 4 (`#CC79A7`)**: Reddish purple.
5. **Comparison group 5 (`#56B4E9`)**: Sky blue.
6. **Comparison group 6 / threshold alert (`#D55E00`)**: Vermilion for outlier highlights or bound violations.
7. **Baseline / non-significant control (`#7F8C8D`)**: Neutral gray paired with a dashed stroke (`strokeDasharray: '4,3'`) for random baselines, unoptimized controls, or statistically indistinguishable series.

### 2. Sequential Scalar Fields (Density, Probability, Energy, Temperature)

1. Use perceptually uniform, luminance-monotonic schemes so values remain ordered in grayscale print and under color-vision deficiency: `color: { scheme: 'YlGnBu' }`, `scheme: 'Viridis'`, or `scheme: 'Cividis'`.
2. Never use non-monotonic rainbow or jet colormaps.

### 3. Diverging Zero-Centered Quantities (Residuals, Correlations, Deltas)

1. Center the pivot explicitly at zero (or the domain threshold) with symmetric bounds: `color: { scheme: 'RdBu', pivot: 0, domain: [-maxAbs, maxAbs] }` or `scheme: 'PiYG'`.
2. Verify that zero maps to a neutral midpoint and positive/negative extremes carry symmetric luminance.

---

## Dark/Light Theme Adaptation

`Observable Plot` text halos (`stroke` outlines behind labels) and legend swatches read `--plot-background`. Include this rule in every HTML wrapper:

```css
svg[class^="plot-"] {
  --plot-background: var(--background);
  overflow: visible;
  font-variant-numeric: tabular-nums;
}
```

---

## High-Value Scientific Mark Recipes

### 1. 2D Scalar Contours + Gradient Vector Field

1. Layer `Plot.contour(grid, { x: 'x', y: 'y', fill: 'potential', blur: 1, thresholds: 12 })` beneath `Plot.vector(arrows, { x: 'x', y: 'y', length: 'mag', rotate: 'deg', anchor: 'middle' })`.
2. Set `color: { scheme: 'YlGnBu', legend: true }` so the scalar colorbar renders automatically above the frame.

### 2. Faceted Ridgeline Kernel Density (KDE)

1. Precompute normalized density arrays `(x, d, group)` per group and facet vertically with `fy: { label: null }`.
2. Pass explicit `y1: 0, y2: 'd'` to `Plot.areaY(kde, { x: 'x', y1: 0, y2: 'd', fy: 'group', fillOpacity: 0.35 })` alongside `Plot.lineY(kde, { x: 'x', y: 'd', fy: 'group' })`. Specifying `y1: 0, y2: 'd'` prevents `areaY` from collapsing into a flat line when combined with `Plot.tickX` rug marks that omit `y`.

### 3. Regression Calibration & Pairwise Difference Bands

1. For linear trend + 95% CI, call `Plot.linearRegressionY(points, { x: 'pred', y: 'obs', ci: 0.95, stroke: '#0072B2' })`.
2. For superiority/degradation regions between two trajectories, call `Plot.differenceY(series, { x: 'step', y1: 'baseline', y2: 'proposed', positiveFill: '#009E73', negativeFill: '#D55E00' })`.

### 4. Dense Scatter Binning & Spatial Tessellation

1. When sample count exceeds `500` points, replace raw overlapping dots with `Plot.hexbin(pts, Plot.binHex({ fill: 'count' }, { x: 'x', y: 'y' }))` or `Plot.density`.
2. For spatial neighborhood partitioning, combine `Plot.voronoi` and `Plot.delaunayMesh`.
