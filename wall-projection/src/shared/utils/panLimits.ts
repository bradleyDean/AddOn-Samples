/**
 * Pan limits calculation utilities for zoomable map views
 * 
 * Prevents panning past map boundaries by calculating valid translate ranges
 * based on container dimensions, SVG viewBox, and current zoom scale.
 * 
 * Accounts for letterboxing from preserveAspectRatio="xMidYMid meet"
 */

import type { FrameData } from '../types/map';

/**
 * Calculate pan limits for a zoomable map view
 * 
 * Prevents panning past map boundaries by calculating valid translate ranges
 * based on container dimensions, SVG viewBox, and current zoom scale.
 * 
 * Accounts for letterboxing from preserveAspectRatio="xMidYMid meet"
 * 
 * This function is worklet-compatible and can run on the UI thread for real-time pan limit calculations.
 * 
 * @param containerDims - Container dimensions in screen pixels
 * @param svgViewBox - SVG viewBox dimensions
 * @param scale - Current zoom scale (e.g., 1.0, 1.2, etc.)
 * @returns Object with minTranslateX, maxTranslateX, minTranslateY, maxTranslateY
 */
export function calculatePanLimits(
  containerDims: { width: number; height: number },
  svgViewBox: { width: number; height: number },
  scale: number
): {
  minTranslateX: number;
  maxTranslateX: number;
  minTranslateY: number;
  maxTranslateY: number;
} {
  'worklet'; // Enable worklet mode for UI thread execution
  const containerW = containerDims.width;
  const containerH = containerDims.height;

  // Use the unified letterboxing calculation function
  const { contentW, contentH } = calculateLetterboxedContentWorklet(containerDims, svgViewBox);

  // Calculate scaled content dimensions at the target zoom level
  const scaledContentW = contentW * scale;
  const scaledContentH = contentH * scale;

  // Calculate pan limits
  // When scaled content is smaller than or equal to container, no panning is needed (centered)
  // When scaled content is larger, we can pan within the range that keeps content visible

  let minTranslateX: number;
  let maxTranslateX: number;
  let minTranslateY: number;
  let maxTranslateY: number;

  if (scaledContentW <= containerW) {
    // Content fits within container width - center it (no panning needed)
    // The content will be centered, so translate should be 0 (or minimal for centering)
    minTranslateX = 0;
    maxTranslateX = 0;
  } else {
    // Content is wider than container - calculate pan range
    // At translateX = 0, content is centered, so left edge is at: (containerW - scaledContentW) / 2
    // We can pan left until right edge hits container right: translateX = (scaledContentW - containerW) / 2
    // We can pan right until left edge hits container left: translateX = (containerW - scaledContentW) / 2
    minTranslateX = (containerW - scaledContentW) / 2;
    maxTranslateX = (scaledContentW - containerW) / 2;
  }

  if (scaledContentH <= containerH) {
    // Content fits within container height - center it (no panning needed)
    minTranslateY = 0;
    maxTranslateY = 0;
  } else {
    // Content is taller than container - calculate pan range
    // At translateY = 0, content is centered, so top edge is at: (containerH - scaledContentH) / 2
    // We can pan up until bottom edge hits container bottom: translateY = (scaledContentH - containerH) / 2
    // We can pan down until top edge hits container top: translateY = (containerH - scaledContentH) / 2
    minTranslateY = (containerH - scaledContentH) / 2;
    maxTranslateY = (scaledContentH - containerH) / 2;
  }

  return {
    minTranslateX,
    maxTranslateX,
    minTranslateY,
    maxTranslateY,
  };
}

/**
 * Clamp translate values to pan limits
 * 
 * This function is worklet-compatible and can run on the UI thread for real-time clamping.
 * 
 * @param desiredTranslateX - Desired X translate value
 * @param desiredTranslateY - Desired Y translate value
 * @param limits - Pan limits from calculatePanLimits()
 * @returns Clamped translate values { translateX, translateY }
 */
