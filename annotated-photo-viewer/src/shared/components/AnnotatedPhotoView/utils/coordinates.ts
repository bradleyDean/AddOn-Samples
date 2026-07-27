/**
 * Coordinate Conversion Utilities for AnnotatedPhotoView
 *
 * These utilities handle the conversion between different coordinate systems:
 * - Container coordinates: Pixel positions within the view container
 * - Normalized coordinates: Fractions (0-1) relative to image dimensions
 * - Image pixel coordinates: Pixel positions in original image space
 *
 * The key insight is that when an image is displayed with resizeMode="contain",
 * it may have letterboxing (black bars top/bottom) or pillarboxing (black bars left/right).
 * These utilities account for that offset when converting coordinates.
 */

import type { ImageBounds, NormalizedPoint, ContainerPoint } from '../types';

/**
 * Calculate the actual display bounds of an image within a container
 * when using resizeMode="contain".
 *
 * With resizeMode="contain", the image is scaled to fit entirely within
 * the container while maintaining aspect ratio. This may result in:
 * - Letterboxing (top/bottom padding) if image is wider than container
 * - Pillarboxing (left/right padding) if image is taller than container
 *
 * @param containerWidth - Width of the container in pixels
 * @param containerHeight - Height of the container in pixels
 * @param imageWidth - Original width of the image in pixels
 * @param imageHeight - Original height of the image in pixels
 * @returns ImageBounds describing where the image actually renders
 *
 * @example
 * // 1000x500 image in 400x400 container
 * // Image is wider, so it gets letterboxed (bars top/bottom)
 * calculateImageBounds(400, 400, 1000, 500)
 * // Returns: { left: 0, top: 100, width: 400, height: 200 }
 *
 * @example
 * // 500x1000 image in 400x400 container
 * // Image is taller, so it gets pillarboxed (bars left/right)
 * calculateImageBounds(400, 400, 500, 1000)
 * // Returns: { left: 100, top: 0, width: 200, height: 400 }
 */
export function calculateImageBounds(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): ImageBounds {
  // Handle edge cases
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight };
  }

  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageWidth / imageHeight;

  if (imageAspect > containerAspect) {
    // Image is wider than container - fit to width (letterbox top/bottom)
    const displayWidth = containerWidth;
    const displayHeight = containerWidth / imageAspect;
    return {
      left: 0,
      top: (containerHeight - displayHeight) / 2,
      width: displayWidth,
      height: displayHeight,
    };
  } else {
    // Image is taller than container - fit to height (pillarbox left/right)
    const displayHeight = containerHeight;
    const displayWidth = containerHeight * imageAspect;
    return {
      left: (containerWidth - displayWidth) / 2,
      top: 0,
      width: displayWidth,
      height: displayHeight,
    };
  }
}

/**
 * Convert container pixel coordinates to normalized (0-1) image coordinates.
 *
 * This function accounts for letterbox/pillarbox offset, so a tap in the
 * center of the visible image will convert to (0.5, 0.5) regardless of
 * where the image is positioned within the container.
 *
 * @param containerX - X position in container pixels
 * @param containerY - Y position in container pixels
 * @param imageBounds - The calculated image bounds within the container
 * @returns Normalized point (0-1 range, may be outside 0-1 if tap is in letterbox area)
 *
 * @example
 * const bounds = { left: 0, top: 100, width: 400, height: 200 };
 * containerToNormalized(200, 200, bounds)
 * // Returns: { x: 0.5, y: 0.5 } (center of image)
 */
export function containerToNormalized(
  containerX: number,
  containerY: number,
  imageBounds: ImageBounds
): NormalizedPoint {
  // Handle edge case of zero-size bounds
  if (imageBounds.width === 0 || imageBounds.height === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: (containerX - imageBounds.left) / imageBounds.width,
    y: (containerY - imageBounds.top) / imageBounds.height,
  };
}

/**
 * Convert normalized (0-1) image coordinates to container pixel coordinates.
 *
 * This is the inverse of containerToNormalized. Useful for:
 * - Hit detection (convert marker position to container space for gesture comparison)
 * - Debugging (visualize normalized positions in container space)
 *
 * @param normalizedX - X position as fraction of image width (0-1)
 * @param normalizedY - Y position as fraction of image height (0-1)
 * @param imageBounds - The calculated image bounds within the container
 * @returns Container pixel coordinates
 *
 * @example
 * const bounds = { left: 0, top: 100, width: 400, height: 200 };
 * normalizedToContainer(0.5, 0.5, bounds)
 * // Returns: { x: 200, y: 200 } (center of visible image in container)
 */
export function normalizedToContainer(
  normalizedX: number,
  normalizedY: number,
  imageBounds: ImageBounds
): ContainerPoint {
  return {
    x: normalizedX * imageBounds.width + imageBounds.left,
    y: normalizedY * imageBounds.height + imageBounds.top,
  };
}

/**
 * Convert a pixel radius (in container space) to normalized radius.
 *
 * Radius is normalized relative to image WIDTH for consistency.
 * This means a radius of 0.1 will appear as 10% of the image width.
 *
 * @param pixelRadius - Radius in container pixels
 * @param imageBounds - The calculated image bounds
 * @returns Normalized radius (fraction of image width)
 *
 * @example
 * const bounds = { left: 0, top: 0, width: 400, height: 600 };
 * pixelRadiusToNormalized(40, bounds)
 * // Returns: 0.1 (10% of image width)
 */
export function pixelRadiusToNormalized(
  pixelRadius: number,
  imageBounds: ImageBounds
): number {
  if (imageBounds.width === 0) {
    return 0;
  }
  return pixelRadius / imageBounds.width;
}

/**
 * Convert a normalized radius to pixel radius (in container space).
 *
 * @param normalizedRadius - Radius as fraction of image width
 * @param imageBounds - The calculated image bounds
 * @returns Radius in container pixels
 */
export function normalizedRadiusToPixel(
  normalizedRadius: number,
  imageBounds: ImageBounds
): number {
  return normalizedRadius * imageBounds.width;
}

/**
 * Check if a normalized point is within the valid image area (0-1 range).
 *
 * Points outside this range are in the letterbox/pillarbox area.
 *
 * @param point - Normalized point to check
 * @returns true if point is within image bounds
 */
export function isPointInImage(point: NormalizedPoint): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

/**
 * Clamp a normalized point to the valid image area (0-1 range).
 *
 * Useful for constraining marker positions to stay within the image.
 *
 * @param point - Normalized point to clamp
 * @returns Clamped point with x and y in [0, 1] range
 */
export function clampPointToImage(point: NormalizedPoint): NormalizedPoint {
  return {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  };
}

/**
 * Check if a normalized point is inside a normalized circle (marker).
 *
 * Used for hit detection when determining if a tap hit a marker.
 *
 * @param tapX - Tap X position (normalized)
 * @param tapY - Tap Y position (normalized)
 * @param circleX - Circle center X (normalized)
 * @param circleY - Circle center Y (normalized)
 * @param circleR - Circle radius (normalized, relative to width)
 * @param imageAspect - Image aspect ratio (width/height), needed to adjust Y comparison
 * @returns true if the tap is inside the circle
 */
export function isInsideNormalizedCircle(
  tapX: number,
  tapY: number,
  circleX: number,
  circleY: number,
  circleR: number,
  imageAspect: number
): boolean {
  // Since radius is normalized to width, we need to adjust Y distance
  // to account for non-square images
  const dx = tapX - circleX;
  const dy = (tapY - circleY) * imageAspect; // Scale Y to match X units
  const distanceSquared = dx * dx + dy * dy;
  return distanceSquared <= circleR * circleR;
}

