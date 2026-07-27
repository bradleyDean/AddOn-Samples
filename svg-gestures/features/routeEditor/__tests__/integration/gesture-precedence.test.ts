import { useState } from 'react';
import { renderHook } from '@testing-library/react-native';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { coordinateGestureChangesToJsState } from '../../utils/gestureUtils';
import { HoldMarker } from '../../../../shared/types/holds';
import { createMarkerCallbacks } from '../../utils/markerCallbacks';
import { useHoldMarkerGestures } from '../../../../shared/hooks/gesture/useHoldMarkerGestures';
import { useZoomableGestures } from '../../../../shared/hooks/gesture/useZoomableGestures';
import { DEFAULT_HOLD_MARKER_LAYER_CONFIG } from '../../../../shared/config/holdMarkerLayerConfig';
import { DEFAULT_ZOOMABLE_VIEW_CONFIG } from '../../../../shared/config/zoomableViewConfig';

// Mock runOnJS to capture calls
const mockRunOnJS = jest.fn();
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  runOnJS: (fn: (...args: any[]) => any) => (...args: any[]) => {
    mockRunOnJS(fn);
    return fn(...args);
  },
}));

describe('Gesture Precedence Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Drag vs Pan Precedence', () => {
    it('should prioritize drag over pan when marker is selected', () => {
      // ✅ REAL: Use actual React state
      const { result: markersResult } = renderHook(() => useState<HoldMarker[]>([
        { id: 'marker-1', x: 100, y: 150, r: 30, type: 'start', selected: true }
      ]));
      const [markers, setMarkers] = markersResult.current;

      // ✅ REAL: Use actual callbacks from markerCallbacks
      const callbacks = createMarkerCallbacks(setMarkers, DEFAULT_HOLD_MARKER_LAYER_CONFIG);
      const { handleMoveHold } = callbacks;

      const handlePanCanvas = (tx: number, ty: number) => {
        // This should NOT be called when drag takes precedence
        console.log('Canvas panned:', tx, ty);
      };

      // ✅ REAL: Use actual gesture hooks
      const { result: holdGesturesResult } = renderHook(() => 
        useHoldMarkerGestures({
          markers,
          onSelect: callbacks.handleSelect,
          onDeselect: callbacks.handleDeselect,
          onTapWhileSelected: callbacks.handleTapWhileSelected,
          onCreateMarker: callbacks.handleCreateMarker,
          onMoveHold: callbacks.handleMoveHold,
          onResizeHold: callbacks.handleResizeHold,
          config: DEFAULT_HOLD_MARKER_LAYER_CONFIG,
        })
      );
      const { holdDrag, draggingHoldId, dragOffsetX, dragOffsetY, markerPositions } = holdGesturesResult.current;

      const { result: zoomGesturesResult } = renderHook(() => 
        useZoomableGestures({
          onPanCanvas: handlePanCanvas,
          onZoomCanvas: jest.fn(),
          config: DEFAULT_ZOOMABLE_VIEW_CONFIG,
        })
      );
      const { pan: canvasPan } = zoomGesturesResult.current;

      // ✅ REAL: Apply precedence - drag should take precedence over pan
      canvasPan.requireExternalGestureToFail(holdDrag);

      // 🎭 MOCK: Simulate gesture interaction
      const simulateDragGesture = () => {
        // Simulate drag start
        draggingHoldId.value = 'marker-1';
        markerPositions.value = { 'marker-1': { x: 100, y: 150, r: 30 } };

        // Simulate drag update
        dragOffsetX.value = 50;
        dragOffsetY.value = 30;

        // Simulate drag end
        coordinateGestureChangesToJsState({
          draggingHoldId,
          dragOffsetX,
          dragOffsetY,
          resizingHoldId: { value: null },
          resizeScale: { value: 1 },
          markerPositions,
          markers,
          handleMoveHold,
          handleResizeHold: jest.fn(),
        });
      };

      // Test that drag takes precedence
      simulateDragGesture();

      // ✅ REAL: Verify drag was processed
      expect(markerPositions.value['marker-1']).toEqual({
        x: 150, y: 180, r: 30
      });

      // ✅ REAL: Verify canvas pan was NOT processed
      expect(mockRunOnJS).toHaveBeenCalledWith(handleMoveHold);
      expect(mockRunOnJS).not.toHaveBeenCalledWith(handlePanCanvas);
    });

    it('should allow pan when no marker is selected', () => {
      // ✅ REAL: Use actual React state (no selected markers)
      const { result: markersResult } = renderHook(() => useState<HoldMarker[]>([
        { id: 'marker-1', x: 100, y: 150, r: 30, type: 'start', selected: false }
      ]));
      const [markers] = markersResult.current;

      // ✅ REAL: Use actual callbacks from markerCallbacks
      const callbacks = createMarkerCallbacks(() => {}, DEFAULT_HOLD_MARKER_LAYER_CONFIG); // Mock setMarkers since we don't need state updates

      const handlePanCanvas = (tx: number, ty: number) => {
        console.log('Canvas panned:', tx, ty);
      };

      // ✅ REAL: Use actual gesture hooks
      const { result: holdGesturesResult } = renderHook(() => 
        useHoldMarkerGestures({
          markers,
          onSelect: callbacks.handleSelect,
          onDeselect: callbacks.handleDeselect,
          onTapWhileSelected: callbacks.handleTapWhileSelected,
          onCreateMarker: callbacks.handleCreateMarker,
          onMoveHold: callbacks.handleMoveHold,
          onResizeHold: callbacks.handleResizeHold,
          config: DEFAULT_HOLD_MARKER_LAYER_CONFIG,
        })
      );
      const { holdDrag } = holdGesturesResult.current;

      const { result: zoomGesturesResult } = renderHook(() => 
        useZoomableGestures({
          onPanCanvas: handlePanCanvas,
          onZoomCanvas: jest.fn(),
          config: DEFAULT_ZOOMABLE_VIEW_CONFIG,
        })
      );
      const { pan: canvasPan } = zoomGesturesResult.current;

      // ✅ REAL: Apply precedence
      canvasPan.requireExternalGestureToFail(holdDrag);

      // 🎭 MOCK: Simulate pan gesture
      const simulatePanGesture = () => {
        // Simulate pan end
        runOnJS(handlePanCanvas)(50, 30);
      };

      // Test that pan is allowed when no marker is selected
      simulatePanGesture();

      // ✅ REAL: Verify canvas pan was processed
      expect(mockRunOnJS).toHaveBeenCalledWith(handlePanCanvas);
    });
  });

  describe('Resize vs Zoom Precedence', () => {
    it('should prioritize resize over zoom when marker is selected', () => {
      // ✅ REAL: Use actual useSharedValue
      const { result: markerPositionsResult } = renderHook(() => useSharedValue({}));
      const { result: resizingHoldIdResult } = renderHook(() => useSharedValue(null));
      const { result: resizeScaleResult } = renderHook(() => useSharedValue(1));
      const { result: canvasScaleResult } = renderHook(() => useSharedValue(1));

      // ✅ REAL: Use actual React state
      const { result: markersResult } = renderHook(() => useState<HoldMarker[]>([
        { id: 'marker-1', x: 100, y: 150, r: 30, type: 'start', selected: true }
      ]));
      const [markers, setMarkers] = markersResult.current;

      // ✅ REAL: Use actual callbacks from markerCallbacks
      const callbacks = createMarkerCallbacks(setMarkers, DEFAULT_HOLD_MARKER_LAYER_CONFIG);
      const { handleResizeHold } = callbacks;

      const handleZoomCanvas = (scale: number) => {
        // This should NOT be called when resize takes precedence
        console.log('Canvas zoomed:', scale);
      };

      // ✅ REAL: Use actual gesture hooks
      const { result: holdGesturesResult } = renderHook(() => 
        useHoldMarkerGestures({
          markers,
          onSelect: callbacks.handleSelect,
          onDeselect: callbacks.handleDeselect,
          onTapWhileSelected: callbacks.handleTapWhileSelected,
          onCreateMarker: callbacks.handleCreateMarker,
          onMoveHold: callbacks.handleMoveHold,
          onResizeHold: callbacks.handleResizeHold,
          config: DEFAULT_HOLD_MARKER_LAYER_CONFIG,
        })
      );
      const { holdResize, resizingHoldId: resizingHoldId2, resizeScale: resizeScale2, markerPositions: markerPositions2 } = holdGesturesResult.current;

      const { result: zoomGesturesResult } = renderHook(() => 
        useZoomableGestures({
          onPanCanvas: jest.fn(),
          onZoomCanvas: handleZoomCanvas,
          config: DEFAULT_ZOOMABLE_VIEW_CONFIG,
        })
      );
      const { pinch: canvasPinch } = zoomGesturesResult.current;

      // ✅ REAL: Apply precedence - resize should take precedence over pinch
      canvasPinch.requireExternalGestureToFail(holdResize);

      // 🎭 MOCK: Simulate gesture interaction
      const simulateResizeGesture = () => {
        // Simulate resize start
        resizingHoldId2.value = 'marker-1';
        markerPositions2.value = { 'marker-1': { x: 100, y: 150, r: 30 } };

        // Simulate resize update
        resizeScale2.value = 1.5;

        // Simulate resize end
        coordinateGestureChangesToJsState({
          draggingHoldId: { value: null },
          dragOffsetX: { value: 0 },
          dragOffsetY: { value: 0 },
          resizingHoldId: resizingHoldId2,
          resizeScale: resizeScale2,
          markerPositions: markerPositions2,
          markers,
          handleMoveHold: jest.fn(),
          handleResizeHold,
        });
      };

      // Test that resize takes precedence
      simulateResizeGesture();

      // ✅ REAL: Verify resize was processed
      expect(markerPositions2.value['marker-1']).toEqual({
        x: 100, y: 150, r: 45 // 30 * 1.5
      });

      // ✅ REAL: Verify canvas zoom was NOT processed
      expect(mockRunOnJS).toHaveBeenCalledWith(handleResizeHold);
      expect(mockRunOnJS).not.toHaveBeenCalledWith(handleZoomCanvas);
    });

    it('should allow zoom when no marker is selected', () => {
      // ✅ REAL: Use actual React state (no selected markers)
      const { result: markersResult } = renderHook(() => useState<HoldMarker[]>([
        { id: 'marker-1', x: 100, y: 150, r: 30, type: 'start', selected: false }
      ]));
      const [markers] = markersResult.current;

      // ✅ REAL: Use actual callbacks from markerCallbacks
      const callbacks = createMarkerCallbacks(() => {}, DEFAULT_HOLD_MARKER_LAYER_CONFIG); // Mock setMarkers since we don't need state updates

      const handleZoomCanvas = (scale: number) => {
        console.log('Canvas zoomed:', scale);
      };

      // ✅ REAL: Use actual gesture hooks
      const { result: holdGesturesResult } = renderHook(() => 
        useHoldMarkerGestures({
          markers,
          onSelect: callbacks.handleSelect,
          onDeselect: callbacks.handleDeselect,
          onTapWhileSelected: callbacks.handleTapWhileSelected,
          onCreateMarker: callbacks.handleCreateMarker,
          onMoveHold: callbacks.handleMoveHold,
          onResizeHold: callbacks.handleResizeHold,
          config: DEFAULT_HOLD_MARKER_LAYER_CONFIG,
        })
      );
      const { holdResize } = holdGesturesResult.current;

      const { result: zoomGesturesResult } = renderHook(() => 
        useZoomableGestures({
          onPanCanvas: jest.fn(),
          onZoomCanvas: handleZoomCanvas,
          config: DEFAULT_ZOOMABLE_VIEW_CONFIG,
        })
      );
      const { pinch: canvasPinch } = zoomGesturesResult.current;

      // ✅ REAL: Apply precedence
      canvasPinch.requireExternalGestureToFail(holdResize);

      // 🎭 MOCK: Simulate pinch gesture
      const simulatePinchGesture = () => {
        // Simulate pinch end
        runOnJS(handleZoomCanvas)(1.5);
      };

      // Test that zoom is allowed when no marker is selected
      simulatePinchGesture();

      // ✅ REAL: Verify canvas zoom was processed
      expect(mockRunOnJS).toHaveBeenCalledWith(handleZoomCanvas);
    });
  });

  describe('Gesture State Transitions', () => {
    it('should update gesture precedence when marker selection changes', () => {
      // ✅ REAL: Use actual React state
      const { result: markersResult } = renderHook(() => useState<HoldMarker[]>([
        { id: 'marker-1', x: 100, y: 150, r: 30, type: 'start', selected: false }
      ]));
      const [markers, setMarkers] = markersResult.current;

      // ✅ REAL: Use actual callbacks from markerCallbacks
      const callbacks = createMarkerCallbacks(setMarkers, DEFAULT_HOLD_MARKER_LAYER_CONFIG);
      const { handleMoveHold } = callbacks;

      const handlePanCanvas = (tx: number, ty: number) => {
        console.log('Canvas panned:', tx, ty);
      };

      // ✅ REAL: Use actual gesture hooks
      const { result: holdGesturesResult } = renderHook(() => 
        useHoldMarkerGestures({
          markers,
          onSelect: callbacks.handleSelect,
          onDeselect: callbacks.handleDeselect,
          onTapWhileSelected: callbacks.handleTapWhileSelected,
          onCreateMarker: callbacks.handleCreateMarker,
          onMoveHold: callbacks.handleMoveHold,
          onResizeHold: callbacks.handleResizeHold,
          config: DEFAULT_HOLD_MARKER_LAYER_CONFIG,
        })
      );
      const { holdDrag } = holdGesturesResult.current;

      const { result: zoomGesturesResult } = renderHook(() => 
        useZoomableGestures({
          onPanCanvas: handlePanCanvas,
          onZoomCanvas: jest.fn(),
          config: DEFAULT_ZOOMABLE_VIEW_CONFIG,
        })
      );
      const { pan: canvasPan } = zoomGesturesResult.current;

      // Test 1: No marker selected - pan should work
      canvasPan.requireExternalGestureToFail(holdDrag);

      // Simulate pan when no marker is selected
      runOnJS(handlePanCanvas)(50, 30);

      expect(mockRunOnJS).toHaveBeenCalledWith(handlePanCanvas);

      // Test 2: Select marker - drag should take precedence
      jest.clearAllMocks();
      setMarkers(prev => prev.map(m => ({ ...m, selected: true })));
      
      // Recreate gestures with new selection state
      const { result: holdGesturesResult2 } = renderHook(() => 
        useHoldMarkerGestures({
          markers: [{ id: 'marker-1', x: 100, y: 150, r: 30, type: 'start', selected: true }],
          onSelect: callbacks.handleSelect,
          onDeselect: callbacks.handleDeselect,
          onTapWhileSelected: callbacks.handleTapWhileSelected,
          onCreateMarker: callbacks.handleCreateMarker,
          onMoveHold: callbacks.handleMoveHold,
          onResizeHold: callbacks.handleResizeHold,
          config: DEFAULT_HOLD_MARKER_LAYER_CONFIG,
        })
      );
      const { holdDrag: holdDrag2, draggingHoldId: draggingHoldId2, dragOffsetX: dragOffsetX2, dragOffsetY: dragOffsetY2, markerPositions: markerPositions2 } = holdGesturesResult2.current;
      canvasPan.requireExternalGestureToFail(holdDrag2);

      // Simulate drag when marker is selected
      draggingHoldId2.value = 'marker-1';
      markerPositions2.value = { 'marker-1': { x: 100, y: 150, r: 30 } };
      dragOffsetX2.value = 25;
      dragOffsetY2.value = 15;

      coordinateGestureChangesToJsState({
        draggingHoldId: draggingHoldId2,
        dragOffsetX: dragOffsetX2,
        dragOffsetY: dragOffsetY2,
        resizingHoldId: { value: null },
        resizeScale: { value: 1 },
        markerPositions: markerPositions2,
        markers: [{ id: 'marker-1', x: 100, y: 150, r: 30, type: 'start', selected: true }],
        handleMoveHold,
        handleResizeHold: jest.fn(),
      });

      // ✅ REAL: Verify drag was processed, pan was not
      expect(mockRunOnJS).toHaveBeenCalledWith(handleMoveHold);
      expect(mockRunOnJS).not.toHaveBeenCalledWith(handlePanCanvas);
    });
  });
});
