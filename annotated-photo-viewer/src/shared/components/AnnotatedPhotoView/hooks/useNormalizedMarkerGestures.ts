/**
 * useNormalizedMarkerGestures Hook
 *
 * This hook wraps the existing gesture logic and performs coordinate conversion
 * between container pixel space and normalized (0-1) image space.
 *
 * It handles:
 * - Converting tap positions to normalized coordinates for marker creation
 * - Converting drag deltas to normalized deltas
 * - Providing normalized-space hit detection for marker selection
 *
 * All marker data (x, y, r) should be stored in normalized coordinates (0-1).
 */

import React from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { HoldMarker } from '../../../types/holds';
import type { ImageBounds } from '../types';

/**
 * Check if a tap in normalized space is inside a normalized circle.
 * Accounts for image aspect ratio since radius is normalized to width.
 */
function isInsideNormalizedCircle(
  tapX: number,
  tapY: number,
  circleX: number,
  circleY: number,
  circleR: number,
  imageAspect: number
): boolean {
  const dx = tapX - circleX;
  const dy = (tapY - circleY) * imageAspect; // Scale Y to match X units
  const distanceSquared = dx * dx + dy * dy;
  return distanceSquared <= circleR * circleR;
}

/**
 * Check if tap is in any marker (normalized coordinates).
 */
function tapIsInAnyMarkerNormalized(
  tapX: number,
  tapY: number,
  markers: HoldMarker[],
  imageAspect: number
): boolean {
  return markers.some(m => 
    isInsideNormalizedCircle(tapX, tapY, m.x, m.y, m.r, imageAspect)
  );
}

export interface NormalizedMarkerGesturesConfig {
  longPressDuration: number;
  holdDragSensitivity: number;
  holdResizeSensitivity: number;
  /** Maximum tap duration in ms to prevent accidental marker creation (default: 250) */
  tapMaxDuration?: number;
  /** Maximum distance finger can move during tap in pixels (default: 10) */
  tapMaxDistance?: number;
  /** Multiplier for drag hit area (default: 3 = can start drag within 3× marker radius) */
  dragRadiusMultiplier?: number;
}

export interface UseNormalizedMarkerGesturesParams {
  markers: HoldMarker[];
  imageBounds: ImageBounds | null;
  imageAspect: number; // width / height
  /** 
   * Current zoom scale (SharedValue). Used to compensate drag deltas for zoom level.
   * When zoomed in, finger movement should result in proportionally smaller normalized deltas.
   */
  scale?: { value: number };
  /** Called when a marker is tapped for selection. Receives normalized tap position. */
  onSelect: (normX: number, normY: number) => void;
  onDeselect: () => void;
  /** @deprecated No longer used - kept for backwards compatibility */
  onTapWhileSelected?: () => void;
  /** 
   * Called when a new marker should be created.
   * @param normX - Normalized X position (0-1)
   * @param normY - Normalized Y position (0-1)
   * @param markerId - Pre-generated marker ID to use (for synchronous selection tracking)
   */
  onCreateMarker: (normX: number, normY: number, markerId: string) => void;
  onMoveHold: (id: string, normX: number, normY: number) => void;
  onResizeHold: (id: string, normRadius: number) => void;
  config: NormalizedMarkerGesturesConfig;
  /** Default radius for new markers (normalized, 0-1). Used for selection tracking. */
  defaultMarkerRadius?: number;
}

/**
 * Apply scale dampening for pinch-to-resize
 */
function applyScaleDampening(rawScale: number, sensitivity: number): number {
  'worklet';
  return 1 + (rawScale - 1) * sensitivity;
}

