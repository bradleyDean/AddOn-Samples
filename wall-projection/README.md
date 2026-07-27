# Wall projection

When a climber places a route on the gym map, they tap near a wall—not necessarily on the line itself. This sample shows how those taps are converted into a stable, storable location on a wall segment.

## How it works

1. **Parse wall geometry** — Each climbing wall is an SVG `<path>` (see `fixtures/map-template.svg`). The `Wall` class tokenizes path data (`M`, `L`, `H`, `V`, `Z`, etc.) into vertex pairs and treats each pair as a segment.

2. **Screen → SVG** — `coordinateConversion.ts` and `panLimits.ts` map touch coordinates into SVG viewBox space, accounting for letterboxing (`preserveAspectRatio="xMidYMid meet"`) and zoom/pan limits on the map view.

3. **Project the tap** — For each wall segment, `Wall.getClosestPoint()` finds the nearest point on the segment (horizontal, vertical, or skew cases). Segments outside a configurable hitbox are skipped early. The closest projection across all walls wins.

4. **Normalize along the path** — The hit is expressed as a fraction `t` (0–1) of total arc length along that wall’s polyline, not just the local segment. `useMapGestures.ts` combines segment index, local `t`, and cumulative path length into a single value suitable for storage and pin placement.

5. **Persist a location** — The result is a `MapLocation`: SVG coordinates, `wallCode`, floor, fractional `t`, and a compact, spatially sortable, `dist` string (e.g. `0a00.5000`) that identifies position on the wall. These are used to ensure the feed carousel sorts climbing routes from the climber's left to the climber's right (from their perspective in the room).

## Map data in production

This folder includes [`fixtures/map-template.svg`](fixtures/map-template.svg) as a **reference fixture**—the conventions for wall paths, frame rects, and viewBox that the parser expects.

In the full app, maps are **not bundled**. Each gym has one or more map documents in Firestore (`GYMS/{gymId}/MAPS/{mapId}`). A map document stores **per-floor SVG strings** (integer keys → SVG text), plus metadata such as `active`, `name`, and an optional **`version`** field. The client subscribes to the active map for the selected gym, so updates propagate **without an app store release**: revised wall layouts, new floors, or entirely new gyms and areas can be published server-side and picked up on the next snapshot.

Wall projection code is agnostic to where the SVG came from—it operates on parsed `WallData` regardless of whether the source was a local fixture or a remote document.

## Key files

| File | Role |
|------|------|
| `src/shared/utils/wall.ts` | Path parsing, segment projection, arc-length helpers |
| `src/shared/utils/wall.test.ts` | Unit tests for projection edge cases |
| `src/shared/utils/coordinateConversion.ts` | Screen ↔ SVG conversion (JS thread) |
| `src/shared/utils/panLimits.ts` | Letterboxing and pan limits (Reanimated worklets) |
| `src/shared/hooks/gesture/useMapGestures.ts` | Tap handling, pin hits, wall selection, `MapLocation` assembly |
| `fixtures/map-template.svg` | Sample map authoring template |
