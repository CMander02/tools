# Structural & Relational Diagrams (Pele Engine)

Reference guide for rendering structural, topological, sequence, and workflow diagrams to deterministic SVG with `pele`. Read only the sections required for your diagram type. `scripts/render-pele.mjs` wraps local or global `pele` resolution.

## Contents

1. [Scope & Repository Markdown Exception](#scope--repository-markdown-exception)
2. [CLI Usage](#cli-usage)
3. [Topology Budget & Label Typography](#topology-budget--label-typography)
4. [Supported Diagram Headers (32 Types)](#supported-diagram-headers-32-types)
5. [Palette & Dark/Light Theme Rules](#palette--darklight-theme-rules)
6. [Default-Expanded Mermaid Source Panel](#default-expanded-mermaid-source-panel)

---

## Scope & Repository Markdown Exception

1. Use this guide whenever a task presents structural or relational diagrams in chat responses, HTML reports, or standalone SVG files, covering both standard Mermaid diagrams and `pele` extension diagrams.
2. Exception for repository `.md` files: when the user asks to edit a plain Markdown document inside a code repository (such as `README.md` or `docs/*.md`), write standard fenced ```` ```mermaid ```` blocks directly into the `.md` file because GitHub and static documentation renderers cannot mount inline HTML widgets or parse the 6 `pele`-exclusive headers.

---

## CLI Usage

`<SKILL_DIR>` denotes the directory containing `SKILL.md`. Run `scripts/render-pele.mjs` to emit a zero-dependency `<svg>` string synchronously:

```bash
# Render from an inline string
node "<SKILL_DIR>/scripts/render-pele.mjs" --code "flowchart LR; A[Input] --> B[Output]"

# Render from a .mmd file to an .svg file
node "<SKILL_DIR>/scripts/render-pele.mjs" diagram.mmd --out diagram.svg

# Render multi-line Mermaid source from stdin
node "<SKILL_DIR>/scripts/render-pele.mjs" <<'EOF'
flowchart LR
  A["Data Sampling"] --> B["Feature Transform"] --> C["Metric Evaluation"]
EOF
```

---

## Topology Budget & Label Typography

1. **Node cap**: Keep each diagram at `<= 18` nodes. Split larger architectures into one top-level system overview and one or more focused subsystem diagrams.
2. **Label wrapping**: Keep each line inside a node label at `<= 28` Latin characters or `<= 16` CJK characters; insert `<br/>` for explicit line breaks. Wrap any label containing parentheses `()`, brackets `[]`, slashes `/`, or colons `:` in double quotes, such as `N1["Stage 1 (Warmup)"]`.
3. **Flow direction**: Use `flowchart LR` for linear pipelines with `<= 5` stages. Switch to `flowchart TB` when stages exceed `5` or branch fan-out is wide, preventing horizontal shrink that pushes rendered text below `12px`.
4. **Caption & label language**: Unless the user instructs otherwise, write figure titles, captions, node/edge display labels, and the `<details open>` summary label in the language used by the user.

---

## Supported Diagram Headers (32 Types)

### 1. Standard Mermaid Headers Supported Directly (22 Types)

1. **Flow & State**: `flowchart` (or `graph`), `stateDiagram-v2` (or `stateDiagram`), `block-beta`.
2. **Interaction & Sequence**: `sequenceDiagram`, `journey`.
3. **Architecture & Schema**: `classDiagram`, `erDiagram`, `architecture-beta`, `c4Context` (`c4Container`, `c4Component`, `c4Dynamic`, `c4Deployment`), `requirementDiagram`, `packet-beta`.
4. **Schedule & Git**: `gantt`, `timeline`, `kanban`, `gitGraph`.
5. **Hierarchy & Cause-Effect**: `mindmap`, `ishikawa`, `treemap-beta`.
6. **Quantitative & Set**: `sankey-beta`, `xychart-beta`, `quadrantChart`, `pie`.

### 2. Headers Requiring a Mandatory `-beta` Suffix in Pele (4 Types)

Omitting `-beta` on any of the following 4 types causes a parser error in `pele`:

1. **`radar-beta` (Radar Chart)**: Axis identifiers must be pure ASCII letters or digits; place non-ASCII or spaced display labels inside quoted brackets, for example `axis tput["Throughput"], lat["Low Latency"], mem["Memory Efficiency"]`. Raw non-ASCII identifiers trigger a lexical error.
2. **`treeView-beta` (Directory Tree)**: Expresses parent-child file and directory hierarchies via indentation.
3. **`venn-beta` (Venn Diagram)**: Declares sets and intersections with `set A["Set A"]` and `union A, B["Overlap"]`.
4. **`wardley-beta` (Wardley Map)**: Positions value-chain components along visibility and evolution axes.

### 3. Pele-Exclusive Extension Headers (6 Types)

Standard GitHub Mermaid does not parse these 6 headers. Whenever you use one, label the source box summary `Mermaid Source (Pele Extension Syntax)`:

1. **`railroad-beta` (`railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta`)**: Syntax railroad diagrams for compiler grammars, wire formats, and DSL production rules.
2. **`swimlane-beta`**: Cross-functional swimlane diagrams across services, roles, or hardware units.
3. **`agentflow-beta`**: Multi-agent orchestration graphs with tool calls and human review checkpoints.
4. **`eventmodeling`**: Event Modeling slices connecting Commands, Domain Events, and Read-Model Views across time.
5. **`cynefin-beta`**: Four-domain Cynefin sense-making frameworks.
6. **`usecase-beta`**: Actor and system-boundary UML use-case diagrams.

---

## Palette & Dark/Light Theme Rules

1. **Restrained surface fills**: Omit hardcoded saturated fills (`fill:#ff0000`, `fill:#00ff00`) inside Mermaid source. Let standard nodes inherit surface and border tokens, reserving `--pele-critical` strictly for blocked states, critical paths, or failure branches.
2. **Solid `--pele-bg` binding (critical rule)**: `pele` omits an outer background rectangle on `<svg>` (keeping the canvas naturally transparent), yet internally uses `--pele-bg` (`--_bg`) as the high-contrast foreground fill for `gitGraph` branch badge text, `timeline` period headers, hollow merge-commit centers, and edge-label masks. Bind `--pele-bg` to a solid surface variable (`var(--background)` in host containers, `#ffffff` in light standalone HTML, `#0f172a` in dark standalone HTML). Never set `--pele-bg: transparent`.
3. **Complete CSS token mapping**: Include the `.pele` variable bridge in every HTML wrapper:

```css
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
```

---

## Default-Expanded Mermaid Source Panel

Place a default-expanded `<details open>` panel directly beneath every rendered `pele` `<svg>` containing the raw Mermaid source (with `<`, `>`, and `&` escaped as `&lt;`, `&gt;`, and `&amp;`) so the reader can inspect or copy the exact definition:

```html
<details open class="mt-2 border-t border-[var(--card-border)] pt-2 text-xs">
  <summary class="cursor-pointer select-none text-[var(--muted-foreground)] font-medium">
    Mermaid Source
  </summary>
  <pre class="mt-1.5 p-2.5 rounded bg-[var(--card)] border border-[var(--card-border)] text-[var(--code-foreground)] font-mono text-[11px] leading-relaxed overflow-x-auto"><code>flowchart LR
  A["Input"] --&gt; B["Transform"]</code></pre>
</details>
```

When an inline widget combines a header bar, `<svg>`, and expanded `<details open>` block, cap `<svg>` height (`style="max-height:260px;width:auto"`) if the diagram remains legible so the total height stays `<= 450px`; if a tall hierarchy requires more vertical room, deliver the HTML file as a standalone side-pane artifact.
