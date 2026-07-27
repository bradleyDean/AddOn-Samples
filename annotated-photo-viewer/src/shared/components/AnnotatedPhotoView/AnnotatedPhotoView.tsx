/**
 * AnnotatedPhotoView
 *
 * A unified component for displaying photos with hold marker annotations.
 * Supports view mode (read-only) with optional zoom/pan capabilities.
 *
 * Uses normalized (0-1) coordinates for markers, ensuring consistent
 * positioning across different screen sizes and aspect ratios.
 */

import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { HoldMarker, AnnotatedRoutePhoto } from '../../types/holds';
import { getHoldColor } from '../../utils/visualMaps';
import { calculatePhotoPanLimits, clampPhotoPan } from '../../utils/photoPanLimits';
import { useImageBounds } from './hooks/useImageBounds';
import type { ImageBounds } from './types';

// ============================================================
// Configuration
// ============================================================

export interface AnnotatedPhotoViewConfig {
  /** Minimum zoom scale */
  minScale: number;
  /** Maximum zoom scale */
  maxScale: number;
  /** Stroke width for markers (normalized, fraction of image width) */
  strokeWidthNormalized: number;
  /** Background color for the photo area */
  backgroundColor: string;
}

export const DEFAULT_ANNOTATED_PHOTO_VIEW_CONFIG: AnnotatedPhotoViewConfig = {
  minScale: 1.0,
  maxScale: 5.0,
  strokeWidthNormalized: 0.006,
  backgroundColor: '#000',
};

// ============================================================
// Props
// ============================================================

export interface AnnotatedPhotoViewProps {
  /** The photo to display with markers */
  photo: AnnotatedRoutePhoto;
  /**
   * Resolved image URI to render (e.g. a cache-first `file://` path from
   * `useCachedPhotoUri`). When provided, it takes precedence over the photo's
   * own `cloudUri`/`localUri`. When omitted, falls back to deriving the URI from
   * the photo (preserves behavior for callers that don't resolve via the cache).
   */
  uri?: string;
  /** Enable pinch-to-zoom (default: true) */
  enableZoom?: boolean;
  /** Enable pan gestures (default: true) */
  enablePan?: boolean;
  /** Show only start holds (useful for thumbnails) */
  showOnlyStartHolds?: boolean;
  /** Callback when the view is tapped (useful for thumbnails) */
  onTap?: () => void;
  /** Configuration overrides */
  config?: Partial<AnnotatedPhotoViewConfig>;
  /** Style for the container */
  style?: any;
}

// ============================================================
// Static Marker Component
// ============================================================

interface StaticMarkerProps {
  marker: HoldMarker;
  yScale: number;
  strokeWidth: number;
}

const StaticMarker: React.FC<StaticMarkerProps> = ({ marker, yScale, strokeWidth }) => {
  const color = getHoldColor(marker.type);

  return (
    <>
      {/* White shadow circle for start holds - renders behind green circle */}
      {marker.type === 'start' && (
        <Circle
          cx={marker.x}
          cy={marker.y * yScale}
          r={marker.r + 0.002}
          stroke="white"
          strokeWidth={strokeWidth + 0.001}
          fill="none"
          opacity={0.7}
        />
      )}
      {/* Base marker */}
    <Circle
      cx={marker.x}
      cy={marker.y * yScale}
      r={marker.r}
      stroke={color}
      strokeWidth={strokeWidth}
      fill="none"
    />
    </>
  );
};

// ============================================================
// Marker Overlay Layer
// ============================================================

interface MarkerOverlayProps {
  markers: HoldMarker[];
  imageBounds: ImageBounds;
  imageAspect: number;
  strokeWidth: number;
}

