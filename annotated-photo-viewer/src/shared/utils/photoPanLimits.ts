/**
 * Pan limits calculation utilities for photo views
 * 
 * Prevents panning beyond photo boundaries when zoomed in.
 * Works with ImageBounds from useImageBounds hook.
 * 
 * Simpler than map pan limits since we're already working in
 * container/screen coordinates (no SVG coordinate conversion needed).
 */

/**
 * Calculate pan limits for a photo displayed with resizeMode="contain".
 * 
 * Prevents panning beyond the image edges when zoomed in.
 * Uses the same mathematical approach as map pan limits, but simplified
 * since we're already working in screen/container coordinates.
 * 
 * When scale > 1, the scaled image is larger than its original display size.
 * Pan limits ensure the user can't pan so far that blank space appears.
 * 
 * @param imageBounds - The calculated image display bounds (from useImageBounds)
 * @param containerDims - Container dimensions in pixels
 * @param scale - Current zoom scale (1.0 = fit-to-container)
 * @returns Pan limits for both axes
 */
export function calculatePhotoPanLimits(
  imageBounds: { width: number; height: number },
  containerDims: { width: number; height: number },
  scale: number
): {
  minTranslateX: number;
  maxTranslateX: number;
  minTranslateY: number;
  maxTranslateY: number;
} {
  'worklet';
  
  const containerW = containerDims.width;
  const containerH = containerDims.height;
  
  // At scale S, the image display dimensions become:
  const scaledContentW = imageBounds.width * scale;
  const scaledContentH = imageBounds.height * scale;
  
  let minTranslateX: number;
  let maxTranslateX: number;
  let minTranslateY: number;
  let maxTranslateY: number;
  
  // Horizontal limits
  if (scaledContentW <= containerW) {
    // Image width fits within container - no horizontal panning
    minTranslateX = 0;
    maxTranslateX = 0;
  } else {
    minTranslateX = (containerW - scaledContentW) / 2;  // negative
    maxTranslateX = (scaledContentW - containerW) / 2;  // positive
  }
  
  // Vertical limits (same logic)
  if (scaledContentH <= containerH) {
    // Image height fits within container - no vertical panning
    minTranslateY = 0;
    maxTranslateY = 0;
  } else {
    // Image is taller than container - calculate limits
    minTranslateY = (containerH - scaledContentH) / 2;  // negative
    maxTranslateY = (scaledContentH - containerH) / 2;  // positive
  }
  
  return { minTranslateX, maxTranslateX, minTranslateY, maxTranslateY };
}

/**
 * Clamp translate values to pan limits (worklet-compatible).
 * 
 * @param desiredTx - Desired translateX value
 * @param desiredTy - Desired translateY value
 * @param limits - Pan limits from calculatePhotoPanLimits
 * @returns Clamped translate values
 */
export function clampPhotoPan(
  desiredTx: number,
  desiredTy: number,
  limits: {
    minTranslateX: number;
    maxTranslateX: number;
    minTranslateY: number;
    maxTranslateY: number;
  }
): { translateX: number; translateY: number } {
  'worklet';
  return {
    translateX: Math.max(limits.minTranslateX, Math.min(limits.maxTranslateX, desiredTx)),
    translateY: Math.max(limits.minTranslateY, Math.min(limits.maxTranslateY, desiredTy)),
  };
}