export function clampPanToLimits(
  desiredTranslateX: number,
  desiredTranslateY: number,
  limits: {
    minTranslateX: number;
    maxTranslateX: number;
    minTranslateY: number;
    maxTranslateY: number;
  }
): { translateX: number; translateY: number } {
  'worklet'; // Enable worklet mode for UI thread execution
  const translateX = Math.max(
    limits.minTranslateX,
    Math.min(limits.maxTranslateX, desiredTranslateX)
  );
  const translateY = Math.max(
    limits.minTranslateY,
    Math.min(limits.maxTranslateY, desiredTranslateY)
  );

  return { translateX, translateY };
}

/**
 * Calculate letterboxed content dimensions and offsets for preserveAspectRatio="xMidYMid meet"
 * 
 * This is a worklet-compatible version of the letterboxing calculation.
 * When the container and SVG viewBox have different aspect ratios, the SVG content
 * is automatically scaled to fit within the container while maintaining its aspect ratio.
 * 
 * This is the CANONICAL source of truth for letterboxing calculations.
 * Both coordinateConversion.ts and panLimits.ts use this function.
 * 
 * @param containerDims - Container dimensions in screen pixels
 * @param svgViewBox - SVG viewBox dimensions
 * @returns Object with letterboxed content dimensions and offsets
 */
export function calculateLetterboxedContentWorklet(
  containerDims: { width: number; height: number },
  svgViewBox: { width: number; height: number }
): {
  contentW: number;
  contentH: number;
  offsetX: number;
  offsetY: number;
} {
  'worklet';
  const containerW = containerDims.width;
  const containerH = containerDims.height;
  const vbW = svgViewBox.width;
  const vbH = svgViewBox.height;

  const containerAR = containerW / containerH;
  const viewBoxAR = vbW / vbH;

  let contentW: number;
  let contentH: number;
  let offsetX = 0;
  let offsetY = 0;

  if (containerAR > viewBoxAR) {
    // Height-limited, pillarbox on sides
    contentH = containerH;
    contentW = contentH * viewBoxAR;
    offsetX = (containerW - contentW) / 2;
  } else {
    // Width-limited, letterbox top/bottom
    contentW = containerW;
    contentH = contentW / viewBoxAR;
    offsetY = (containerH - contentH) / 2;
  }

  return {
    contentW,
    contentH,
    offsetX,
    offsetY,
  };
}

/**
 * Convert SVG coordinates to screen pixel coordinates (worklet-compatible version)
 * 
 * This is the CANONICAL source of truth for SVG-to-screen coordinate conversion.
 * Both coordinateConversion.ts and panLimits.ts use this function.
 * 
 * Worklet-compatible (no console.log statements).
 * Accounts for letterboxing from preserveAspectRatio="xMidYMid meet".
 * 
 * @param xSvg - SVG X coordinate
 * @param ySvg - SVG Y coordinate
 * @param scale - Current zoom scale (e.g., 1.0, 1.5, 2.0)
 * @param translateXScreen - Screen pixel X offset from panning
 * @param translateYScreen - Screen pixel Y offset from panning
 * @param containerDims - Container dimensions in screen pixels
 * @param svgViewBox - SVG viewBox dimensions
 * @returns Screen pixel coordinates { xScreen, yScreen }
 */
export function svgToScreenWorklet(
  xSvg: number,
  ySvg: number,
  scale: number,
  translateXScreen: number,
  translateYScreen: number,
  containerDims: { width: number; height: number },
  svgViewBox: { width: number; height: number }
): { xScreen: number; yScreen: number } {
  'worklet';
  // Calculate letterboxed content dimensions
  const { contentW, contentH, offsetX, offsetY } =
    calculateLetterboxedContentWorklet(containerDims, svgViewBox);
  
  const vbW = svgViewBox.width;
  const vbH = svgViewBox.height;
  const containerW = containerDims.width;
  const containerH = containerDims.height;

  // Map SVG coordinates to letterboxed content area
  const xInContentArea = (xSvg / vbW) * contentW;
  const yInContentArea = (ySvg / vbH) * contentH;
  
  // Position in Animated.View local coordinates (before transform)
  // The content area is positioned at (offsetX, offsetY) within the view
  const xInView = xInContentArea + offsetX;
  const yInView = yInContentArea + offsetY;
  
  // Scale from CONTAINER center (not content center!)
  // This matches how Animated.View applies the scale transform from the view's center
  const containerCenterX = containerW / 2;
  const containerCenterY = containerH / 2;
  const xScaled = containerCenterX + (xInView - containerCenterX) * scale;
  const yScaled = containerCenterY + (yInView - containerCenterY) * scale;
  
  // Apply translate
  const xScreen = xScaled + translateXScreen;
  const yScreen = yScaled + translateYScreen;
  
  return { xScreen, yScreen };
}

