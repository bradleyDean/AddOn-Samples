/**
 * useImageBounds Hook
 *
 * This hook manages the calculation of image display bounds within a container.
 * It tracks container dimensions via onLayout and computes where the image
 * actually renders (accounting for letterbox/pillarbox with resizeMode="contain").
 */

import { useState, useCallback, useMemo } from 'react';
import { LayoutChangeEvent } from 'react-native';
import { calculateImageBounds } from '../utils/coordinates';
import type { ImageBounds } from '../types';

export interface UseImageBoundsResult {
  /** Current container dimensions */
  containerDims: { width: number; height: number };
  
  /** Calculated image bounds within container, or null if not yet measured */
  imageBounds: ImageBounds | null;
  
  /** Handler to attach to container's onLayout prop */
  handleLayout: (event: LayoutChangeEvent) => void;
  
  /** Whether the container has been measured */
  isMeasured: boolean;
}

/**
 * Hook to calculate image display bounds within a container.
 *
 * Attach the returned `handleLayout` to your container's `onLayout` prop.
 * The hook will calculate where the image renders (accounting for letterboxing)
 * once the container dimensions are known.
 *
 * @param imageWidth - Original image width in pixels
 * @param imageHeight - Original image height in pixels
 * @returns Object containing container dims, image bounds, and layout handler
 *
 * @example
 * const { imageBounds, handleLayout, isMeasured } = useImageBounds(
 *   photo.width,
 *   photo.height
 * );
 *
 * return (
 *   <View onLayout={handleLayout} style={styles.container}>
 *     {isMeasured && (
 *       <Image source={{ uri: photo.cloudUri }} style={styles.image} />
 *     )}
 *   </View>
 * );
 */
export function useImageBounds(
  imageWidth: number,
  imageHeight: number
): UseImageBoundsResult {
  const [containerDims, setContainerDims] = useState({ width: 0, height: 0 });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerDims((prev) => {
        // Only update if dimensions actually changed
        if (prev.width === width && prev.height === height) {
          return prev;
        }
        return { width, height };
      });
    }
  }, []);

  const imageBounds = useMemo<ImageBounds | null>(() => {
    if (containerDims.width === 0 || containerDims.height === 0) {
      return null;
    }
    if (imageWidth === 0 || imageHeight === 0) {
      return null;
    }
    return calculateImageBounds(
      containerDims.width,
      containerDims.height,
      imageWidth,
      imageHeight
    );
  }, [containerDims.width, containerDims.height, imageWidth, imageHeight]);

  const isMeasured = imageBounds !== null;

  return {
    containerDims,
    imageBounds,
    handleLayout,
    isMeasured,
  };
}

