/**
 * Gesture coordination utilities for route editor
 * Handles complex gesture state management and coordination
 */

import { runOnJS } from 'react-native-reanimated';
import { HoldMarker } from '../../../shared/types/holds';

/**
 * Coordinates multiple simultaneous gesture changes and commits them to JS-thread state.
 * 
 * Why this is critical:
 * 1. Without JS state commits: Visual feedback disappears when gestures end, causing markers to "snap back" to original positions/sizes
 * 2. Without coordination: Simultaneous gestures (drag + resize) overwrite each other's changes, causing visual glitches where markers flash at wrong positions with wrong sizes
 * 
 * This function ensures smooth, consistent visual transitions by merging all active gesture changes into a single coordinated update.
 * 
 * @param params - Object containing all necessary parameters for coordination
 */
export function coordinateGestureChangesToJsState(params: {
  // Gesture state
  draggingHoldId: { value: string | null };
  dragOffsetX: { value: number };
  dragOffsetY: { value: number };
  resizingHoldId: { value: string | null };
  resizeScale: { value: number };
  markerPositions: { value: Record<string, { x: number; y: number; r: number }> };
  
  // Data
  markers: HoldMarker[];
  
  // JS-thread handlers
  handleMoveHold: (id: string, newX: number, newY: number) => void;
  handleResizeHold: (id: string, newRadius: number) => void;
}) {
  'worklet';
  
  const {
    draggingHoldId,
    dragOffsetX,
    dragOffsetY,
    resizingHoldId,
    resizeScale,
    markerPositions,
    markers,
    handleMoveHold,
    handleResizeHold,
  } = params;

  // Check which gestures were active
  const wasDragging = draggingHoldId.value !== null;
  const wasResizing = resizingHoldId.value !== null;
  
  if (wasDragging || wasResizing) {
    const markerId = draggingHoldId.value || resizingHoldId.value;
    
    if (markerId) {
      const marker = markers.find(m => m.id === markerId);
      
      if (marker) {
        const currentData = markerPositions.value[markerId] || { x: marker.x, y: marker.y, r: marker.r };
        
        // Calculate final values based on what was active
        const finalX = wasDragging ? marker.x + dragOffsetX.value : currentData.x;
        const finalY = wasDragging ? marker.y + dragOffsetY.value : currentData.y;
        const finalR = wasResizing ? Math.max(10, Math.min(100, marker.r * resizeScale.value)) : currentData.r;
        
        // Single coordinated update
        markerPositions.value = {
          ...markerPositions.value,
          [markerId]: { x: finalX, y: finalY, r: finalR }
        };
        
        // Commit to JS thread
        if (wasDragging) runOnJS(handleMoveHold)(markerId, finalX, finalY);
        if (wasResizing) runOnJS(handleResizeHold)(markerId, finalR);
      }
    }
  }
  
  // Reset all gesture states
  draggingHoldId.value = null;
  dragOffsetX.value = 0;
  dragOffsetY.value = 0;
  resizingHoldId.value = null;
  resizeScale.value = 1;
}