const MarkerOverlay: React.FC<MarkerOverlayProps> = ({
  markers,
  imageBounds,
  imageAspect,
  strokeWidth,
}) => {
  // Use viewBox that matches image aspect ratio to prevent stretching
  const viewBoxHeight = 1 / imageAspect;
  const yScale = viewBoxHeight; // Scale y-coordinates to match viewBox

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

  return (
    <View style={layerStyle} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 1 ${viewBoxHeight}`}
        preserveAspectRatio="none"
      >
        {markers.map((marker) => (
          <StaticMarker
            key={marker.id}
            marker={marker}
            yScale={yScale}
            strokeWidth={strokeWidth}
          />
        ))}
      </Svg>
    </View>
  );
};

// ============================================================
// Main Component
// ============================================================

/**
 * AnnotatedPhotoView displays a photo with hold markers overlaid.
 *
 * Features:
 * - Normalized coordinate system (0-1) for markers
 * - Correct aspect ratio handling (no circle stretching)
 * - Optional pinch-to-zoom and pan gestures
 * - Letterbox/pillarbox aware positioning
 */
const AnnotatedPhotoView: React.FC<AnnotatedPhotoViewProps> = ({
  photo,
  uri,
  enableZoom = true,
  enablePan = true,
  showOnlyStartHolds = false,
  onTap,
  config: configOverrides,
  style,
}) => {
  // Merge config with defaults
  const config = React.useMemo(
    () => ({ ...DEFAULT_ANNOTATED_PHOTO_VIEW_CONFIG, ...configOverrides }),
    [configOverrides]
  );

  // Image bounds calculation
  const { imageBounds, containerDims, handleLayout, isMeasured } = useImageBounds(
    photo.width,
    photo.height
  );

  const imageAspect = photo.width / photo.height;
  const photoUri = uri ?? photo.cloudUri ?? photo.localUri;

  // Track image load failures so we can show an offline/unavailable placeholder
  // instead of a black rectangle. Reset whenever the URI changes (e.g. a cached
  // file:// path arrives after a background download).
  const [loadFailed, setLoadFailed] = React.useState(false);
  React.useEffect(() => {
    setLoadFailed(false);
  }, [photoUri]);
  const showPlaceholder = !photoUri || loadFailed;

  // Shared values for worklet access to bounds (needed for pan limits)
  const containerDimsShared = useSharedValue({ width: 0, height: 0 });
  const imageBoundsShared = useSharedValue<{ width: number; height: number } | null>(null);
  
  React.useEffect(() => {
    containerDimsShared.value = containerDims;
  }, [containerDims, containerDimsShared]);
  
  React.useEffect(() => {
    if (imageBounds) {
      imageBoundsShared.value = { width: imageBounds.width, height: imageBounds.height };
    }
  }, [imageBounds, imageBoundsShared]);

  // Filter markers if showOnlyStartHolds is enabled
  const displayMarkers = React.useMemo(() => {
    if (!photo.holdMarkers) return [];
    if (showOnlyStartHolds) {
      return photo.holdMarkers.filter(m => m.type === 'start');
    }
    return photo.holdMarkers;
  }, [photo.holdMarkers, showOnlyStartHolds]);

  // Zoom/pan shared values
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Pinch gesture
  const pinchGesture = React.useMemo(
    () =>
      Gesture.Pinch()
        .enabled(enableZoom)
        .onStart(() => {
          savedScale.value = scale.value;
        })
        .onUpdate((e) => {
          const newScale = savedScale.value * e.scale;
          scale.value = Math.min(
            Math.max(newScale, config.minScale),
            config.maxScale
          );
        })
        .onEnd(() => {
          if (scale.value < config.minScale) {
            scale.value = withTiming(config.minScale);
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
          } else {
            // Clamp current translate to new limits at current scale
            const bounds = imageBoundsShared.value;
            const container = containerDimsShared.value;
            if (bounds && container.width > 0) {
              const limits = calculatePhotoPanLimits(bounds, container, scale.value);
              const clamped = clampPhotoPan(translateX.value, translateY.value, limits);
              if (clamped.translateX !== translateX.value) {
                translateX.value = withTiming(clamped.translateX);
              }
              if (clamped.translateY !== translateY.value) {
                translateY.value = withTiming(clamped.translateY);
              }
            }
          }
        }),
    [enableZoom, config.minScale, config.maxScale, scale, savedScale, translateX, translateY, imageBoundsShared, containerDimsShared]
  );

  // Pan gesture with limits to prevent panning past photo edges
  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(enablePan)
        .onStart(() => {
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        })
        .onUpdate((e) => {
          if (scale.value > 1) {
            const desiredTx = savedTranslateX.value + e.translationX;
            const desiredTy = savedTranslateY.value + e.translationY;
            
            // Apply pan limits to prevent showing blank space
            const bounds = imageBoundsShared.value;
            const container = containerDimsShared.value;
            if (bounds && container.width > 0 && container.height > 0) {
              const limits = calculatePhotoPanLimits(bounds, container, scale.value);
              const clamped = clampPhotoPan(desiredTx, desiredTy, limits);
              translateX.value = clamped.translateX;
              translateY.value = clamped.translateY;
            } else {
              translateX.value = desiredTx;
              translateY.value = desiredTy;
            }
          }
        }),
    [enablePan, scale, translateX, translateY, savedTranslateX, savedTranslateY, imageBoundsShared, containerDimsShared]
  );

  // Tap gesture (for thumbnail mode navigation)
  const tapGesture = React.useMemo(
    () =>
      Gesture.Tap()
        .enabled(!!onTap)
        .onEnd(() => {
          if (onTap) {
            runOnJS(onTap)();
          }
        }),
    [onTap]
  );

  // Combined gesture - tap races with zoom/pan
  const combinedGesture = React.useMemo(
    () => Gesture.Race(
      tapGesture,
      Gesture.Simultaneous(pinchGesture, panGesture)
    ),
    [tapGesture, pinchGesture, panGesture]
  );

  // Animated style
  // Transform order: translate FIRST, then scale
  // This matches AnnotatePhotoScreen and ensures pan limit formula works correctly
  // (translate values get multiplied by scale when rendered)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View
      style={[styles.container, { backgroundColor: config.backgroundColor }, style]}
      onLayout={handleLayout}
    >
      <GestureDetector gesture={combinedGesture}>
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          {/* Photo */}
          {photoUri && !loadFailed && (
            <Image
              source={{ uri: photoUri }}
              style={styles.photo}
              resizeMode="contain"
              onError={() => setLoadFailed(true)}
            />
          )}

          {/* Offline / unavailable placeholder. Shown when there is no URI to
              render, or when the image (typically a remote URL while offline)
              fails to load. A cached file:// photo loads without hitting this. */}
          {showPlaceholder && (
            <View
              style={styles.placeholder}
              testID="photo-unavailable-placeholder"
              pointerEvents="none"
            >
              <Text style={styles.placeholderIcon}>📶</Text>
              <Text style={styles.placeholderText}>Connect to load photo</Text>
            </View>
          )}

          {/* Marker overlay */}
          {isMeasured && imageBounds && displayMarkers.length > 0 && (
            <MarkerOverlay
              markers={displayMarkers}
              imageBounds={imageBounds}
              imageAspect={imageAspect}
              strokeWidth={config.strokeWidthNormalized}
            />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  placeholderIcon: {
    fontSize: 28,
    opacity: 0.7,
    marginBottom: 6,
  },
  placeholderText: {
    color: '#bbb',
    fontSize: 13,
    textAlign: 'center',
  },
});

export default AnnotatedPhotoView;

