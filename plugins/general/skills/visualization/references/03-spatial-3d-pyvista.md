# 3D Spatial Surfaces, Meshes & Volumes (Canvas 3D & PyVista)

Reference guide for rendering true three-dimensional geometry, scalar/vector fields, finite-element meshes, and volumetric grids. Never add fake 3D perspective extrusions to two-variable bar or line charts; perspective foreshortening distorts bar heights and obscures baselines.

## Contents

1. [Sub-Mode Routing](#sub-mode-routing)
2. [Sub-Mode 3A: Zero-Dependency Interactive Canvas 3D](#sub-mode-3a-zero-dependency-interactive-canvas-3d)
3. [Sub-Mode 3B: Off-Screen Scientific Rendering with PyVista](#sub-mode-3b-off-screen-scientific-rendering-with-pyvista)

---

## Sub-Mode Routing

### 1. Sub-Mode 3A: Lightweight Interactive Canvas 3D (`<= 2500` Vertices)

1. **Target data**: Analytic surfaces $z = f(x, y)$, 3D parametric trajectories (such as Lorenz attractors or optimization paths), and compact regular grids with `<= 2500` vertices.
2. **Engine & delivery**: Native HTML `<canvas>` perspective projection with painter's-algorithm depth sorting and pointer drag rotation (`<= 420px` total height, zero external scripts).

### 2. Sub-Mode 3B: Off-Screen VTK Mesh & Volume Rendering (`PyVista`)

1. **Target data**: 3D scalar isosurfaces and orthogonal slices, 3D vector streamtubes, unstructured finite-element modal deformation meshes, clipped CAD/CAE solids, and ray-cast volume rendering.
2. **Engine & delivery**: `uv run --with pyvista --with numpy` executing off-screen VTK rendering to a high-DPI transparent-background `.png` (or standalone local HTML via `export_html`).

---

## Sub-Mode 3A: Zero-Dependency Interactive Canvas 3D

### 1. Implementation Rules

1. **HiDPI scaling**: Multiply `canvas.width` and `canvas.height` by `window.devicePixelRatio` and scale the 2D drawing context accordingly so wireframe edges stay sharp on Retina displays.
2. **Live theme synchronization**: Read text and grid stroke colors from `getComputedStyle(document.documentElement)` inside `draw()`, and attach listeners to both `window.addEventListener('themechange', draw)` and `window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw)` so theme switches preserve the current rotation angles.
3. **Luminance-ordered surface shading**: Interpolate quad face fills along normalized height $t \in [0, 1]$ across a perceptually ordered ramp (deep blue `#1d4ed8` -> teal `#0d9488` -> amber `#f59e0b`) with translucent mesh strokes to preserve curvature cues.
4. **Angle readout**: Display a compact status hint in the header bar (`Drag to rotate | Pitch 28 deg, Yaw -37 deg`).
5. **Caption & readout language**: Unless the user instructs otherwise, write outer figure titles, captions, and interactive readout labels in the language used by the user.

### 2. Minimal Projection & Drag Skeleton

```js
let yaw = -0.65, pitch = 0.48, dragging = false, lx = 0, ly = 0;

function project(x, y, z, w, h, scale) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = x * cy - y * sy;
  const y1 = x * sy + y * cy;
  const z2 = y1 * cp - z * sp;
  const y2 = y1 * sp + z * cp;
  const fov = 4.2 / (4.2 + z2 * 0.35);
  return { sx: w / 2 + x1 * scale * fov, sy: h / 2 - y2 * scale * fov, depth: z2 };
}

canvas.addEventListener('pointerdown', (e) => {
  dragging = true; lx = e.clientX; ly = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw += (e.clientX - lx) * 0.01;
  pitch = Math.max(-1.35, Math.min(1.35, pitch + (e.clientY - ly) * 0.01));
  lx = e.clientX; ly = e.clientY;
  draw();
});
canvas.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('themechange', draw);
```

---

## Sub-Mode 3B: Off-Screen Scientific Rendering with PyVista

### 1. Execution Command

Run `pyvista` in an ephemeral `uv` environment without mutating system Python packages:

```bash
uv run --with pyvista --with numpy python render_3d.py
```

### 2. Off-Screen Transparency & Font Hygiene

1. **Mandatory off-screen transparent capture**: Set `pv.OFF_SCREEN = True`, initialize `pv.Plotter(off_screen=True, window_size=[1200, 900])`, and pass `transparent_background=True` to `pl.screenshot(...)` so the rendered 3D geometry composites cleanly onto both light and dark surfaces without a white bounding rectangle.
2. **Caption language & VTK glyph precaution**: Unless the user instructs otherwise, write all outer figure captions, titles, and HTML/Markdown colorbars in the language used by the user. Because VTK's built-in freetype font lacks CJK glyphs and renders non-ASCII characters as empty boxes, when the user's language uses non-ASCII characters either set `show_scalar_bar=False` in VTK and render the localized colorbar and caption in the surrounding HTML/Markdown wrapper, or keep internal VTK scalar-bar titles in concise ASCII + SI symbols while placing the full localized caption outside the PNG.
3. **Streamline integration length**: Pass `max_length` to `streamlines_from_source(...)`. Do not pass `max_time`, which raises a `DeprecationError` in `PyVista >= 0.45`.

### 3. 3D Colormaps & Lighting Rules

1. **Non-negative scalar magnitudes (speed, von Mises stress, density)**: Use `cmap='viridis'`, `cmap='plasma'`, or `cmap='cividis'` with `lighting=True, smooth_shading=True, specular=0.3` so surface normal shading remains distinct from colormap hue.
2. **Signed symmetric fields (modal displacement, pressure delta, charge density)**: Use `cmap='coolwarm'` with explicit symmetric limits `clim=[-max_abs, max_abs]`.
3. **Volumetric ray-casting**: Call `pl.add_volume(grid, scalars='density', cmap='magma', opacity='sigmoid_5')` (or pass an explicit piecewise opacity array such as `[0.0, 0.02, 0.15, 0.55, 0.9]`) so low-amplitude background voxels stay transparent and interior high-density cores remain visible.
4. **Standalone WebGL export boundary**: `pl.export_html('scene.html')` loads external scripts from `unpkg.com`. Reserve `export_html` strictly for standalone local browser files; never embed `export_html` output inside CSP-restricted containers.

### 4. Reference Off-Screen Isosurface Script

```python
import numpy as np
import pyvista as pv

pv.OFF_SCREEN = True

x, y, z = np.meshgrid(
    np.linspace(-2.5, 2.5, 60),
    np.linspace(-2.5, 2.5, 60),
    np.linspace(-2.5, 2.5, 60),
    indexing="ij",
)
grid = pv.StructuredGrid(x, y, z)
r = np.sqrt(x**2 + y**2 + z**2) + 1e-9
field = (3.0 * (z / r) ** 2 - 1.0) * np.exp(-0.9 * r)
grid["potential"] = field.ravel(order="F")

contours = grid.contour(isosurfaces=[-0.25, 0.25, 0.55], scalars="potential")

pl = pv.Plotter(off_screen=True, window_size=[1200, 900])
pl.add_mesh(grid.outline(), color="#64748b", line_width=1.5)
pl.add_mesh(
    contours,
    cmap="coolwarm",
    clim=[-0.6, 0.6],
    smooth_shading=True,
    specular=0.35,
    opacity=0.88,
    show_scalar_bar=True,
    scalar_bar_args={"title": "Potential Field (V)", "color": "#64748b"},
)
pl.camera.azimuth = 35
pl.camera.elevation = 24
pl.screenshot("isosurface.png", transparent_background=True)
pl.close()
```
