import 'react-native-reanimated';

export function isInsideCircle(
  x: number,
  y: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  'worklet';
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

export function tapIsInCircularHoldMarker(
  tapX: number,
  tapY: number,
  marker: { x: number; y: number; r: number }
): boolean {
  return isInsideCircle(tapX, tapY, marker.x, marker.y, marker.r);
}

export function tapIsInAnyMarker(
  tapX: number,
  tapY: number,
  markers: { x: number; y: number; r: number }[]
): boolean {
  return markers.some(marker => tapIsInCircularHoldMarker(tapX, tapY, marker));
}

export function tapIsInSelectedMarker(
  tapX: number,
  tapY: number,
  markers: { x: number; y: number; r: number; selected?: boolean }[]
): boolean {
  const selectedMarker = markers.find(marker => marker.selected);
  return selectedMarker ? tapIsInCircularHoldMarker(tapX, tapY, selectedMarker) : false;
}

/**
 * Check if a tap point (in SVG coordinates) is within a route pin's radius
 * @param tapX - Tap X coordinate in SVG space
 * @param tapY - Tap Y coordinate in SVG space
 * @param pinX - Pin center X coordinate in SVG space
 * @param pinY - Pin center Y coordinate in SVG space
 * @param pinRadius - Pin radius
 * @returns true if tap is within pin radius
 */
export function tapIsInRoutePin(
  tapX: number,
  tapY: number,
  pinX: number,
  pinY: number,
  pinRadius: number
): boolean {
  return isInsideCircle(tapX, tapY, pinX, pinY, pinRadius);
}

 /** 
 * @param rawScale - The pinch scale from RNGH (usually around 1.0 ± 0.5)
 * @param sensitivity - A multiplier in [0, 1]; smaller = slower scaling (default: 0.3)
 * @returns A moderated scale factor centered around 1.0
 *
 * Example:
 *   applyScaleDampening(1.5, 0.3) → 1.15
 *   applyScaleDampening(0.5, 0.3) → 0.85
 */
export function applyScaleDampening(rawScale: number, sensitivity: number = 0.3): number {
  return 1 + (rawScale - 1) * sensitivity;
}

/** 
 * Worklet version of applyScaleDampening for UI-thread execution
 * @param rawScale - The pinch scale from RNGH (usually around 1.0 ± 0.5)
 * @param sensitivity - A multiplier in [0, 1]; smaller = slower scaling (default: 0.3)
 * @returns A moderated scale factor centered around 1.0
 */
export function applyScaleDampeningWorklet(rawScale: number, sensitivity: number = 0.3): number {
  'worklet';
  return 1 + (rawScale - 1) * sensitivity;
}