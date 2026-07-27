# Annotated photo viewer

Climbing routes in AddOn are defined on a **photo of the wall**, with circular markers for start holds, intermediates, and the finish hold. This code sample section shows how those markers are drawn accurately on top of the image across screen sizes, aspect ratios, and zoom levels.

## How it works

1. **Normalized storage** — Hold positions are stored as fractions of image width and height (`x`, `y`, `r` in 0–1 space on `HoldMarker`). That keeps annotations resolution-independent

2. **Letterbox-aware layout** — Route photos use `resizeMode="contain"`, so the image may not fill the container. `useImageBounds` measures the container and `coordinates.ts` computes where the image actually renders (letterboxing or pillarboxing). The marker SVG layer is positioned to match that rectangle exactly—not the full container.

3. **Circles that stay circular** — Markers are drawn in an SVG overlay whose viewBox matches the image aspect ratio (`0 0 1 ${1/aspect}`), with a `yScale` correction so normalized coordinates map to true circles rather than ellipses when the photo is not square.

4. **Read-only display with optional zoom/pan** — `AnnotatedPhotoView.tsx` composes the image, overlay, and gestures. Pinch and pan use Reanimated shared values; `photoPanLimits.ts` clamps translation so zoomed views cannot pan into empty margin beyond the photo edges.

5. **Marker semantics** — Hold type (`start`, `intermediate`, `finish`) determines color via `visualMaps.ts`. Start holds get a white halo for visibility on busy wall photos. `showOnlyStartHolds` supports compact carousel thumbnails.

6. **Cache-ready URIs** — The optional `uri` prop accepts a resolved display path (e.g. a local `file://` from the photo cache sample). Callers that omit it fall back to `cloudUri` / `localUri` on the photo object.

## Editor vs viewer

This folder includes both **view** and **edit** building blocks:

- **`AnnotatedPhotoView.tsx`** — Read-only display (feed cards, route detail, previews).
- **`NormalizedHoldMarkerLayer.tsx`** + **`useNormalizedMarkerGestures.ts`** — Interactive marker drag, resize, and tap handling for the route editor.

Gesture precedence and canvas zoom/pan coordination for editing live in the [`svg-gestures/`](../svg-gestures/) sample.

## Data in production

In the full app, an `AnnotatedRoutePhoto` travels with the route document: pixel dimensions, an array of `holdMarkers`, and URIs that start local during capture and gain a `cloudUri` after upload to Firebase Storage. The viewer does not care whether the image is local or remote—it only needs dimensions, markers, and a URI to render.

## Key files

| File | Role |
|------|------|
| `src/shared/components/AnnotatedPhotoView/AnnotatedPhotoView.tsx` | Main read-only photo + marker component |
| `src/shared/components/AnnotatedPhotoView/hooks/useImageBounds.ts` | Container measurement and image bounds |
| `src/shared/components/AnnotatedPhotoView/utils/coordinates.ts` | Letterbox math, normalized ↔ container conversion |
| `src/shared/components/AnnotatedPhotoView/utils/coordinates.test.ts` | Unit tests for coordinate utilities |
| `src/shared/components/AnnotatedPhotoView/components/NormalizedHoldMarkerLayer.tsx` | Editable marker overlay for the route editor |
| `src/shared/components/AnnotatedPhotoView/hooks/useNormalizedMarkerGestures.ts` | Marker drag/resize gestures |
| `src/shared/utils/photoPanLimits.ts` | Zoom pan clamping (Reanimated worklets) |
| `src/shared/utils/visualMaps.ts` | Hold-type → color mapping |
| `src/shared/types/holds.ts` | `HoldMarker`, `AnnotatedRoutePhoto`, and related types |
