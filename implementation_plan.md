# Fix Advanced Split Rendering & Unit Divider Color

## Problem Summary

Two issues in the 3D viewer (`index.html` / [viewer.js](file:///c:/Files/Src/building-sunlight-simulator/js/viewer.js)):

1. **Advanced split not rendered**: The viewer ignores `cutLines`/`unitCenters` and only reads `unitRatiosPerFloor`, which is not filled for advanced split mode.

2. **Unit divider lines indistinguishable from building outline**: Both are near-black.

> [!IMPORTANT]
> `unitRatiosPerFloor` has no meaning for advanced (free-line) split because units are non-linear 2D polygons. The correct approach is to determine which **wall face** belongs to which unit using a 2D region query — not a 1D axis projection.

---

## Proposed Changes

### Component 1 — Viewer: 2D region-based unit assignment for advanced split

#### [MODIFY] [viewer.js](file:///c:/Files/Src/building-sunlight-simulator/js/viewer.js)

**Add `computeAdvancedUnitRegions(building)` function:**
- Takes `building.shape`, `building.cutLines`, `building.unitCenters`
- Rasterizes the footprint polygon onto a small off-screen canvas (e.g. 256×256)
- Draws the `cutLines` as black strokes on the canvas (same approach as [buildFloodOverlay](file:///c:/Files/Src/building-sunlight-simulator/js/editor.js#1369-1496) in editor.js)
- Flood-fills connected regions, assigns each region an ID
- For each `unitCenter`, finds which region ID it falls in → maps region ID → unit index
- If no `unitCenters` are set, rank regions by their centroid X coordinate
- Returns a function `getUnitAtPoint(x, y) → unitIndex` for any 2D floor plan coordinate

**Modify [calculateSamplingPoints(building, buildingIndex)](file:///c:/Files/Src/building-sunlight-simulator/js/viewer.js#381-513)** (currently line 388):
- When `building.advancedSplit && building.cutLines?.length > 0`:
  - Call `computeAdvancedUnitRegions(building)` to get the lookup function
  - For each wall segment midpoint, call `getUnitAtPoint(midX, midY)` to get its unit index
  - Replace the current axis-projection logic for this building

**Modify [createFacadeTexture(floors, unitsPerFloor, unitRatiosPerFloor, advancedMeta)](file:///c:/Files/Src/building-sunlight-simulator/js/viewer.js#180-232):**
- Add an optional `advancedMeta` parameter: `{ cutLines, shape }`
- When `advancedMeta` is set, instead of drawing ratio-based vertical bars, project each cut line segment's endpoints onto the facade's U-axis and draw white vertical dividers at those projected positions
- Floor-level lines stay unchanged (those are always drawn)

**Modify [loadBuildings(data)](file:///c:/Files/Src/building-sunlight-simulator/js/viewer.js#958-1045)** (currently line 958):
- When `b.advancedSplit && b.cutLines`, pass `advancedMeta = { cutLines: b.cutLines, shape: b.shape }` to [createFacadeTexture](file:///c:/Files/Src/building-sunlight-simulator/js/viewer.js#180-232)

---

### Component 2 — Viewer: distinct color for unit dividers on facade

#### [MODIFY] [viewer.js](file:///c:/Files/Src/building-sunlight-simulator/js/viewer.js)

In [createFacadeTexture()](file:///c:/Files/Src/building-sunlight-simulator/js/viewer.js#180-232), change unit divider colors from near-black to bright white:

```js
// Before (dark, blends with outline):
ctx.fillStyle = 'rgba(35,45,60,0.6)';
ctx.fillStyle = 'rgba(255,255,255,0.22)';

// After (bright white, visually distinct):
ctx.fillStyle = 'rgba(255,255,255,0.95)';
ctx.fillStyle = 'rgba(180,210,255,0.3)';
```

This applies to both basic and advanced split dividers.

---

## Verification Plan

### Manual Verification
1. In [editor.html](file:///c:/Files/Src/building-sunlight-simulator/editor.html): draw a building, set N units, open split modal → "自由划线" → draw cut lines → assign unit centers → Save → Export JSON
2. In `index.html`: load the JSON
3. **Facade**: unit dividers should be visible as bright white lines, distinct from dark building outline
4. **Sunlight calc**: run analysis → results should show per-unit hours correctly segmented by the free-line cuts, not by axis projection
