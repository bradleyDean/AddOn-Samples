export interface ZoomableViewConfig {
  initialScale: number;
  sensitivity: number;
  minScale: number;
  maxScale: number;
  backgroundColor: string;
  panSensitivity: number;
}

export const DEFAULT_ZOOMABLE_VIEW_CONFIG: ZoomableViewConfig = {
  initialScale: 1.0,
  sensitivity: 0.3,
  minScale: 0.25,
  maxScale: 3.0,
  backgroundColor: '#111',
  panSensitivity: 1.0,
} as const;
