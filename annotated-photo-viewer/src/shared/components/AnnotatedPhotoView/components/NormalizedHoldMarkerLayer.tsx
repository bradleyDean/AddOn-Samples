/**
 * NormalizedHoldMarkerLayer
 *
 * Renders hold markers using normalized (0-1) coordinates.
 * Uses an SVG viewBox of "0 0 1 1" with preserveAspectRatio="none" to map
 * normalized coordinates directly to the display area.
 *
 * The parent component is responsible for:
 * 1. Measuring the container and computing imageBounds
 * 2. Positioning this layer to exactly cover the visible image area
 *
 * This layer handles:
 * - Rendering markers at normalized positions
 * - Real-time drag/resize feedback via shared values
 * - Gesture handling for marker interactions
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { HoldMarker } from '../../../types/holds';
import { getHoldColor } from '../../../utils/visualMaps';
import type { ImageBounds } from '../types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Configuration for normalized marker rendering.
 * All stroke widths are normalized to image width (0-1 scale).
 */
export interface NormalizedMarkerConfig {
  /** Stroke width as fraction of image width (e.g., 0.006 = 0.6%) */
  strokeWidthNormalized: number;
  /** Selection ring offset as fraction of image width */
  selectionOffsetNormalized: number;
  /** Selection ring stroke width as fraction of image width */
  selectionStrokeWidthNormalized: number;
  /** SVG dash pattern for selection ring */
  selectionDashPattern: string;
}

export const DEFAULT_NORMALIZED_MARKER_CONFIG: NormalizedMarkerConfig = {
  strokeWidthNormalized: 0.006, // 0.6% of image width
  selectionOffsetNormalized: 0.008, // 0.8% of image width
  selectionStrokeWidthNormalized: 0.004, // 0.4% of image width
  selectionDashPattern: '0.02 0.01', // Normalized dash pattern
};

interface AnimatedMarkerProps {
  marker: HoldMarker;
  draggingHoldId?: any;
  dragOffsetX?: any;
  dragOffsetY?: any;
  resizingHoldId?: any;
  resizeScale?: any;
  markerPositions?: any;
  config: NormalizedMarkerConfig;
  imageAspect: number;
}

/**
 * Selection overlay ring for selected markers.
 */
const SelectionOverlay: React.FC<AnimatedMarkerProps> = ({
  marker,
  draggingHoldId,
  dragOffsetX,
  dragOffsetY,
  resizingHoldId,
  resizeScale,
  markerPositions,
  config,
  imageAspect,
}) => {
  // Scale factor to convert normalized y (0-1) to viewBox y (0 to 1/imageAspect)
  const yScale = 1 / imageAspect;

  const animatedProps = useAnimatedProps(() => {
    const isDragging = draggingHoldId?.value === marker.id;
    const isResizing = resizingHoldId?.value === marker.id;
    const currentData = markerPositions?.value?.[marker.id] || {
      x: marker.x,
      y: marker.y,
      r: marker.r,
    };

    const x = isDragging ? currentData.x + (dragOffsetX?.value || 0) : currentData.x;
    const normalizedY = isDragging ? currentData.y + (dragOffsetY?.value || 0) : currentData.y;
    // Scale y to match the viewBox coordinate system
    const y = normalizedY * yScale;
    const radius = isResizing
      ? currentData.r * (resizeScale?.value || 1)
      : currentData.r;

    return {
      cx: x,
      cy: y,
      r: radius + config.selectionOffsetNormalized,
    };
  });

  return (
    <AnimatedCircle
      animatedProps={animatedProps}
      stroke="white"
      strokeWidth={config.selectionStrokeWidthNormalized}
      strokeDasharray={config.selectionDashPattern}
      fill="none"
    />
  );
};

/**
 * Individual animated marker circle.
 */
