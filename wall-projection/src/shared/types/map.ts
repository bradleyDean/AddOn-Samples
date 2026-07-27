import { MapLocation } from './holds';

export interface Map {
  id: string;
  // keys-> integers (floor number), values-> strings (svg text)
  [key: number]: string; // e.g., {0: "<svg>...</svg>", 1: "<svg>...</svg>"}
  active: boolean; // whether the map is the active map
  name: string; // name of the map
  description?: string; // description of the map
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
  createdBy?: string; // user ID of the creator
  updatedBy?: string; // user ID of the last updater
  version?: number; // version number of the map
}

export interface ParsedSVG {
  viewBox: { width: number; height: number };
  walls: WallData[];
  frames: FrameData[]; // New field for frame rectangles defining map boundaries
}

export interface WallData {
  id: string;
  floor: number;
  wallCode: string;
  segmentIndex: number;
  pathData: string;
  vertices: [number, number][]; // SVG coordinates
}

export interface FrameData {
  id?: string; // Optional id attribute
  frameName?: string; // From frameName attribute (for future regions of interest)
  floor: number; // Floor number this frame belongs to (extracted from floor attribute or passed as parameter)
  x: number; // Rectangle x position in SVG coordinates
  y: number; // Rectangle y position in SVG coordinates
  width: number; // Rectangle width in SVG coordinates
  height: number; // Rectangle height in SVG coordinates
  // Bounding box corners in SVG coordinates (for convenience)
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

export interface RouteLocationPin {
  id: string;
  location: MapLocation;
  color: string; // Deprecated: kept for backward compatibility, prefer using style
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    fillOpacity?: number;
    strokeOpacity?: number;
    opacity?: number;
  };
  radius?: number;
}

export interface MapConfig {
  defaultPinRadius: number;
  selectedPinRadius: number;
  defaultPinColor: string;
  selectedPinColor: string;
  wallHitBoxPadding: number;
  minZoom: number;
  maxZoom: number;
  panSensitivity: number;
  zoomSensitivity: number;
}

// ============================================================================
// Frame Registry Types
// Used for pre-computing auto-focus zoom levels per wall section.
// See plans_and_descriptions/frame_pan_limits.md for details.
// ============================================================================

/**
 * Common bounding box properties for frames
 */
export interface FrameBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  topLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

/**
 * Wall frame generated from wall path vertices.
 * Contains pre-computed maxZoom for auto-focus animation.
 */
export interface WallFrame extends FrameBounds {
  /** Wall group ID (e.g., "0a", "1b") - first two chars of wallCode */
  wallGroupId: string;
  /** Floor number this wall group belongs to */
  floor: number;
  /**
   * Pre-computed zoom level at which this wall fills the viewport.
   * Used by MapView for pin tap auto-focus animation.
   */
  maxZoom: number;
}

/**
 * Built-in frame from SVG rect elements with class="frame"
 */
export interface BuiltInFrame extends FrameBounds {
  id?: string;
  /** Frame name (e.g., "global", "North Room") */
  frameName?: string;
  floor: number;
}

/**
 * Registry of all frames (built-in and generated) for a map.
 * Built once per map load for efficient lookups.
 */
export interface FrameRegistry {
  /** Frames defined in SVG with class="frame" (global, room frames, etc.) */
  builtIn: {
    [frameName: string]: BuiltInFrame;
  };
  /** Frames generated from wall path vertices, keyed by wall group prefix */
  byWallCode: {
    [wallGroupId: string]: WallFrame;
  };
}

