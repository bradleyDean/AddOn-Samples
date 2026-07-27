# SVG gestures

The route editor and gym map both overlay interactive SVG on top of zoomable views. React Native Gesture Handler does not understand individual SVG elements—you get touch events in view space and must wire the rest yourself. This sample shows how hold markers, canvas pan/zoom, and hit testing all play nice together. 

## How it works

1. **Two gesture layers** — `useHoldMarkerGestures` handles marker tap, drag, and pinch-to-resize. `useZoomableGestures` handles canvas pan and pinch zoom (with optional pan limits when map dimensions are supplied). Each hook returns composed `Gesture` objects for a `GestureDetector`.

2. **UI thread vs JS thread** — Gesture callbacks (`.onBegin`, `.onUpdate`, `.onEnd`) run as Reanimated **worklets** on the UI thread. React state updates and hit-test helpers that read marker arrays must run on the JS thread via **`runOnJS(stableCallback)`**—never inline closures inside worklets. Handlers are memoized with `useCallback` so native code sees stable function references.

3. **Manual hit testing** — `geometry.ts` provides worklet-safe circle tests (`isInsideCircle`, `tapIsInAnyMarker`, etc.) because RNGH cannot target individual `<Circle>` elements. Tap-to-select, tap-outside-to-deselect, and create-marker-on-empty-tap all use explicit distance checks in normalized or screen space.

4. **Gesture precedence** — When a hold is selected, dragging it must win over panning the canvas. The editor wires this with **`canvasPan.requireExternalGestureToFail(holdDrag)`** (and similar pairs for resize vs zoom). The integration test in `gesture-precedence.test.ts` exercises real hooks—not mocks of the gesture system—to verify drag-over-pan and resize-over-zoom behavior.

5. **Committing visual state** — During drag/resize, shared values drive live feedback on the UI thread. On gesture end, `coordinateGestureChangesToJsState()` merges active offsets into final positions and calls `runOnJS` once to update React state. Without this coordination step, markers snap back when the finger lifts, and simultaneous drag + resize can overwrite each other.

6. **Marker state callbacks** — `markerCallbacks.ts` centralizes select, deselect, move, resize, and create operations on the `HoldMarker[]` array. The gesture hooks stay thin; business logic lives in testable JS callbacks.

7. **Scale dampening** — Pinch zoom applies `applyScaleDampeningWorklet()` so zoom feels controlled rather than 1:1 with finger spread—important on dense annotation UIs.

## Map pan limits (related sample)

Gym map pan/zoom reuses the same zoomable gesture pattern but clamps translation using **letterboxed content bounds** and optional **frame rectangles** parsed from the SVG. That math lives in the [`wall-projection/`](../wall-projection/) sample (`panLimits.ts`, `coordinateConversion.ts`). `useZoomableGestures` accepts optional `containerDims`, `svgViewBox`, and `frame` to enforce those limits during manual panning.

Photo-side pinch/pan (route photos rather than SVG maps) is covered in [`annotated-photo-viewer/`](../annotated-photo-viewer/).

## Where this runs in the app

- **Route editor** — Annotate a wall photo: place, drag, and resize hold markers while zooming/panning the image.
- **Gym map** — Pan and zoom the floor plan; tap projection onto walls is handled separately in `wall-projection/`.

Both surfaces share the same underlying constraints: Reanimated shared values for smooth transforms, explicit precedence rules, and JS-thread commits when gestures finish.

## Key files

| File | Role |
|------|------|
| `shared/hooks/gesture/useHoldMarkerGestures.ts` | Marker tap, drag, resize gestures |
| `shared/hooks/gesture/useZoomableGestures.ts` | Canvas pan and pinch zoom |
| `shared/utils/geometry.ts` | Circle hit tests and scale dampening (worklets) |
| `shared/config/holdMarkerLayerConfig.ts` | Marker gesture thresholds and defaults |
| `shared/config/zoomableViewConfig.ts` | Zoom/pan limits and sensitivity |
| `features/routeEditor/utils/gestureUtils.ts` | Worklet that commits gesture end state to React |
| `features/routeEditor/utils/markerCallbacks.ts` | JS-thread marker CRUD callbacks |
| `features/routeEditor/__tests__/integration/gesture-precedence.test.ts` | Integration tests for precedence rules |
| `features/routeEditor/utils/gestureUtils.test.ts` | Unit tests for coordinate/commit logic |