/**
 * Calculate pan limits for a frame using screen-space position.
 * 
 * Uses the proven "tx * scale" approach to calculate where the frame would
 * be at different translate values, then finds the limits for both axes.
 * 
 * Key insight: When translate changes by delta, frame position changes by delta * scale
 * (because the Animated.View applies translate AFTER scale).
 * 
 * This function is worklet-compatible for use in gesture handlers.
 * 
 * @param frame - Frame bounds in SVG coordinates (x, y, width, height)
 * @param scale - Current zoom scale
 * @param containerDims - Container dimensions in screen pixels
 * @param svgViewBox - SVG viewBox dimensions
 * @returns All four pan limits: minTranslateX, maxTranslateX, minTranslateY, maxTranslateY
 */
export function calculateFramePanLimits(
  frame: { x: number; y: number; width: number; height: number },
  scale: number,
  containerDims: { width: number; height: number },
  svgViewBox: { width: number; height: number }
): {
  minTranslateX: number;
  maxTranslateX: number;
  minTranslateY: number;
  maxTranslateY: number;
} {
  'worklet';
  
  // === HORIZONTAL LIMITS ===
  // Calculate frame's screen position at tx=0 (base position)
  const frameLeftAtZero = svgToScreenWorklet(
    frame.x, 0, scale, 0, 0, containerDims, svgViewBox
  ).xScreen;
  
  const frameRightAtZero = svgToScreenWorklet(
    frame.x + frame.width, 0, scale, 0, 0, containerDims, svgViewBox
  ).xScreen;
  
  const frameWidth = frameRightAtZero - frameLeftAtZero;
  const containerWidth = containerDims.width;
  
  let minTranslateX: number;
  let maxTranslateX: number;
  
  if (frameWidth <= containerWidth) {
    // Frame fits within container width - no horizontal panning
    minTranslateX = 0;
    maxTranslateX = 0;
  } else {
    // Frame is wider than container - calculate limits
    // 
    // minTranslateX (most negative, limit for panning LEFT):
    //   At minTranslateX, frameRight = containerWidth (right edge at screen right)
    //   frameRightAtZero + minTranslateX * scale = containerWidth
    //   minTranslateX = (containerWidth - frameRightAtZero) / scale  (NEGATIVE)
    //
    // maxTranslateX (most positive, limit for panning RIGHT):
    //   At maxTranslateX, frameLeft = 0 (left edge at screen left)
    //   frameLeftAtZero + maxTranslateX * scale = 0
    //   maxTranslateX = -frameLeftAtZero / scale  (POSITIVE)
    minTranslateX = (containerWidth - frameRightAtZero) / scale;
    maxTranslateX = -frameLeftAtZero / scale;
  }
  
  // === VERTICAL LIMITS ===
  // Calculate frame's screen position at ty=0 (base position)
  const frameTopAtZero = svgToScreenWorklet(
    0, frame.y, scale, 0, 0, containerDims, svgViewBox
  ).yScreen;
  
  const frameBottomAtZero = svgToScreenWorklet(
    0, frame.y + frame.height, scale, 0, 0, containerDims, svgViewBox
  ).yScreen;
  
  const frameHeight = frameBottomAtZero - frameTopAtZero;
  const containerHeight = containerDims.height;
  
  let minTranslateY: number;
  let maxTranslateY: number;
  
  if (frameHeight <= containerHeight) {
    // Frame fits within container height - no vertical panning
    minTranslateY = 0;
    maxTranslateY = 0;
  } else {
    // Frame is taller than container - calculate limits
    //
    // minTranslateY (most negative, limit for panning UP):
    //   At minTranslateY, frameBottom = containerHeight
    //   minTranslateY = (containerHeight - frameBottomAtZero) / scale  (NEGATIVE)
    //
    // maxTranslateY (most positive, limit for panning DOWN):
    //   At maxTranslateY, frameTop = 0
    //   maxTranslateY = -frameTopAtZero / scale  (POSITIVE)
    minTranslateY = (containerHeight - frameBottomAtZero) / scale;
    maxTranslateY = -frameTopAtZero / scale;
  }
  
  return {
    minTranslateX,
    maxTranslateX,
    minTranslateY,
    maxTranslateY,
  };
}

