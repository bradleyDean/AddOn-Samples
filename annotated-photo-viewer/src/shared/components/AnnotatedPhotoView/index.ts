/**
 * AnnotatedPhotoView Component
 *
 * A unified component for displaying photos with hold marker annotations.
 * Supports three modes: edit, view, and thumbnail.
 *
 * See plans_and_descriptions/annotated_photo_refactor.md for full documentation.
 */

// Types
export type {
  AnnotatedPhotoMode,
  AnnotatedPhotoViewProps,
  ImageBounds,
  NormalizedPoint,
  ContainerPoint,
  MarkerRenderConfig,
  EditModeConfig,
} from './types';

export {
  DEFAULT_MARKER_RENDER_CONFIG,
  DEFAULT_EDIT_MODE_CONFIG,
} from './types';

// Hooks
export { useImageBounds } from './hooks/useImageBounds';
export { useNormalizedMarkerGestures } from './hooks/useNormalizedMarkerGestures';
export type { 
  NormalizedMarkerGesturesConfig,
  UseNormalizedMarkerGesturesParams,
} from './hooks/useNormalizedMarkerGestures';

// Utilities
export {
  calculateImageBounds,
  containerToNormalized,
  normalizedToContainer,
  pixelRadiusToNormalized,
  normalizedRadiusToPixel,
  isPointInImage,
  clampPointToImage,
  isInsideNormalizedCircle,
} from './utils/coordinates';

// Components
export { default as NormalizedHoldMarkerLayer } from './components/NormalizedHoldMarkerLayer';
export { DEFAULT_NORMALIZED_MARKER_CONFIG } from './components/NormalizedHoldMarkerLayer';
export type { 
  NormalizedMarkerConfig,
  NormalizedHoldMarkerLayerProps,
} from './components/NormalizedHoldMarkerLayer';

// Main AnnotatedPhotoView component (view mode)
export { default as AnnotatedPhotoView } from './AnnotatedPhotoView';
export { DEFAULT_ANNOTATED_PHOTO_VIEW_CONFIG } from './AnnotatedPhotoView';
export type { 
  AnnotatedPhotoViewConfig,
  AnnotatedPhotoViewProps as ViewModeProps,
} from './AnnotatedPhotoView';

