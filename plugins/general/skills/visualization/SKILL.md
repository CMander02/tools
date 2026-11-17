---
name: visualization
description: >-
  Render deterministic structural diagrams, 2D scientific and statistical plots,
  3D spatial surfaces, meshes, and volumes, and interactive comparison matrices
  with light and dark theme adaptation. Use whenever a task calls for system
  architecture, sequence, state, ER, schedule, or grammar diagrams (32 Mermaid
  and Pele diagram types), experimental curves with confidence intervals, KDE,
  regression calibration, contours, or 2D vector fields, 3D surfaces,
  isosurfaces, streamlines, or volumetric fields, or aligned multi-metric
  tables and formula explorers.
---

# Visualization

Produce deterministic figures, diagrams, 3D renders, and interactive comparison panels that adapt cleanly to both light and dark themes. Skip visual output for single-fact answers or brief confirmations where prose suffices.

Three commitments govern every figure built with this skill:

1. **Compute geometry deterministically.** Run the bundled Node (`pele`, `@observablehq/plot` + `linkedom`) or Python (`pyvista`) engines instead of hand-calculating raw SVG coordinates or guessing layout bounds.
2. **Separate engineering chrome from scientific color scales.** Structural diagrams inherit neutral surface tokens; scientific plots encode data strictly with colorblind-safe categorical, perceptually uniform sequential, or zero-centered diverging palettes.
3. **Match the user's language for captions and labels.** Unless the user instructs otherwise, write all figure titles, subtitles, captions, node labels, axis labels, legends, table headers, and source-panel summaries in the language used by the user (preserving standard international unit symbols, mathematical variables, and code identifiers as-is).

Paths below are relative to this skill's directory (`<SKILL_DIR>`). Read only the single reference file that matches your target figure category.

## Bundled Resources

1. `scripts/render-pele.mjs`: Synchronous Mermaid-to-SVG renderer resolving local or global `pele` across 32 diagram types.
2. `scripts/render-plot.mjs`: Server-side `@observablehq/plot` + `linkedom` runner (`createPlotRunner()` API and CLI) emitting pure `<svg>`.
3. [references/01-structural-pele.md](references/01-structural-pele.md): Structural & relational diagram rules, 32 header declarations (including 4 mandatory `-beta` headers and 6 `pele` extensions), `--pele-bg` contrast rule, and default-expanded Mermaid source box.
4. [references/02-scientific-stats-plot.md](references/02-scientific-stats-plot.md): Quantitative axis/unit/CI rules, Okabe-Ito categorical palette, sequential/diverging scientific colormaps, and `Observable Plot` recipes.
5. [references/03-spatial-3d-pyvista.md](references/03-spatial-3d-pyvista.md): Zero-dependency rotatable `<canvas>` 3D surface skeleton and off-screen transparent `PyVista` mesh, streamline, and volume rendering templates.
6. [references/04-interactive-matrix-ui.md](references/04-interactive-matrix-ui.md): Tabular-numeral comparison matrices, normalized in-cell sparkbars, 90/10 color budget, and live slider formula explorers.

---

## Workflow & Category Routing

Classify the visual task into one of the four categories below, read its reference guide, and generate the artifact.

### 1. Structural & Relational Diagrams

1. **Trigger**: Standard Mermaid diagrams (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`, `gitGraph`, `gantt`, `sankey-beta`, `kanban`, `ishikawa`, `timeline`, `mindmap`, `architecture-beta`, `packet-beta`) and `pele` extension diagrams (`railroad-ebnf-beta`, `swimlane-beta`, `agentflow-beta`, `eventmodeling`, `cynefin-beta`, `usecase-beta`).
2. **Engine**: Run `node "<SKILL_DIR>/scripts/render-pele.mjs"` to pre-render deterministic `<svg>`.
3. **Reference**: Read [references/01-structural-pele.md](references/01-structural-pele.md) before rendering.
4. **Core constraints**: Keep node count `<= 18` per diagram, bind `--pele-bg` to a solid background variable (`var(--background)`), and include a default-expanded `<details open>` panel showing the raw Mermaid source directly below the SVG. (Exception: when editing plain `.md` files inside a code repository such as `README.md`, write standard fenced ```` ```mermaid ```` blocks directly and omit `pele`-exclusive headers.)

### 2. 2D Scientific & Statistical Plots

1. **Trigger**: Experimental metrics with error bars or 95% confidence bands, linear/nonlinear calibration, residual diagnostics, ridgeline kernel density estimates (KDE), box/quantile plots, 2D scalar contours, 2D vector arrow fields, and Voronoi/Delaunay/Hexbin spatial tessellations.
2. **Engine**: Import `createPlotRunner` from `<SKILL_DIR>/scripts/render-plot.mjs` (or run it via CLI) to generate `<svg>` through `@observablehq/plot` and `linkedom`.
3. **Reference**: Read [references/02-scientific-stats-plot.md](references/02-scientific-stats-plot.md) before plotting.
4. **Core constraints**: Label every axis with physical quantities and units, report sample size $n$ and interval definitions, draw explicit baseline/reference rules, and select palettes strictly by scale type (Okabe-Ito for categorical, `YlGnBu`/`Viridis`/`Cividis` for sequential, zero-pivoted `RdBu` for diverging).

### 3. 3D Spatial Surfaces, Meshes & Volumes

