import React from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { HoldMarker } from '../../types/holds';
import { tapIsInAnyMarker, tapIsInSelectedMarker, isInsideCircle, applyScaleDampeningWorklet } from '../../utils/geometry';
import { coordinateGestureChangesToJsState } from '../../../features/routeEditor/utils/gestureUtils';
import { HoldMarkerLayerConfig } from '../../config/holdMarkerLayerConfig';

export function useHoldMarkerGestures({
  markers,
  onSelect,
  onDeselect,
  onTapWhileSelected,
  onCreateMarker,
  onMoveHold,
  onResizeHold,
  config,
}: {
  markers: HoldMarker[];
  onSelect: (x: number, y: number) => void;
  onDeselect: (x: number, y: number) => void;
  onTapWhileSelected: (x: number, y: number) => void;
  onCreateMarker: (x: number, y: number) => void;
  onMoveHold: (id: string, newX: number, newY: number) => void;
  onResizeHold: (id: string, newRadius: number) => void;
  config: HoldMarkerLayerConfig;
}) {
  // ✅ Stable handlers — safe to pass to runOnJS
  const handleSelect = React.useCallback(
    (x: number, y: number) => {
      // Only trigger selection if tap is in any marker
      if (tapIsInAnyMarker(x, y, markers)) {
        onSelect(x, y);
      }
    },
    [markers, onSelect]
  );

  const handleDeselect = React.useCallback(
    (x: number, y: number) => {
      // Check if any marker is selected and tap is outside selected marker
      const hasSelectedMarker = markers.some(marker => marker.selected);
      if (hasSelectedMarker && !tapIsInSelectedMarker(x, y, markers)) {
        onDeselect(x, y);
      }
    },
    [markers, onDeselect]
  );

  const handleTapWhileSelected = React.useCallback(
    (x: number, y: number) => {
      if (tapIsInSelectedMarker(x, y, markers)) {
        onTapWhileSelected(x, y);
      } else {
        onDeselect(x, y);
      }
    },
    [markers, onTapWhileSelected, onDeselect]
  );

  const handleCreateMarker = React.useCallback(
    (x: number, y: number) => {
      // Only create marker if tap is not in any existing marker
      if (!tapIsInAnyMarker(x, y, markers)) {
        onCreateMarker(x, y);
      }
    },
    [markers, onCreateMarker]
  );

  const handleMoveHold = React.useCallback(
    (id: string, newX: number, newY: number) => onMoveHold(id, newX, newY),
    [onMoveHold]
  );

  const handleResizeHold = React.useCallback(
    (id: string, newRadius: number) => onResizeHold(id, newRadius),
    [onResizeHold]
  );

  // Shared values for real-time hold dragging
  const draggingHoldId = useSharedValue<string | null>(null);
  const dragOffsetX = useSharedValue(0);
  const dragOffsetY = useSharedValue(0);

  // Shared values for hold resizing
  const resizingHoldId = useSharedValue<string | null>(null);
  const resizeScale = useSharedValue(1);

  // ✅ NEW: Shared values to track marker positions and radius
  const markerPositions = useSharedValue<Record<string, { x: number; y: number; r: number }>>({});

  // ✅ NEW: Update marker positions and radius when markers change
  React.useEffect(() => {
    const positions: Record<string, { x: number; y: number; r: number }> = {};
    markers.forEach(marker => {
      positions[marker.id] = { x: marker.x, y: marker.y, r: marker.r };
    });
    markerPositions.value = positions;
  }, [markers, markerPositions]);

  // ****** Unified Gesture End Handler ******

  // ****** Gesture definitions ******

  // When a hold marker is tapped do this:
  const innerTap = React.useMemo(() => 
    Gesture.Tap()
      // Only enabled when any marker is selected
      .enabled(markers.some(marker => marker.selected))
      .onEnd((e) => {
        // Call the handleTapWhileSelected function
        runOnJS(handleTapWhileSelected)(e.x, e.y);
      }),
    [markers, handleTapWhileSelected]
  );

  const longPress = React.useMemo(() =>
    Gesture.LongPress()
      .minDuration(config.longPressDuration)
      .onEnd((e) => {
        runOnJS(handleSelect)(e.x, e.y);
      }),
    [handleSelect, config.longPressDuration]
  );

  const innerAndLong = React.useMemo(() => 
    Gesture.Simultaneous(innerTap, longPress) as any,
    [innerTap, longPress]
  );

  const outerTap = React.useMemo(() =>
    Gesture.Tap()
      .onEnd((e) => {
        // If no markers are selected, try to create a new marker
        const hasSelectedMarker = markers.some(marker => marker.selected);
        if (!hasSelectedMarker) {
          runOnJS(handleCreateMarker)(e.x, e.y);
        } else {
          // Otherwise, handle deselection
          runOnJS(handleDeselect)(e.x, e.y);
        }
      })
      .requireExternalGestureToFail(innerAndLong),
    [markers, handleCreateMarker, handleDeselect, innerAndLong]
  );

  // Hold dragging pan gesture
  const holdDrag = React.useMemo(() =>
    Gesture.Pan()
      .onBegin((e) => {
        const selected = markers.find(m => m.selected);
        if (selected && isInsideCircle(e.x, e.y, selected.x, selected.y, selected.r)) {
          // Start dragging this hold
          draggingHoldId.value = selected.id;
          dragOffsetX.value = 0;
          dragOffsetY.value = 0;
        }
      })
      .enabled(markers.some(m => m.selected))
      .onUpdate((e) => {
        if (draggingHoldId.value) {
          // Update drag offset for real-time visual feedback with configurable sensitivity
          dragOffsetX.value = e.translationX * config.holdDragSensitivity;
          dragOffsetY.value = e.translationY * config.holdDragSensitivity;
        }
      })
      .onEnd(() => {
        coordinateGestureChangesToJsState({
          draggingHoldId,
          dragOffsetX,
          dragOffsetY,
          resizingHoldId,
          resizeScale,
          markerPositions,
          markers,
          handleMoveHold,
          handleResizeHold,
        });
      }),
    // Note: We intentionally omit shared values (draggingHoldId, dragOffsetX, dragOffsetY, 
    // resizingHoldId, resizeScale, markerPositions) from dependencies because:
    // 1. useSharedValue returns stable references that don't change between renders
    // 2. Only the .value property changes, not the object reference itself
    // 3. Including them would cause unnecessary gesture recreation on every render
    // 4. The gesture logic only needs to recreate when markers or callbacks change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markers, handleMoveHold, handleResizeHold, config.holdResizeSensitivity, config.holdDragSensitivity]
  );

  // Hold resizing pinch gesture
  const holdResize = React.useMemo(() =>
    Gesture.Pinch()
      .onBegin((_e) => {
        const selected = markers.find(m => m.selected);
        if (selected) {
          // Start resizing the selected hold regardless of pinch location
          resizingHoldId.value = selected.id;
          resizeScale.value = 1;
        }
      })
      .enabled(markers.some(m => m.selected))
      .onUpdate((e) => {
        if (resizingHoldId.value) {
          // Apply dampening to make resizing more reasonable - use config sensitivity
          const dampenedScale = applyScaleDampeningWorklet(e.scale, config.holdResizeSensitivity);
          resizeScale.value = dampenedScale;
        }
      })
      .onEnd(() => {
        coordinateGestureChangesToJsState({
          draggingHoldId,
          dragOffsetX,
          dragOffsetY,
          resizingHoldId,
          resizeScale,
          markerPositions,
          markers,
          handleMoveHold,
          handleResizeHold,
        });
      }),
    // Note: We intentionally omit shared values (draggingHoldId, dragOffsetX, dragOffsetY, 
    // resizingHoldId, resizeScale, markerPositions) from dependencies because:
    // 1. useSharedValue returns stable references that don't change between renders
    // 2. Only the .value property changes, not the object reference itself
    // 3. Including them would cause unnecessary gesture recreation on every render
    // 4. The gesture logic only needs to recreate when markers or callbacks change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markers, handleMoveHold, handleResizeHold, config.holdResizeSensitivity, config.holdDragSensitivity]
  );

  return React.useMemo(
    () => ({
      innerTap,
      longPress,
      innerAndLong,
      outerTap,
      holdDrag,
      holdResize,
      // Expose shared values for real-time visual feedback
      draggingHoldId,
      dragOffsetX,
      dragOffsetY,
      resizingHoldId,
      resizeScale,
      // ✅ NEW: Expose marker positions
      markerPositions,
    }),
    [innerTap, longPress, innerAndLong, outerTap, holdDrag, holdResize, draggingHoldId, dragOffsetX, dragOffsetY, resizingHoldId, resizeScale, markerPositions]
  );
}
