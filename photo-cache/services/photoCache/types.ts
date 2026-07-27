/**
 * Photo Cache Type Definitions
 * 
 * Types for the local image cache system.
 */

import type { Route } from '../../shared/types/holds';

/**
 * Map of route IDs to Route objects
 */
export interface RoutesById {
  [routeId: string]: Route;
}

/**
 * Individual cache entry metadata
 */
export interface CacheEntry {
  /** Route ID this photo belongs to */
  routeId: string;
  /** Index of the photo in the route's photos array (0 for first photo) */
  photoIndex: number;
  /** File name on disk: "{routeId}_{photoIndex}.jpg" */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** Unix timestamp (ms) when this entry was last accessed - updated on every cache hit */
  lastAccessedAt: number;
  /** Unix timestamp (ms) when this entry was downloaded/created */
  downloadedAt: number;
  
  /**
   * Source of this cache entry:
   * - 'download': Downloaded from Firebase (normal feed browsing)
   * - 'local_capture': Captured locally via Route Editor
   */
  source: 'download' | 'local_capture';
  
  /**
   * The Firebase Storage download URL (including its token) this file was
   * downloaded from. Used for content-aware invalidation: when a route photo is
   * edited, the object is overwritten in place but `getDownloadURL()` returns a
   * new token, so the route document's `cloudUri` changes. Comparing the current
   * `cloudUri` against this stored value tells us the cached bytes are stale
   * WITHOUT downloading the photo. Undefined for legacy entries (pre-v2) and for
   * local captures that have not been associated with a cloud URL yet; such
   * entries are invalidated on first access when a `cloudUri` is present.
   */
  sourceUri?: string;
  
  /**
   * Only relevant when source='local_capture'
   * - true: Photo captured but route not yet uploaded to Firebase
   * - false: Route has been uploaded successfully
   */
  awaitingUpload?: boolean;
}

/**
 * Cache metadata stored in metadata.json
 */
export interface CacheMetadata {
  /** Schema version for future migrations */
  version: number;
  /** Map of cache keys to entries. Key format: "{routeId}_{photoIndex}" */
  entries: Record<string, CacheEntry>;
}

/**
 * Download task for the queue
 */
export interface DownloadTask {
  /** Route ID for this photo */
  routeId: string;
  /** Photo index within the route */
  photoIndex: number;
  /** Firebase Storage download URL */
  cloudUri: string;
  /** Priority (lower = higher priority, 0 = currently selected) */
  priority: number;
  /** Controller to abort this download */
  abortController: AbortController;
}

/**
 * Cache statistics for debugging
 */
export interface CacheStats {
  /** Number of cached images */
  count: number;
  /** Total size in MB */
  totalSizeMB: number;
  /** Days since oldest entry was accessed */
  oldestAccessDays: number;
}

/**
 * PhotoCacheService public interface
 */
export interface PhotoCacheService {
  /**
   * Get local URI for a route photo.
   * Returns cached path if available, otherwise cloudUri (and triggers background cache).
   */
  getUri(routeId: string, routesById: RoutesById, photoIndex?: number): Promise<string | undefined>;
  
  /**
   * Preload photos around current carousel selection.
   * Called when scroll ends.
   */
  preload(routeIds: string[], currentIndex: number, routesById: RoutesById): void;
  
  /**
   * Cancel pending downloads and clear queue.
   * Called on floor change.
   */
  cancelPendingDownloads(): void;
  
  /**
   * Register a photo from route editor (already saved to cache dir).
   */
  registerLocalCapture(routeId: string, photoIndex: number, localPath: string): Promise<void>;
  
  /**
   * Mark pending photo as uploaded (awaitingUpload = false).
   */
  confirmUpload(routeId: string): Promise<void>;
  
  /**
   * Remove pending photos for a route (user cancelled).
   */
  removePendingPhotos(routeId: string): Promise<void>;
  
  /**
   * Get cache statistics for debugging.
   */
  getStats(): Promise<CacheStats>;
  
  /**
   * Clear entire cache (dev mode).
   */
  clearCache(): Promise<void>;
  
  /**
   * Initialize cache on app startup.
   * Creates directory if needed, validates metadata.
   */
  initialize(): Promise<void>;
  
  /**
   * Check if cache is initialized
   */
  isInitialized(): boolean;
  
  /**
   * Synchronous cache check (metadata only, no disk verification).
   * Used for preloading to avoid async overhead.
   */
  isInCacheSync(routeId: string, photoIndex: number): boolean;
  
  /**
   * Get the cache file path for a route photo.
   * Used by Route Editor to save captured photos directly to cache.
   */
  getCachePath(routeId: string, photoIndex: number): string;
  
  /**
   * Check if there are any pending (awaitingUpload) photos for a different route.
   * Used for orphan cleanup when Route Editor opens.
   * Returns the routeId of orphaned photos, or null if none.
   */
  getOrphanedPendingRouteId(excludeRouteId: string | null): string | null;
  
  /**
   * Set a custom max cached images limit (overrides config).
   * Used for dev-mode configuration.
   * Pass undefined to reset to default from config.
   */
  setMaxCachedImages(max: number | undefined): void;
  
  /**
   * Get the current max cached images limit.
   * Returns the override if set, otherwise the default from config.
   */
  getMaxCachedImages(): number;

  /**
   * Subscribe to "entry ready" events for a cache key ("{routeId}_{photoIndex}").
   * The listener receives the local file:// path once the photo is on disk
   * (download completed or local capture registered). Returns an unsubscribe fn.
   */
  onEntryReady(cacheKey: string, listener: (fileUri: string) => void): () => void;
}

