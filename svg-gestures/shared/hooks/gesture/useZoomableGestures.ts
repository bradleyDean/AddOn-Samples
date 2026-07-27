import React from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { applyScaleDampeningWorklet } from '../../utils/geometry';
import { calculateFramePanLimits, calculatePanLimitsFromFrameDebug } from '../../utils/panLimits';
import type { FrameData } from '../../types/map';
import { ZoomableViewConfig } from '../../config/zoomableViewConfig';

/**
 * Canvas pan gesture - only handles panning the image/canvas
 * 
 * Optionally enforces pan limits if containerDims and svgViewBox are provided.
 * This prevents panning past map boundaries when zoomed in.
 */
export function useZoomableGestures({
  onPanCanvas,
  onZoomCanvas,
  onTransformUpdate,
  config,
  containerDims,
  svgViewBox,
  frame,
}: {
  onPanCanvas: (tx: number, ty: number) => void;
  onZoomCanvas: (scale: number) => void;
  // TODO: DEBUG ONLY - Remove when pan limits debugging is complete
  // Callback for debug visualization updates when pan/zoom ends
  onTransformUpdate?: (tx: number, ty: number, scale: number) => void;
  config: ZoomableViewConfig;
  // Optional: if provided, pan limits will be enforced during manual panning
  containerDims?: { width: number; height: number };
  svgViewBox?: { width: number; height: number };
  // Optional: if provided, use frame-based pan limits instead of viewBox-based
  frame?: FrameData | null;
}) {
  // Shared values (UI-thread) - use config values
  const scale = useSharedValue(config.initialScale);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Reference points for panning
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startScale = useSharedValue(config.initialScale);

  // Cached pan limits - only recalculated when scale changes
  // This optimization avoids recalculating limits on every pan gesture update
  // (which can fire 60+ times per second), since limits only change when:
  // - The map/frame changes (handled by React re-render)
  // - The scale changes (checked in onUpdate)
  const cachedPanLimits = useSharedValue<{
    limits: {
      minTranslateX: number;
      maxTranslateX: number;
      minTranslateY: number;
      maxTranslateY: number;
    };
    scale: number;
  } | null>(null);

  // Stable callback reference for runOnJS
  const handlePanCanvas = React.useCallback(
    (tx: number, ty: number) => onPanCanvas(tx, ty),
    [onPanCanvas]
  );

  const handleZoomCanvas = React.useCallback(
    (newScale: number) => onZoomCanvas(newScale),
    [onZoomCanvas]
  );

  const handleLogScale = React.useCallback(
    (scaleValue: number) => {
      // Debug logging removed - use dev mode toggle in settings if needed
    },
    []
  );

  // TODO: DEBUG ONLY - Remove when pan limits debugging is complete
  // Stable callback for transform update notifications
  const handleTransformUpdate = React.useCallback(
    (tx: number, ty: number, scaleValue: number) => {
      if (onTransformUpdate) {
        onTransformUpdate(tx, ty, scaleValue);
      }
    },
    [onTransformUpdate]
  );

  // Debug logging for pan limits (throttled to avoid spam)
  // Use SharedValue instead of ref to avoid Reanimated warning
  const lastDebugLogTime = useSharedValue(0);
  const DEBUG_LOG_INTERVAL = 200; // Log at most every 200ms

  const handleDebugPanLimits = React.useCallback(
    (
      desiredTx: number,
      desiredTy: number,
      clampedTx: number,
      clampedTy: number,
      limits: {
        minTranslateX: number;
        maxTranslateX: number;
        minTranslateY: number;
        maxTranslateY: number;
      },
      scaleValue: number,
      frame: FrameData | null | undefined,
      containerDims: { width: number; height: number } | undefined,
      svgViewBox: { width: number; height: number } | undefined
    ) => {
      const wasClampedX = Math.abs(desiredTx - clampedTx) > 0.1;
      const wasClampedY = Math.abs(desiredTy - clampedTy) > 0.1;

      // If using frame, get detailed debug info including frame bounds
      let frameDebugInfo: any = null;
      if (frame && containerDims && svgViewBox) {
        try {
          const debugResult = calculatePanLimitsFromFrameDebug(
            frame,
            scaleValue,
            containerDims,
            svgViewBox,
            clampedTx,
            clampedTy
          );
          frameDebugInfo = debugResult.debug;
        } catch (error) {
          console.warn('[useZoomableGestures] Failed to calculate frame debug info:', error);
        }
      }

      // Debug logging removed - use dev mode toggle in settings if needed
    },
    []
  );

  const pan = Gesture.Pan()
    .onBegin((_e) => {
      // Always start canvas pan
      startTx.value = translateX.value;
      startTy.value = translateY.value;
      
      // Pre-calculate pan limits at gesture start (optimization)
      // These will be reused throughout the gesture unless scale changes
      if (containerDims && svgViewBox && frame) {
        const currentScale = scale.value;
        cachedPanLimits.value = {
          limits: calculateFramePanLimits(
            { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
            currentScale,
            containerDims,
            svgViewBox
          ),
          scale: currentScale,
        };
      }
    })
    .onUpdate((e) => {
      // Calculate desired pan position
      const desiredTx = startTx.value + (e.translationX * config.panSensitivity);
      const desiredTy = startTy.value + (e.translationY * config.panSensitivity);

      // Apply pan limits (both horizontal and vertical)
      if (containerDims && svgViewBox && frame) {
        const currentScale = scale.value;
        
        // Use cached limits if available and scale hasn't changed
        // This is an optimization: limits only need recalculation when scale changes
        // (which can happen during pinch-while-panning)
        let limits: {
          minTranslateX: number;
          maxTranslateX: number;
          minTranslateY: number;
          maxTranslateY: number;
        };
        
        if (cachedPanLimits.value && cachedPanLimits.value.scale === currentScale) {
          // Scale unchanged - use cached limits
          limits = cachedPanLimits.value.limits;
        } else {
          // Scale changed or no cache - recalculate and cache
          limits = calculateFramePanLimits(
            { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
            currentScale,
            containerDims,
            svgViewBox
          );
          cachedPanLimits.value = {
            limits,
            scale: currentScale,
          };
        }
        
        // Clamp both translations
        const clampedTx = Math.max(limits.minTranslateX, Math.min(limits.maxTranslateX, desiredTx));
        const clampedTy = Math.max(limits.minTranslateY, Math.min(limits.maxTranslateY, desiredTy));
        
        translateX.value = clampedTx;
        translateY.value = clampedTy;
      } else {
        // No limits available - allow unclamped panning
        translateX.value = desiredTx;
        translateY.value = desiredTy;
      }
    })
    .onEnd(() => {
      // Commit canvas pan to React state
      runOnJS(handlePanCanvas)(translateX.value, translateY.value);
      // TODO: DEBUG ONLY - Notify debug visualization of transform change
      runOnJS(handleTransformUpdate)(translateX.value, translateY.value, scale.value);
    });

  const pinch = Gesture.Pinch()
    .onBegin((_e) => {
      // Store initial scale for continuous zooming
      startScale.value = scale.value;
      if (__DEV__) {
        console.log('[useZoomableGestures] Pinch gesture began - initial scale:', scale.value);
      }
    })
    .onUpdate((e) => {
      // Apply dampening to make zooming more reasonable - use config sensitivity
      const dampenedScale = applyScaleDampeningWorklet(e.scale, config.sensitivity);
      const newScale = Math.max(
        config.minScale, 
        Math.min(config.maxScale, startScale.value * dampenedScale)
      );
      scale.value = newScale;
      
      // Debug: Log when scale changes significantly during pinch
      if (__DEV__ && Math.abs(newScale - startScale.value) > 0.1) {
        // Throttle this log too - check in worklet
        const now = Date.now();
        if (now - lastDebugLogTime.value > DEBUG_LOG_INTERVAL) {
          lastDebugLogTime.value = now;
          runOnJS(handleDebugPanLimits)(
            translateX.value,
            translateY.value,
            translateX.value,
            translateY.value,
            {
              minTranslateX: 0,
              maxTranslateX: 0,
              minTranslateY: 0,
              maxTranslateY: 0,
            },
            newScale,
            frame,
            containerDims,
            svgViewBox
          );
        }
      }
    })
    .onEnd(() => {
      // Capture scale value for logging
      const finalScale = scale.value;
      // Commit canvas zoom to React state
      runOnJS(handleZoomCanvas)(finalScale);
      // Log scale value when zoom ends (for debugging initial scale calculation)
      runOnJS(handleLogScale)(finalScale);
      // TODO: DEBUG ONLY - Notify debug visualization of transform change
      runOnJS(handleTransformUpdate)(translateX.value, translateY.value, finalScale);
    });

  return { pan, pinch, scale, translateX, translateY };
}