1. **Trigger**: Analytic bivariate surfaces $z = f(x, y)$, 3D phase-space trajectories, 3D scalar isosurfaces and orthogonal slices, 3D streamtubes, finite-element modal deformation meshes, and ray-cast volumetric fields.
2. **Engine**: Use zero-dependency `<canvas>` projection for lightweight rotatable surfaces (`<= 2500` vertices); run `uv run --with pyvista --with numpy` with `off_screen=True` and `transparent_background=True` for 3D meshes, streamlines, and volumes.
3. **Reference**: Read [references/03-spatial-3d-pyvista.md](references/03-spatial-3d-pyvista.md) before building.
4. **Core constraints**: Never extrude two-variable bar or line charts into fake 3D perspective; keep VTK internal text in ASCII + SI units (or render localized legends in HTML) to avoid missing CJK glyphs.

### 4. Interactive Comparison Matrices & Parameter Explorers

1. **Trigger**: Multi-system benchmark tables (`>= 3` quantitative columns), ablation matrices, and interactive analytical calculators driven by range sliders (such as Roofline bounds, KV-cache sizing, or Amdahl speedup).
2. **Engine**: Plain HTML tables, semantic CSS tokens, and compact inline JavaScript (`input` event listeners).
3. **Reference**: Read [references/04-interactive-matrix-ui.md](references/04-interactive-matrix-ui.md) before building.
4. **Core constraints**: Right-align all numeric columns with `font-mono tabular-nums`, include units in every column header, and enforce the 90% neutral / 10% semantic accent color budget.

---

## Delivery & Dual-Theme Adaptation

Choose the HTML wrapper according to the runtime environment.

### 1. Standalone HTML & SVG Files (CLI Agents & Local Browsers)

1. Emit zero-network-request self-contained `.html` or `.svg` files. Never load external scripts from CDNs unless the user explicitly asks for an online bundle.
2. Define semantic light tokens on `:root` and dark overrides inside `@media (prefers-color-scheme: dark)` so both `.pele` diagrams and `Observable Plot` SVGs switch themes automatically:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --background: #ffffff;
      --foreground: #0f172a;
      --muted-foreground: #64748b;
      --card: #f8fafc;
      --content: #f1f5f9;
      --card-border: #cbd5e1;
      --code-foreground: #0f172a;
      --primary: #2563eb;
      --success: #16a34a;
      --error: #dc2626;
      --chart-1: #0072b2;
      --chart-2: #e69f00;
      --chart-3: #009e73;
      --chart-4: #cc79a7;
      --chart-5: #56b4e9;
      --chart-6: #d55e00;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --background: #0f172a;
        --foreground: #f8fafc;
        --muted-foreground: #94a3b8;
        --card: #1e293b;
        --content: #0b1220;
        --card-border: #334155;
        --code-foreground: #e2e8f0;
        --primary: #60a5fa;
        --success: #4ade80;
        --error: #f87171;
        --chart-1: #56b4e9;
        --chart-2: #f59e0b;
        --chart-3: #34d399;
        --chart-4: #f472b6;
        --chart-5: #38bdf8;
        --chart-6: #fb7185;
      }
    }
    body {
      margin: 0;
      padding: 16px;
      background: var(--background);
      color: var(--foreground);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .pele {
      --pele-bg: var(--background);
      --pele-fg: var(--foreground);
      --pele-muted: var(--muted-foreground);
      --pele-line: var(--foreground);
      --pele-surface: var(--card);
      --pele-surface-alt: var(--content);
      --pele-border: var(--card-border);
      --pele-accent: var(--primary);
      --pele-critical: var(--error);
      --pele-series-1: var(--chart-1);
      --pele-series-2: var(--chart-2);
      --pele-series-3: var(--chart-3);
      --pele-series-4: var(--chart-4);
      --pele-series-5: var(--chart-5);
      --pele-series-6: var(--chart-6);
    }
    svg[class^="plot-"] {
      --plot-background: var(--background);
      overflow: visible;
      font-variant-numeric: tabular-nums;
    }
  </style>
</head>
<body>
  <!-- Inline SVG figure and caption or source panel -->
</body>
</html>
```

### 2. Host UI Container Delivery (When `generative_ui` Is Available)

1. Read and follow the host's built-in `generative_ui` skill for container mechanics (`ArtifactMetadata`, embed tags, allowlisted Tailwind script, and `<= 450px` inline height cap versus standalone side-pane artifacts).
2. Pre-render all `pele` and `Observable Plot` SVGs via `<SKILL_DIR>/scripts/` before writing the HTML file because host CSP blocks external charting CDNs.
3. Inherit host CSS variables (`--background`, `--foreground`, `--card`, `--card-border`, `--primary`, `--error`, `--chart-1` through `--chart-6`) directly without declaring local `:root` color overrides or `100vh` heights.

### 3. Runtime Prerequisites

1. **Node.js 20+ (Categories 1 & 2)**: Install globally once with `npm install -g pele @observablehq/plot linkedom`.
2. **Python + `uv` (Category 3B)**: Verify on-demand VTK support with `uv run --with pyvista --with numpy python -c "import pyvista as pv; print(pv.__version__)"`.

---

## Quick Checks

Before delivering any figure:

1. Did you read the matching `references/0X-*.md` file for this category?
2. For `pele` diagrams, is `--pele-bg` bound to a solid surface variable (`var(--background)`) rather than `transparent`, and is `<details open>` showing the escaped Mermaid source beneath the SVG?
3. For `Observable Plot` charts, do both axes include physical units, and are sample size $n$, uncertainty bands/bars, and reference baselines visible?
4. Are all Markdown/HTML numeric columns right-aligned with `tabular-nums`?
5. Unless instructed otherwise, are all captions, titles, axis/node labels, and headers written in the user's prompt language?
6. Does the final artifact avoid unallowlisted external CDN scripts and stay within `<= 450px` when embedded inline?