export function useNormalizedMarkerGestures(params: UseNormalizedMarkerGesturesParams) {
  const {
    markers,
    imageBounds,
    imageAspect,
    scale: scaleShared,  // Current zoom scale for drag compensation
    onSelect,
    onDeselect,
    onCreateMarker,
    onMoveHold,
    onResizeHold,
    config,
  } = params;

  // Shared values for real-time gesture feedback
  const draggingHoldId = useSharedValue<string | null>(null);
  const dragOffsetX = useSharedValue(0); // Normalized delta
  const dragOffsetY = useSharedValue(0); // Normalized delta

  const resizingHoldId = useSharedValue<string | null>(null);
  const resizeScale = useSharedValue(1);

  // Track marker positions for real-time updates (normalized coords)
  const markerPositions = useSharedValue<Record<string, { x: number; y: number; r: number }>>({});

  // Keep markerPositions in sync with markers prop
  React.useEffect(() => {
    const positions: Record<string, { x: number; y: number; r: number }> = {};
    markers.forEach(marker => {
      positions[marker.id] = { x: marker.x, y: marker.y, r: marker.r };
    });
    markerPositions.value = positions;
  }, [markers, markerPositions]);

  // Convert container coords to normalized coords
  const containerToNorm = React.useCallback(
    (containerX: number, containerY: number) => {
      if (!imageBounds || imageBounds.width === 0 || imageBounds.height === 0) {
        return { x: 0, y: 0 };
      }
      return {
        x: (containerX - imageBounds.left) / imageBounds.width,
        y: (containerY - imageBounds.top) / imageBounds.height,
      };
    },
    [imageBounds]
  );

  // Stable callbacks for runOnJS
  const handleMoveHoldWrapper = React.useCallback(
    (id: string, normX: number, normY: number) => {
      // Clamp to image bounds
      const clampedX = Math.max(0, Math.min(1, normX));
      const clampedY = Math.max(0, Math.min(1, normY));
      onMoveHold(id, clampedX, clampedY);
    },
    [onMoveHold]
  );

  const handleResizeHoldWrapper = React.useCallback(
    (id: string, normRadius: number) => {
      // Clamp radius to reasonable normalized bounds
      // Min: 0.01 (1% of image width), Max: 0.2 (20% of image width)
      const clampedR = Math.max(0.01, Math.min(0.2, normRadius));
      onResizeHold(id, clampedR);
    },
    [onResizeHold]
  );

  // Cache selected marker info for worklet access
  const selectedMarkerRef = useSharedValue<{ id: string; x: number; y: number; r: number } | null>(null);
  
  React.useEffect(() => {
    const selected = markers.find(m => m.selected);
    // console.log('[useNormalizedMarkerGestures] Syncing selectedMarkerRef:', {
    //   foundSelectedId: selected?.id?.slice(-8),
    //   markersCount: markers.length,
    //   allSelectionStates: markers.map(m => ({ id: m.id.slice(-8), selected: m.selected })),
    // });
    selectedMarkerRef.value = selected ? { id: selected.id, x: selected.x, y: selected.y, r: selected.r } : null;
  }, [markers, selectedMarkerRef]);

  // Gesture end handler - commits changes to JS state
  const commitGestureChanges = React.useCallback(() => {
    const wasDragging = draggingHoldId.value !== null;
    const wasResizing = resizingHoldId.value !== null;

    // DEBUG: Log what's being committed
    // console.log('[commitGestureChanges] Committing:', {
    //   wasDragging,
    //   wasResizing,
    //   draggingId: draggingHoldId.value?.slice(-8) ?? null,
    //   resizingId: resizingHoldId.value?.slice(-8) ?? null,
    //   dragOffset: { x: dragOffsetX.value.toFixed(3), y: dragOffsetY.value.toFixed(3) },
    //   resizeScale: resizeScale.value.toFixed(3),
    // });

    if (wasDragging || wasResizing) {
      const markerId = draggingHoldId.value || resizingHoldId.value;
      if (markerId) {
        const marker = markers.find(m => m.id === markerId);
        if (marker) {
          const currentData = markerPositions.value[markerId] || { x: marker.x, y: marker.y, r: marker.r };

          // Calculate final values
          const finalX = wasDragging ? currentData.x + dragOffsetX.value : currentData.x;
          const finalY = wasDragging ? currentData.y + dragOffsetY.value : currentData.y;
          const finalR = wasResizing ? currentData.r * resizeScale.value : currentData.r;

          // IMPORTANT: Update markerPositions BEFORE resetting offsets to prevent "blink"
          // This ensures the marker stays at its final position while JS state updates
          markerPositions.value = {
            ...markerPositions.value,
            [markerId]: { x: finalX, y: finalY, r: finalR },
          };

          // Now commit to JS state
          if (wasDragging) {
            handleMoveHoldWrapper(markerId, finalX, finalY);
          }
          if (wasResizing) {
            handleResizeHoldWrapper(markerId, finalR);
          }
        }
      }
    }

    // Reset gesture states (markerPositions already has the final position)
    draggingHoldId.value = null;
    dragOffsetX.value = 0;
    dragOffsetY.value = 0;
    resizingHoldId.value = null;
    resizeScale.value = 1;
  }, [
    markers,
    markerPositions,
    draggingHoldId,
    dragOffsetX,
    dragOffsetY,
    resizingHoldId,
    resizeScale,
    handleMoveHoldWrapper,
    handleResizeHoldWrapper,
  ]);

  // Default radius for new markers (used for selection tracking)
  const defaultRadius = config.defaultMarkerRadius ?? 0.06;

  // ----- GESTURE DEFINITIONS -----

  // Unified tap handler that determines action based on tap location
  // IMPORTANT: Updates selectedMarkerRef SYNCHRONOUSLY to prevent race conditions
  // where a drag gesture starts before the useEffect that syncs selection can run
  const handleUnifiedTap = React.useCallback(
    (tapContainerX: number, tapContainerY: number) => {
      const norm = containerToNorm(tapContainerX, tapContainerY);
      const hasSelected = markers.some(m => m.selected);
      
      // Find the actual marker that was tapped (if any)
      const tappedMarker = markers.find(m => 
        isInsideNormalizedCircle(norm.x, norm.y, m.x, m.y, m.r, imageAspect)
      );
      
      // DEBUG: Log tap handling
      // console.log('[handleUnifiedTap] Processing tap:', {
      //   tapNorm: { x: norm.x.toFixed(3), y: norm.y.toFixed(3) },
      //   hasSelected,
      //   tappedMarkerId: tappedMarker?.id?.slice(-8) ?? null,
      //   allMarkers: markers.map(m => ({ id: m.id.slice(-8), selected: m.selected })),
      // });
      
      if (tappedMarker) {
        // Tap is on a marker - select it
        // SYNCHRONOUSLY update selectedMarkerRef BEFORE calling onSelect
        // This prevents race condition where drag starts before useEffect runs
        // console.log('[handleUnifiedTap] Selecting marker:', tappedMarker.id.slice(-8));
        selectedMarkerRef.value = {
          id: tappedMarker.id,
          x: tappedMarker.x,
          y: tappedMarker.y,
          r: tappedMarker.r,
        };
        onSelect(norm.x, norm.y);
      } else if (hasSelected) {
        // Tap is outside all markers while one is selected - deselect
        selectedMarkerRef.value = null;
        onDeselect();
      } else {
        // Tap is on empty space with no selection - create marker
        // Only create if tap is within image bounds (0-1 range)
        if (norm.x >= 0 && norm.x <= 1 && norm.y >= 0 && norm.y <= 1) {
          // Generate ID here so we can update selectedMarkerRef synchronously
          const newMarkerId = `marker-${Date.now()}`;
          // New markers are auto-selected, so update ref immediately
          selectedMarkerRef.value = {
            id: newMarkerId,
            x: norm.x,
            y: norm.y,
            r: defaultRadius,
          };
          onCreateMarker(norm.x, norm.y, newMarkerId);
        }
      }
    },
    [containerToNorm, markers, imageAspect, onSelect, onDeselect, onCreateMarker, selectedMarkerRef, defaultRadius]
  );

  // Single unified tap gesture for all tap interactions
  // Uses debouncing constraints to prevent accidental taps
  const unifiedTap = React.useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(config.tapMaxDuration ?? 250)  // Tap must be quick
        .maxDistance(config.tapMaxDistance ?? 10)   // Finger must stay still
        .numberOfTaps(1)                            // Single tap only
        .onEnd((e) => {
          runOnJS(handleUnifiedTap)(e.x, e.y);
        }),
    [config.tapMaxDuration, config.tapMaxDistance, handleUnifiedTap]
  );

  // Cache imageBounds as shared value for worklet access
  const imageBoundsShared = useSharedValue<ImageBounds | null>(null);
  React.useEffect(() => {
    imageBoundsShared.value = imageBounds;
  }, [imageBounds, imageBoundsShared]);

  const imageAspectShared = useSharedValue(imageAspect);
  React.useEffect(() => {
    imageAspectShared.value = imageAspect;
  }, [imageAspect, imageAspectShared]);

  // Hold drag gesture - move selected marker
  // Drag can start within 3× radius of selected marker for easier manipulation
  const dragRadiusMultiplier = config.dragRadiusMultiplier ?? 3;
  
  const holdDrag = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(markers.some(m => m.selected))
        .onBegin((e) => {
          'worklet';
          // IMPORTANT: Always reset drag state at the start of a new gesture attempt
          // This prevents stale values from previous incomplete gestures causing issues
          draggingHoldId.value = null;
          dragOffsetX.value = 0;
          dragOffsetY.value = 0;
          
          // Check if starting drag near selected marker (within dragRadiusMultiplier × radius)
          const selected = selectedMarkerRef.value;
          const bounds = imageBoundsShared.value;
          
          if (!selected || !bounds || bounds.width === 0 || bounds.height === 0) return;
          
          // Convert tap to normalized coords
          const normX = (e.x - bounds.left) / bounds.width;
          const normY = (e.y - bounds.top) / bounds.height;
          
          // Hit test against selected marker with expanded radius
          const dx = normX - selected.x;
          const dy = (normY - selected.y) * imageAspectShared.value;
          const distSq = dx * dx + dy * dy;
          // Allow drag from within dragRadiusMultiplier × marker radius
          const expandedRadius = selected.r * dragRadiusMultiplier;
          const isInDragZone = distSq <= expandedRadius * expandedRadius;

          if (isInDragZone) {
            draggingHoldId.value = selected.id;
            // dragOffsetX/Y already reset above
          }
        })
        .onUpdate((e) => {
          'worklet';
          const bounds = imageBoundsShared.value;
          if (draggingHoldId.value && bounds && bounds.width > 0 && bounds.height > 0) {
            // Get current zoom scale (default to 1 if not provided)
            // When zoomed in, the same screen movement should result in less normalized movement
            const currentScale = scaleShared?.value ?? 1;
            
            // Convert translation to normalized delta, compensating for zoom
            const normDeltaX = (e.translationX * config.holdDragSensitivity) / bounds.width / currentScale;
            const normDeltaY = (e.translationY * config.holdDragSensitivity) / bounds.height / currentScale;
            dragOffsetX.value = normDeltaX;
            dragOffsetY.value = normDeltaY;
          }
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitGestureChanges)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markers, config.holdDragSensitivity, commitGestureChanges]
  );

  // Hold resize gesture - pinch ANYWHERE to resize selected marker (no hit test needed)
  const holdResize = React.useMemo(
    () =>
      Gesture.Pinch()
        .enabled(markers.some(m => m.selected))
        .onBegin(() => {
          'worklet';
          // IMPORTANT: Always reset resize state at the start of a new gesture attempt
          // This prevents stale values from previous incomplete gestures causing issues
          resizingHoldId.value = null;
          resizeScale.value = 1;
          
          // Get selected marker from cached ref (for worklet access)
          const selected = selectedMarkerRef.value;
          
          if (selected) {
            resizingHoldId.value = selected.id;
            // resizeScale already reset above
          }
        })
        .onUpdate((e) => {
          'worklet';
          if (resizingHoldId.value) {
            const dampened = applyScaleDampening(e.scale, config.holdResizeSensitivity);
            resizeScale.value = dampened;
          }
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitGestureChanges)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markers, config.holdResizeSensitivity, commitGestureChanges]
  );

  // Combined gesture for the hold marker layer
  // holdDrag and holdResize use Simultaneous so both can run together:
  // - holdDrag only moves if hit test passes (drag started within 3× radius of selected marker)
  // - holdResize works for any pinch when marker is selected
  // They race against the unified tap gesture
  const combined = React.useMemo(
    () => Gesture.Race(
      Gesture.Simultaneous(holdDrag, holdResize),
      unifiedTap
    ),
    [holdDrag, holdResize, unifiedTap]
  );

  return React.useMemo(
    () => ({
      // Gestures
      combined,
      unifiedTap,
      holdDrag,
      holdResize,
      // Shared values for real-time visual feedback
      draggingHoldId,
      dragOffsetX,
      dragOffsetY,
      resizingHoldId,
      resizeScale,
      markerPositions,
    }),
    [
      combined,
      unifiedTap,
      holdDrag,
      holdResize,
      draggingHoldId,
      dragOffsetX,
      dragOffsetY,
      resizingHoldId,
      resizeScale,
      markerPositions,
    ]
  );
}