/**
 * Debug helper: Calculate pan limits from frame with detailed debug information
 * 
 * This is a non-worklet function that can be called from the JS thread to get
 * detailed debug information about pan limit calculations.
 * 
 * Uses the same screen-space approach as calculateFramePanLimits.
 * 
 * @param frame - FrameData object defining the map boundaries
 * @param scale - Current zoom scale
 * @param containerDims - Container dimensions in screen pixels
 * @param svgViewBox - SVG viewBox dimensions
 * @param currentTranslateX - Current translateX value (for checking if clamped)
 * @param currentTranslateY - Current translateY value (for checking if clamped)
 * @returns Object with limits and debug information
 */
export function calculatePanLimitsFromFrameDebug(
  frame: FrameData,
  scale: number,
  containerDims: { width: number; height: number },
  svgViewBox: { width: number; height: number },
  currentTranslateX: number,
  currentTranslateY: number
): {
  limits: {
    minTranslateX: number;
    maxTranslateX: number;
    minTranslateY: number;
    maxTranslateY: number;
  };
  debug: {
    // Screen-space frame positions at translate=0
    frameLeftAtZero: number;
    frameRightAtZero: number;
    frameTopAtZero: number;
    frameBottomAtZero: number;
    frameWidth: number;
    frameHeight: number;
    // Container info
    containerW: number;
    containerH: number;
    scale: number;
    // Current state
    currentTranslateX: number;
    currentTranslateY: number;
    isClampedX: boolean;
    isClampedY: boolean;
    // Derived states
    frameFitsWidth: boolean;
    frameFitsHeight: boolean;
  };
} {
  // Calculate limits using the worklet function
  const limits = calculateFramePanLimits(frame, scale, containerDims, svgViewBox);
  
  const containerW = containerDims.width;
  const containerH = containerDims.height;
  
  // Calculate frame positions for debug output
  const frameLeftAtZero = svgToScreenWorklet(
    frame.x, 0, scale, 0, 0, containerDims, svgViewBox
  ).xScreen;
  const frameRightAtZero = svgToScreenWorklet(
    frame.x + frame.width, 0, scale, 0, 0, containerDims, svgViewBox
  ).xScreen;
  const frameTopAtZero = svgToScreenWorklet(
    0, frame.y, scale, 0, 0, containerDims, svgViewBox
  ).yScreen;
  const frameBottomAtZero = svgToScreenWorklet(
    0, frame.y + frame.height, scale, 0, 0, containerDims, svgViewBox
  ).yScreen;
  
  const frameWidth = frameRightAtZero - frameLeftAtZero;
  const frameHeight = frameBottomAtZero - frameTopAtZero;
  
  // Check if current translate is clamped
  const isClampedX = currentTranslateX < limits.minTranslateX || currentTranslateX > limits.maxTranslateX;
  const isClampedY = currentTranslateY < limits.minTranslateY || currentTranslateY > limits.maxTranslateY;
  
  return {
    limits,
    debug: {
      // Screen-space frame positions at translate=0
      frameLeftAtZero,
      frameRightAtZero,
      frameTopAtZero,
      frameBottomAtZero,
      frameWidth,
      frameHeight,
      // Container info
      containerW,
      containerH,
      scale,
      // Current state
      currentTranslateX,
      currentTranslateY,
      isClampedX,
      isClampedY,
      // Derived states
      frameFitsWidth: frameWidth <= containerW,
      frameFitsHeight: frameHeight <= containerH,
    },
  };
}
