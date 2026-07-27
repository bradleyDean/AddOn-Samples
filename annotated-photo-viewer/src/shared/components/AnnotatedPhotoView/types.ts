/**
 * AnnotatedPhotoView Type Definitions
 *
 * This file defines the types for the unified AnnotatedPhotoView component
 * that supports edit, view, and thumbnail modes.
 */

import type { AnnotatedRoutePhoto, HoldMarker } from '../../types/holds';

/**
 * Display modes for AnnotatedPhotoView
 *
 * - 'edit': Full editing capabilities (create, select, drag, resize markers)
 * - 'view': Read-only with zoom/pan support
 * - 'thumbnail': Small preview, no interaction, optional filtering
 */
export type AnnotatedPhotoMode = 'edit' | 'view' | 'thumbnail';

/**
 * Represents the actual display bounds of an image within its container
 * when using resizeMode="contain" (letterboxing/pillarboxing)
 */
export interface ImageBounds {
  /** Left offset of image within container (pillarbox spacing) */
  left: number;
  /** Top offset of image within container (letterbox spacing) */
  top: number;
  /** Displayed width of image in container pixels */
  width: number;
  /** Displayed height of image in container pixels */
  height: number;
}

/**
 * A point in normalized image coordinates (0-1 range)
 *
 * - (0, 0) = top-left corner of image
 * - (1, 1) = bottom-right corner of image
 * - (0.5, 0.5) = center of image
 */
export interface NormalizedPoint {
  /** X coordinate as fraction of image width (0-1) */
  x: number;
  /** Y coordinate as fraction of image height (0-1) */
  y: number;
}

/**
 * A point in container pixel coordinates
 */
export interface ContainerPoint {
  /** X coordinate in container pixels */
  x: number;
  /** Y coordinate in container pixels */
  y: number;
}

/**
 * Props for the AnnotatedPhotoView component
 */
export interface AnnotatedPhotoViewProps {
  /** Display mode - determines available interactions */
  mode: AnnotatedPhotoMode;

  /** Photo data including URI and original dimensions */
  photo: AnnotatedRoutePhoto;

  // --- Edit mode props ---

  /**
   * Current markers (edit mode)
   * In edit mode, markers are managed externally and passed in.
   * Use onMarkersChange to receive updates.
   */
  markers?: HoldMarker[];

  /**
   * Callback when markers change (edit mode)
   * Called whenever markers are created, moved, resized, or deleted.
   */
  onMarkersChange?: (markers: HoldMarker[]) => void;

  /**
   * Current hold type for new markers (edit mode)
   * When user taps to create a marker, this type will be used.
   */
  currentHoldType?: 'start' | 'intermediate' | 'finish';

  // --- View/Edit mode props ---

  /**
   * Enable pinch-to-zoom gesture
   * Default: true for 'edit' and 'view' modes, false for 'thumbnail'
   */
  enableZoom?: boolean;

  /**
   * Enable pan gesture (when zoomed in)
   * Default: true for 'edit' and 'view' modes, false for 'thumbnail'
   */
  enablePan?: boolean;

  // --- Thumbnail mode props ---

  /**
   * Only show start hold markers (thumbnail mode)
   * Useful for showing a quick preview of where the route starts.
   */
  showOnlyStartHolds?: boolean;

  /**
   * Callback when thumbnail is tapped
   * Use this to navigate to route detail view.
   */
  onTap?: () => void;

  // --- Styling ---

  /**
   * Background color for the container (including letterbox areas)
   * Default: '#000' (black)
   */
  backgroundColor?: string;
}

/**
 * Configuration for marker rendering
 */
export interface MarkerRenderConfig {
  /** Stroke width for marker circles (in normalized units for viewBox) */
  strokeWidth: number;
  /** Additional offset for selection indicator */
  selectionOffset: number;
  /** Stroke width for selection indicator */
  selectionStrokeWidth: number;
  /** Dash pattern for selection indicator */
  selectionDashPattern: string;
}

/**
 * Default marker render configuration
 */
export const DEFAULT_MARKER_RENDER_CONFIG: MarkerRenderConfig = {
  strokeWidth: 0.004, // ~0.4% of viewBox width
  selectionOffset: 0.004,
  selectionStrokeWidth: 0.002,
  selectionDashPattern: '0.008 0.004',
};

/**
 * Configuration for edit mode
 */
export interface EditModeConfig {
  /** Default radius for new markers (normalized, fraction of image width) */
  defaultMarkerRadius: number;
  /** Long press duration to select a marker (ms) */
  longPressDuration: number;
  /** Drag sensitivity multiplier */
  dragSensitivity: number;
  /** Resize sensitivity multiplier */
  resizeSensitivity: number;
}

/**
 * Default edit mode configuration
 */
export const DEFAULT_EDIT_MODE_CONFIG: EditModeConfig = {
  defaultMarkerRadius: 0.025, // 2.5% of image width
  longPressDuration: 300,
  dragSensitivity: 1.0,
  resizeSensitivity: 0.3,
};

