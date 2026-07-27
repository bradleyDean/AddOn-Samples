/**
 * Coordinate conversion utilities for converting between screen pixel coordinates
 * and SVG coordinate space.
 * 
 * This module wraps the canonical worklet functions from panLimits.ts,
 * adding debug logging for development purposes.
 * 
 * IMPORTANT: The core coordinate conversion logic lives in panLimits.ts.
 * This file provides JS-thread wrappers with console.log statements.
 * If you need to fix a bug in the conversion logic, fix it in panLimits.ts!
 * 
 * Note: screenToSvg does not account for zoom/pan transforms because the GestureDetector
 * and SVG share the same transform context within ZoomableView.
 */

import {
  calculateLetterboxedContentWorklet,
  svgToScreenWorklet,
} from './panLimits';

/**
 * Calculate letterboxed content dimensions with additional aspect ratio info
 * 
 * This wraps the canonical worklet function and adds aspect ratio values
 * for debugging purposes.
 * 
 * @param containerDims - Container dimensions in screen pixels
 * @param svgViewBox - SVG viewBox dimensions
 * @returns Object with letterboxed content dimensions, offsets, and aspect ratios
 */
function calculateLetterboxedContent(
  containerDims: { width: number; height: number },
  svgViewBox: { width: number; height: number }
): {
  contentW: number;
  contentH: number;
  offsetX: number;
  offsetY: number;
  containerAR: number;
  viewBoxAR: number;
} {
  // Use the canonical worklet function
  const result = calculateLetterboxedContentWorklet(containerDims, svgViewBox);
  
  // Add aspect ratio values for debugging (not needed by worklet)
  const containerAR = containerDims.width / containerDims.height;
  const viewBoxAR = svgViewBox.width / svgViewBox.height;

  return {
    ...result,
    containerAR,
    viewBoxAR,
  };
}

/**
 * Convert screen pixel coordinates to SVG coordinates
 * 
 * Note: This function does not account for zoom/pan transforms because the GestureDetector
 * and SVG share the same transform context within ZoomableView, so their relative
 * relationship remains consistent even when scaled/translated.
 * 
 * @param xScreen - Screen pixel X coordinate
 * @param yScreen - Screen pixel Y coordinate
 * @param containerDims - Container dimensions in screen pixels
 * @param svgViewBox - SVG viewBox dimensions
 * @returns SVG coordinates { xSvg, ySvg, debugCenters }
 */
export function screenToSvg(
  xScreen: number,
  yScreen: number,
  containerDims: { width: number; height: number },
  svgViewBox: { width: number; height: number }
): { 
  xSvg: number; 
  ySvg: number;
  debugCenters: {
    containerCenter: { x: number; y: number };
    contentCenter: { x: number; y: number };
  };
} {
  // Use the canonical letterboxing calculation
  const { contentW, contentH, offsetX, offsetY, containerAR, viewBoxAR } =
    calculateLetterboxedContent(containerDims, svgViewBox);
  
  const containerW = containerDims.width;
  const containerH = containerDims.height;
  const vbW = svgViewBox.width;
  const vbH = svgViewBox.height;

  // Gesture coordinates from React Native Gesture Handler are relative to the 
  // GestureDetector's coordinate space (layout bounds of the transformed view).
  // 
  // Key insight: The GestureDetector and SVG are both children of the same
  // transformed ZoomableView. Since they share the same transform context,
  // their relative relationship remains consistent even when scaled/translated.
  // Therefore, we only need to apply letterboxing and map to SVG space -
  // no inverse scaling is needed!
  
  // Apply letterboxing and map directly to SVG space (no inverse scaling)
  const contentRelativeX = xScreen - offsetX;
  const contentRelativeY = yScreen - offsetY;
  
  // Map directly to SVG space (no inverse scaling needed)
  const unscaledContentX = contentRelativeX;
  const unscaledContentY = contentRelativeY;

  // Debug logging removed - use dev mode toggle in settings if needed

  // Map from content space to SVG viewBox space
  const xSvg = (unscaledContentX / contentW) * vbW;
  const ySvg = (unscaledContentY / contentH) * vbH;

  // Calculate debug center points in SVG space for visualization
  const containerCenterXSvg = ((containerW / 2 - offsetX) / contentW) * vbW;
  const containerCenterYSvg = ((containerH / 2 - offsetY) / contentH) * vbH;
  const contentCenterXSvg = ((offsetX + contentW / 2 - offsetX) / contentW) * vbW;
  const contentCenterYSvg = ((offsetY + contentH / 2 - offsetY) / contentH) * vbH;

  // Debug logging removed - use dev mode toggle in settings if needed

  return { 
    xSvg, 
    ySvg,
    // Debug centers in SVG space (for visualization)
    debugCenters: {
      containerCenter: { x: containerCenterXSvg, y: containerCenterYSvg },
      contentCenter: { x: contentCenterXSvg, y: contentCenterYSvg },
    },
  };
}

/**
 * Convert SVG coordinates to screen pixel coordinates
 * 
 * This is a wrapper around the canonical svgToScreenWorklet function,
 * adding console.log statements for debugging.
 * 
 * Accounts for letterboxing from preserveAspectRatio="xMidYMid meet".
 * The SVG content is automatically scaled and centered within the container,
 * which may result in letterboxing (black bars) on one dimension if aspect ratios don't match.
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
export function svgToScreen(
  xSvg: number,
  ySvg: number,
  scale: number,
  translateXScreen: number,
  translateYScreen: number,
  containerDims: { width: number; height: number },
  svgViewBox: { width: number; height: number }
): { xScreen: number; yScreen: number } {
  // Debug logging removed - use dev mode toggle in settings if needed

  // Use the canonical worklet function for the actual conversion
  // All zoom/letterbox logic is centralized in svgToScreenWorklet (panLimits.ts)
  const result = svgToScreenWorklet(
    xSvg,
    ySvg,
    scale,
    translateXScreen,
    translateYScreen,
    containerDims,
    svgViewBox
  );

  // Debug logging removed - use dev mode toggle in settings if needed
  
  return result;
}
