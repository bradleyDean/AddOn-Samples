export interface HoldMarkerLayerConfig {
  defaultRadius: number;
  selectionOffset: number;
  strokeWidth: number;
  selectionStrokeWidth: number;
  selectionDashPattern: string;
  longPressDuration: number;
  holdResizeSensitivity: number;
  holdDragSensitivity: number;
}

export const DEFAULT_HOLD_MARKER_LAYER_CONFIG: HoldMarkerLayerConfig = {
  defaultRadius: 30,
  selectionOffset: 4,
  strokeWidth: 4,
  selectionStrokeWidth: 2,
  selectionDashPattern: "8 4",
  longPressDuration: 300,
  holdResizeSensitivity: 0.3,
  holdDragSensitivity: 1.0,
} as const;