const AnimatedMarker: React.FC<AnimatedMarkerProps> = ({
  marker,
  draggingHoldId,
  dragOffsetX,
  dragOffsetY,
  resizingHoldId,
  resizeScale,
  markerPositions,
  config,
  imageAspect,
}) => {
  const color = getHoldColor(marker.type);
  // Scale factor to convert normalized y (0-1) to viewBox y (0 to 1/imageAspect)
  const yScale = 1 / imageAspect;

  const animatedProps = useAnimatedProps(() => {
    const isDragging = draggingHoldId?.value === marker.id;
    const isResizing = resizingHoldId?.value === marker.id;
    const currentData = markerPositions?.value?.[marker.id] || {
      x: marker.x,
      y: marker.y,
      r: marker.r,
    };

    const x = isDragging ? currentData.x + (dragOffsetX?.value || 0) : currentData.x;
    const normalizedY = isDragging ? currentData.y + (dragOffsetY?.value || 0) : currentData.y;
    // Scale y to match the viewBox coordinate system
    const y = normalizedY * yScale;
    const radius = isResizing
      ? currentData.r * (resizeScale?.value || 1)
      : currentData.r;

    return {
      cx: x,
      cy: y,
      r: radius,
    };
  });

  // Separate animatedProps for white shadow (larger radius) - only for start markers
  const shadowAnimatedProps = useAnimatedProps(() => {
    const isDragging = draggingHoldId?.value === marker.id;
    const isResizing = resizingHoldId?.value === marker.id;
    const currentData = markerPositions?.value?.[marker.id] || {
      x: marker.x,
      y: marker.y,
      r: marker.r,
    };

    const x = isDragging ? currentData.x + (dragOffsetX?.value || 0) : currentData.x;
    const normalizedY = isDragging ? currentData.y + (dragOffsetY?.value || 0) : currentData.y;
    // Scale y to match the viewBox coordinate system
    const y = normalizedY * yScale;
    const radius = isResizing
      ? currentData.r * (resizeScale?.value || 1)
      : currentData.r;

    return {
      cx: x,
      cy: y,
      r: radius + 0.002, // Larger normalized radius for shadow effect
    };
  });

  return (
    <>
      {/* White shadow circle for start holds - renders behind green circle */}
      {marker.type === 'start' && (
        <AnimatedCircle
          animatedProps={shadowAnimatedProps}
          stroke="white"
          strokeWidth={config.strokeWidthNormalized + 0.001}
          fill="none"
          opacity={0.7}
        />
      )}
      {/* Base marker circle */}
      <AnimatedCircle
        animatedProps={animatedProps}
        stroke={color}
        strokeWidth={config.strokeWidthNormalized}
        fill="none"
      />
      {/* Selection overlay when selected */}
      {marker.selected && (
        <SelectionOverlay
          marker={marker}
          draggingHoldId={draggingHoldId}
          dragOffsetX={dragOffsetX}
          dragOffsetY={dragOffsetY}
          resizingHoldId={resizingHoldId}
          resizeScale={resizeScale}
          markerPositions={markerPositions}
          config={config}
          imageAspect={imageAspect}
        />
      )}
    </>
  );
};

export interface NormalizedHoldMarkerLayerProps {
  markers: HoldMarker[];
  imageBounds: ImageBounds;
  imageAspect: number; // width / height
  gesture?: any;
  draggingHoldId?: any;
  dragOffsetX?: any;
  dragOffsetY?: any;
  resizingHoldId?: any;
  resizeScale?: any;
  markerPositions?: any;
  config?: NormalizedMarkerConfig;
}

/**
 * NormalizedHoldMarkerLayer renders markers in normalized coordinate space.
 *
 * The layer is positioned to exactly cover the visible image area using
 * the provided imageBounds. The SVG uses a viewBox of "0 0 1 1" so that
 * normalized marker coordinates map directly to the visible area.
 */
const NormalizedHoldMarkerLayer: React.FC<NormalizedHoldMarkerLayerProps> = ({
  markers,
  imageBounds,
  imageAspect,
  gesture,
  draggingHoldId,
  dragOffsetX,
  dragOffsetY,
  resizingHoldId,
  resizeScale,
  markerPositions,
  config = DEFAULT_NORMALIZED_MARKER_CONFIG,
}) => {
  // Position layer to cover exactly the image area (not letterbox/pillarbox)
  const layerStyle = React.useMemo(
    () => ({
      position: 'absolute' as const,
      left: imageBounds.left,
      top: imageBounds.top,
      width: imageBounds.width,
      height: imageBounds.height,
    }),
    [imageBounds]
  );

  // Use a viewBox that matches the image aspect ratio to prevent circle stretching
  // For a portrait image (aspect < 1), the viewBox height is > 1
  // For a landscape image (aspect > 1), the viewBox height is < 1
  const viewBoxHeight = 1 / imageAspect;

  const content = (
    <View collapsable={false} style={layerStyle}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 1 ${viewBoxHeight}`}
        preserveAspectRatio="none"
      >
        {markers.map((marker) => (
          <AnimatedMarker
            key={marker.id}
            marker={marker}
            draggingHoldId={draggingHoldId}
            dragOffsetX={dragOffsetX}
            dragOffsetY={dragOffsetY}
            resizingHoldId={resizingHoldId}
            resizeScale={resizeScale}
            markerPositions={markerPositions}
            config={config}
            imageAspect={imageAspect}
          />
        ))}
      </Svg>
    </View>
  );

  if (gesture) {
    return <GestureDetector gesture={gesture}>{content}</GestureDetector>;
  }

  return content;
};

export default NormalizedHoldMarkerLayer;

