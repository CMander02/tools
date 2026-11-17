# Interactive Comparison Matrices & Parameter Explorers

Reference guide for building aligned multi-metric benchmark tables, ablation matrices, and interactive analytical formula explorers with plain HTML, CSS, and lightweight inline JavaScript.

## Contents

1. [Typography & Alignment Rules](#typography--alignment-rules)
2. [90/10 Color Restraint Budget](#9010-color-restraint-budget)
3. [Interactive Formula Explorer Rules](#interactive-formula-explorer-rules)
4. [Reference Aligned Matrix Template](#reference-aligned-matrix-template)

---

## Typography & Alignment Rules

1. **Directional column alignment**: Left-align text, model, and configuration columns (`text-left`). Right-align every numeric, percentage, latency, memory, and delta column (`text-right`) paired with `font-mono tabular-nums` so decimal points and digit places line up vertically.
2. **Explicit units in column headers**: Include measurement units or evaluation protocols in every numeric header (`Throughput (tok/s)`, `P99 Latency (ms)`, `Peak VRAM (GB)`, `Pass@1 (%)`).
3. **Normalized in-cell sparkbars**: When visual magnitude comparison helps scan a column, place a `4px` to `6px` horizontal bar scaled linearly to the column maximum underneath or beside the number instead of duplicating the table as a separate bar chart.
4. **Missing values and explicit deltas**: Mark unmeasured cells with `-` and explain why in a footnote. Prefix relative changes with explicit `+` or `-` signs (`+0.045`, `-12.4%`).
5. **Caption & header language**: Unless the user instructs otherwise, write matrix titles, captions, column headers, control labels, and footnotes in the language used by the user (preserving standard unit symbols in parentheses).

---

## 90/10 Color Restraint Budget

Dense numeric matrices lose legibility when rows or cells carry competing background fills:

1. **90% neutral structural tokens**: Render surfaces, text, dividers, and secondary captions exclusively with neutral theme variables (`--foreground`, `--muted-foreground`, `--card`, `--card-border`).
2. **10% semantic accent**:
   1. Use one primary accent (`var(--primary)`) for active range sliders and primary in-cell sparkbars.
   2. Reserve `var(--success)` and `var(--error)` strictly for verified threshold pass/fail states or statistically verified regressions.
   3. Highlight column winners with `font-semibold` and subtle text/bar contrast rather than full-row saturated fills.

---

## Interactive Formula Explorer Rules

1. **Compact top control strip**: Group `<input type="range">` sliders or segmented toggles into a single header row (`border-b border-[var(--card-border)] pb-2`) with live `font-mono tabular-nums` parameter readouts beside each control.
2. **Immediate recalculation**: Bind listeners to the `input` event so derived metrics and SVG curves update continuously while dragging.
3. **Height discipline**: Keep inline explorers and compact tables `<= 450px` tall with a flush transparent `<body>` (`bg-transparent p-0 m-0`). Move wide multi-tab dashboards or tables exceeding `10` rows into a standalone full-page artifact with a solid `bg-[var(--background)]` surface.

---

## Reference Aligned Matrix Template

```html
<div class="py-1.5 space-y-2 text-xs">
  <div class="flex items-baseline justify-between border-b border-[var(--card-border)] pb-1.5">
    <span class="font-medium text-sm">Inference Batch Throughput &amp; Memory (2048 in / 512 out tokens)</span>
    <span class="text-[var(--muted-foreground)] font-mono tabular-nums">A100-80GB · FP16 · n=50</span>
  </div>
  <table class="w-full border-collapse">
    <thead>
      <tr class="border-b border-[var(--card-border)] text-[var(--muted-foreground)]">
        <th class="py-1.5 pr-3 text-left font-medium">Configuration</th>
        <th class="py-1.5 px-3 text-right font-medium">Throughput (tok/s)</th>
        <th class="py-1.5 px-3 text-right font-medium">P99 Latency (ms)</th>
        <th class="py-1.5 pl-3 text-right font-medium">Peak VRAM (GB)</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-[var(--card-border)]">
      <tr>
        <td class="py-2 pr-3 text-left">Baseline (vLLM Default)</td>
        <td class="py-2 px-3 text-right font-mono tabular-nums">3,420</td>
        <td class="py-2 px-3 text-right font-mono tabular-nums">148.2</td>
        <td class="py-2 pl-3 text-right font-mono tabular-nums">64.5</td>
      </tr>
      <tr>
        <td class="py-2 pr-3 text-left font-semibold">Chunked Prefill + FP8 KV</td>
        <td class="py-2 px-3 text-right font-mono tabular-nums font-semibold text-[var(--primary)]">5,180</td>
        <td class="py-2 px-3 text-right font-mono tabular-nums">112.6</td>
        <td class="py-2 pl-3 text-right font-mono tabular-nums">41.8</td>
      </tr>
    </tbody>
  </table>
</div>
```
