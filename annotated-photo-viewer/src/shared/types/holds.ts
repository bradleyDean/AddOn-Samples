export interface HoldMarker {
  id: string;  // unique UUID for hold
  x: number;   // normalized (0–1) x position
  y: number;   // normalized (0–1) y position
  r: number;   // normalized circle radius
  type: 'start' | 'finish' | 'intermediate';
  selected?: boolean; // Optional for UI state
}

export interface AnnotatedRoutePhoto {
  localUri: string;           // local file path
  cloudUri?: string;          // set after Firebase upload
  holdMarkers: HoldMarker[];
  width: number;             // image width in pixels
  height: number;            // image height in pixels
  capturedAt?: string;       // ISO timestamp of capture/pick (debug metadata only)
}

import { RouteAttributes } from './routeAttributes';

export interface MapLocation {
  svgPoint: {xSvg: number, ySvg: number}; // x,y coordinate of route in svg-based maps coordinate system
  t: number;             // Fraction of total wall length from left endpoint to route's location (0-1, rounded to 4 decimal places)
  wallCode: string;     // Walls are ordered left to right, via a sortable code (format: <number><lowercase_letter><number>)
  floor: number;        // Floor number (required)
  mapUri?: string;      // URI/path to the map file (optional, local file system path for now, Firebase storage bucket path in production)
  dist: string;         // wallCode + t for ordering (e.g., "0a00.5123")
}

/** Maximum V-grade value (V17 is currently the hardest) */
export const MAX_GRADE = 17;
/** Minimum V-grade value */
export const MIN_GRADE = 0;

/** Format a numeric grade for display (e.g., 5 -> "V5") */
export const formatGrade = (grade: number): string => `V${grade}`;

/** Parse a V-grade string to number (e.g., "V5" -> 5), returns null if invalid */
export const parseGrade = (gradeStr: string): number | null => {
  const match = gradeStr.match(/^[Vv](\d+)$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (num < MIN_GRADE || num > MAX_GRADE) return null;
  return num;
};

export interface Route {
  id: string;                 // Firestore doc ID or UUID
  mapId: string;             // So we can filter out Routes that don't belong on the active map
  createdBy?: string;         // User ID of route creator
  createdByDisplayName?: string; // Display name of route creator (for attribution)
  createdByPhotoURL?: string; // Avatar URL of route creator, denormalized at write time (for attribution)
  createdAt: string;          // ISO string
  name: string;
  grade: number;              // V-grade as number (0-17 for V0-V17)
  tags: string[];
  description: string;
  location: MapLocation;      // map-relative normalized coordinates
  photos: AnnotatedRoutePhoto[];
  
  // --- Additional metadata fields ---
  wallAngle?: number;         // 0–5 (mapped slab → roof)
  attributes?: RouteAttributes; // Qualitative attributes
  setBy?: 'me' | 'setter';    // mutually exclusive
  setterInfo?: {
    heightCm?: number;
    sex?: 'male' | 'female' | 'non-binary';
    apeIndex?: number;
    userId?: string;          // optional link to setter profile
  };
  updatedAt?: string;         // ISO string
  version?: number;
  gymId?: string;             // Optional for backward compatibility - gym ID where route was created
  
  // --- Soft-delete fields (see: plans_and_descriptions/route_cleanup_refactor.md) ---
  isDeleted?: boolean;        // True when route is confirmed deleted (consensus reached)
  deletedBy?: string[];       // Array of user IDs who marked this route as deleted
  deletedAt?: string;         // ISO timestamp of when deletion was first marked
  photosDeletedAt?: string;   // ISO timestamp of when photos were hard-deleted from Storage
}

/**
 * RouteDraft represents a route that has not been uploaded yet.
 * It omits fields that are set during upload (id, createdAt, createdBy)
 * and makes id and location optional since they're filled in during the editing process.
 */
export type RouteDraft = Omit<Route, 'id' | 'createdAt' | 'createdBy' | 'location'> & {
  id?: string; // optional, filled in once upload begins
  location?: MapLocation; // optional, set when user selects location on map
  photos: AnnotatedRoutePhoto[];
};
