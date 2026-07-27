import { coordinateGestureChangesToJsState } from '../../../features/routeEditor/utils/gestureUtils';
import { HoldMarker } from '../../../shared/types/holds';
import { createMockSharedValue } from '../../../shared/utils/test/testUtils';

// Mock runOnJS to capture calls
const mockRunOnJS = jest.fn();
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  runOnJS: (fn: any) => mockRunOnJS(fn),
}));

describe('coordinateGestureChangesToJsState', () => {
  const mockMarkers: HoldMarker[] = [
    {
      id: 'marker-1',
      x: 100,
      y: 100,
      r: 20,
      type: 'start',
      selected: true,
    },
    {
      id: 'marker-2',
      x: 200,
      y: 200,
      r: 25,
      type: 'intermediate',
      selected: false,
    },
  ];

  const mockHandleMoveHold = jest.fn();
  const mockHandleResizeHold = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunOnJS.mockImplementation((fn) => fn);
  });

  describe('single gesture completion', () => {
    it('should handle drag-only gesture completion', () => {
      const draggingHoldId = createMockSharedValue('marker-1');
      const dragOffsetX = createMockSharedValue(50);
      const dragOffsetY = createMockSharedValue(30);
      const resizingHoldId = createMockSharedValue(null);
      const resizeScale = createMockSharedValue(1);
      const markerPositions = createMockSharedValue({
        'marker-1': { x: 100, y: 100, r: 20 },
        'marker-2': { x: 200, y: 200, r: 25 },
      });

      coordinateGestureChangesToJsState({
        draggingHoldId,
        dragOffsetX,
        dragOffsetY,
        resizingHoldId,
        resizeScale,
        markerPositions,
        markers: mockMarkers,
        handleMoveHold: mockHandleMoveHold,
        handleResizeHold: mockHandleResizeHold,
      });

      // Verify markerPositions was updated with new position and original radius
      expect(markerPositions.value).toEqual({
        'marker-1': { x: 150, y: 130, r: 20 }, // 100+50, 100+30, original r
        'marker-2': { x: 200, y: 200, r: 25 },
      });

      // Verify handleMoveHold was called
      expect(mockHandleMoveHold).toHaveBeenCalledWith('marker-1', 150, 130);
      expect(mockHandleResizeHold).not.toHaveBeenCalled();

      // Verify gesture states were reset
      expect(draggingHoldId.value).toBeNull();
      expect(dragOffsetX.value).toBe(0);
      expect(dragOffsetY.value).toBe(0);
      expect(resizingHoldId.value).toBeNull();
      expect(resizeScale.value).toBe(1);
    });

    it('should handle resize-only gesture completion', () => {
      const draggingHoldId = createMockSharedValue(null);
      const dragOffsetX = createMockSharedValue(0);
      const dragOffsetY = createMockSharedValue(0);
      const resizingHoldId = createMockSharedValue('marker-1');
      const resizeScale = createMockSharedValue(1.5);
      const markerPositions = createMockSharedValue({
        'marker-1': { x: 100, y: 100, r: 20 },
        'marker-2': { x: 200, y: 200, r: 25 },
      });

      coordinateGestureChangesToJsState({
        draggingHoldId,
        dragOffsetX,
        dragOffsetY,
        resizingHoldId,
        resizeScale,
        markerPositions,
        markers: mockMarkers,
        handleMoveHold: mockHandleMoveHold,
        handleResizeHold: mockHandleResizeHold,
      });

      // Verify markerPositions was updated with original position and new radius
      expect(markerPositions.value).toEqual({
        'marker-1': { x: 100, y: 100, r: 30 }, // original x,y, 20*1.5
        'marker-2': { x: 200, y: 200, r: 25 },
      });

      // Verify handleResizeHold was called
      expect(mockHandleResizeHold).toHaveBeenCalledWith('marker-1', 30);
      expect(mockHandleMoveHold).not.toHaveBeenCalled();

      // Verify gesture states were reset
      expect(draggingHoldId.value).toBeNull();
      expect(dragOffsetX.value).toBe(0);
      expect(dragOffsetY.value).toBe(0);
      expect(resizingHoldId.value).toBeNull();
      expect(resizeScale.value).toBe(1);
    });
  });

  describe('simultaneous gesture completion (drag + resize)', () => {
    it('should coordinate both drag and resize changes', () => {
      const draggingHoldId = createMockSharedValue('marker-1');
      const dragOffsetX = createMockSharedValue(50);
      const dragOffsetY = createMockSharedValue(30);
      const resizingHoldId = createMockSharedValue('marker-1');
      const resizeScale = createMockSharedValue(1.5);
      const markerPositions = createMockSharedValue({
        'marker-1': { x: 100, y: 100, r: 20 },
        'marker-2': { x: 200, y: 200, r: 25 },
      });

      coordinateGestureChangesToJsState({
        draggingHoldId,
        dragOffsetX,
        dragOffsetY,
        resizingHoldId,
        resizeScale,
        markerPositions,
        markers: mockMarkers,
        handleMoveHold: mockHandleMoveHold,
        handleResizeHold: mockHandleResizeHold,
      });

      // Verify markerPositions was updated with BOTH new position AND new radius
      expect(markerPositions.value).toEqual({
        'marker-1': { x: 150, y: 130, r: 30 }, // 100+50, 100+30, 20*1.5
        'marker-2': { x: 200, y: 200, r: 25 },
      });

      // Verify BOTH handlers were called
      expect(mockHandleMoveHold).toHaveBeenCalledWith('marker-1', 150, 130);
      expect(mockHandleResizeHold).toHaveBeenCalledWith('marker-1', 30);

      // Verify gesture states were reset
      expect(draggingHoldId.value).toBeNull();
      expect(dragOffsetX.value).toBe(0);
      expect(dragOffsetY.value).toBe(0);
      expect(resizingHoldId.value).toBeNull();
      expect(resizeScale.value).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle no active gestures gracefully', () => {
      const draggingHoldId = createMockSharedValue(null);
      const dragOffsetX = createMockSharedValue(0);
      const dragOffsetY = createMockSharedValue(0);
      const resizingHoldId = createMockSharedValue(null);
      const resizeScale = createMockSharedValue(1);
      const markerPositions = createMockSharedValue({
        'marker-1': { x: 100, y: 100, r: 20 },
      });

      coordinateGestureChangesToJsState({
        draggingHoldId,
        dragOffsetX,
        dragOffsetY,
        resizingHoldId,
        resizeScale,
        markerPositions,
        markers: mockMarkers,
        handleMoveHold: mockHandleMoveHold,
        handleResizeHold: mockHandleResizeHold,
      });

      // Should not call any handlers
      expect(mockHandleMoveHold).not.toHaveBeenCalled();
      expect(mockHandleResizeHold).not.toHaveBeenCalled();

      // Should still reset gesture states
      expect(draggingHoldId.value).toBeNull();
      expect(dragOffsetX.value).toBe(0);
      expect(dragOffsetY.value).toBe(0);
      expect(resizingHoldId.value).toBeNull();
      expect(resizeScale.value).toBe(1);
    });

    it('should handle marker not found gracefully', () => {
      const draggingHoldId = createMockSharedValue('non-existent-marker');
      const dragOffsetX = createMockSharedValue(50);
      const dragOffsetY = createMockSharedValue(30);
      const resizingHoldId = createMockSharedValue(null);
      const resizeScale = createMockSharedValue(1);
      const markerPositions = createMockSharedValue({});

      coordinateGestureChangesToJsState({
        draggingHoldId,
        dragOffsetX,
        dragOffsetY,
        resizingHoldId,
        resizeScale,
        markerPositions,
        markers: mockMarkers,
        handleMoveHold: mockHandleMoveHold,
        handleResizeHold: mockHandleResizeHold,
      });

      // Should not call any handlers
      expect(mockHandleMoveHold).not.toHaveBeenCalled();
      expect(mockHandleResizeHold).not.toHaveBeenCalled();

      // Should still reset gesture states
      expect(draggingHoldId.value).toBeNull();
      expect(dragOffsetX.value).toBe(0);
      expect(dragOffsetY.value).toBe(0);
      expect(resizingHoldId.value).toBeNull();
      expect(resizeScale.value).toBe(1);
    });

    it('should enforce radius bounds (min: 10, max: 100)', () => {
      const draggingHoldId = createMockSharedValue(null);
      const dragOffsetX = createMockSharedValue(0);
      const dragOffsetY = createMockSharedValue(0);
      const resizingHoldId = createMockSharedValue('marker-1');
      const resizeScale = createMockSharedValue(0.2); // Would make radius 4 (below min)
      const markerPositions = createMockSharedValue({
        'marker-1': { x: 100, y: 100, r: 20 },
      });

      coordinateGestureChangesToJsState({
        draggingHoldId,
        dragOffsetX,
        dragOffsetY,
        resizingHoldId,
        resizeScale,
        markerPositions,
        markers: mockMarkers,
        handleMoveHold: mockHandleMoveHold,
        handleResizeHold: mockHandleResizeHold,
      });

      // Should clamp radius to minimum of 10
      expect(mockHandleResizeHold).toHaveBeenCalledWith('marker-1', 10);
    });

    it('should enforce radius bounds for maximum value', () => {
      const draggingHoldId = createMockSharedValue(null);
      const dragOffsetX = createMockSharedValue(0);
      const dragOffsetY = createMockSharedValue(0);
      const resizingHoldId = createMockSharedValue('marker-1');
      const resizeScale = createMockSharedValue(5); // Would make radius 100 (at max)
      const markerPositions = createMockSharedValue({
        'marker-1': { x: 100, y: 100, r: 20 },
      });

      coordinateGestureChangesToJsState({
        draggingHoldId,
        dragOffsetX,
        dragOffsetY,
        resizingHoldId,
        resizeScale,
        markerPositions,
        markers: mockMarkers,
        handleMoveHold: mockHandleMoveHold,
        handleResizeHold: mockHandleResizeHold,
      });

      // Should clamp radius to maximum of 100
      expect(mockHandleResizeHold).toHaveBeenCalledWith('marker-1', 100);
    });

    it('should handle missing markerPositions data gracefully', () => {
      const draggingHoldId = createMockSharedValue('marker-1');
      const dragOffsetX = createMockSharedValue(50);
      const dragOffsetY = createMockSharedValue(30);
      const resizingHoldId = createMockSharedValue(null);
      const resizeScale = createMockSharedValue(1);
      const markerPositions = createMockSharedValue({}); // Empty - no marker-1 data

      coordinateGestureChangesToJsState({
        draggingHoldId,
        dragOffsetX,
        dragOffsetY,
        resizingHoldId,
        resizeScale,
        markerPositions,
        markers: mockMarkers,
        handleMoveHold: mockHandleMoveHold,
        handleResizeHold: mockHandleResizeHold,
      });

      // Should use marker's original position when markerPositions is missing
      expect(markerPositions.value).toEqual({
        'marker-1': { x: 150, y: 130, r: 20 }, // 100+50, 100+30, original r
      });

      expect(mockHandleMoveHold).toHaveBeenCalledWith('marker-1', 150, 130);
    });
  });

  describe('mathematical correctness', () => {
    it('should calculate final values correctly for complex scenarios', () => {
      const draggingHoldId = createMockSharedValue('marker-2');
      const dragOffsetX = createMockSharedValue(-25);
      const dragOffsetY = createMockSharedValue(40);
      const resizingHoldId = createMockSharedValue('marker-2');
      const resizeScale = createMockSharedValue(1.2);
      const markerPositions = createMockSharedValue({
        'marker-1': { x: 100, y: 100, r: 20 },
        'marker-2': { x: 200, y: 200, r: 25 },
      });

      coordinateGestureChangesToJsState({
        draggingHoldId,
        dragOffsetX,
        dragOffsetY,
        resizingHoldId,
        resizeScale,
        markerPositions,
        markers: mockMarkers,
        handleMoveHold: mockHandleMoveHold,
        handleResizeHold: mockHandleResizeHold,
      });

      // Verify precise calculations
      expect(markerPositions.value).toEqual({
        'marker-1': { x: 100, y: 100, r: 20 },
        'marker-2': { x: 175, y: 240, r: 30 }, // 200-25, 200+40, 25*1.2
      });

      expect(mockHandleMoveHold).toHaveBeenCalledWith('marker-2', 175, 240);
      expect(mockHandleResizeHold).toHaveBeenCalledWith('marker-2', 30);
    });
  });
});
