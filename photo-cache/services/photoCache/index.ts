/**
 * Photo Cache Module
 * 
 * Provides local caching for route photos to reduce Firebase Storage costs
 * and improve user experience with instant photo loading.
 * 
 * Exports:
 * - photoCacheService: Singleton service for cache operations
 * - PhotoCache: Legacy synchronous interface (for backward compatibility)
 * - Types: RoutesById, CacheEntry, etc.
 */

import { photoCacheService } from './PhotoCacheService';

// Re-export types from types.ts
export type { RoutesById, CacheEntry, CacheMetadata, CacheStats, PhotoCacheService } from './types';

// Re-export the singleton service
export { photoCacheService };

// Re-export logger for settings integration
export { setVerboseLogging } from './logger';

// Import RoutesById for use in this file
import type { RoutesById } from './types';

/**
 * Legacy PhotoCache interface for backward compatibility
 * 
 * This synchronous interface is used by existing components.
 * It delegates to photoCacheService but returns synchronously
 * (using cloudUri/localUri directly when cache isn't ready).
 * 
 * New code should use photoCacheService.getUri() directly for
 * cache-first behavior with background downloads.
 */
export interface PhotoCache {
  /**
   * Preload photos for the given routes
   * 
   * @param routeIds - Array of route IDs to preload
   * @param routesById - Map of route IDs to Route objects
   */
  preload(routeIds: string[], routesById: RoutesById): void;

  /**
   * Get the URI for a route's photo (synchronous)
   * 
   * Returns cloudUri or localUri directly. For cache-first behavior
   * with background downloads, use photoCacheService.getUri() instead.
   * 
   * @param routeId - The ID of the route
   * @param routesById - Map of route IDs to Route objects
   * @param photoIndex - Index of the photo (default: 0)
   * @returns Photo URI or undefined if not available
   */
  getUri(routeId: string, routesById: RoutesById, photoIndex?: number): string | undefined;
}

/**
 * Legacy PhotoCache implementation
 * 
 * This is a synchronous passthrough that returns cloudUri or localUri.
 * It also triggers async preloading via photoCacheService.
 * 
 * For new code, prefer using photoCacheService directly.
 */
export const PhotoCache: PhotoCache = {
  /**
   * Preload photos for routes
   * 
   * Delegates to photoCacheService.preload() if initialized.
   */
  preload(routeIds: string[], routesById: RoutesById): void {
    if (photoCacheService.isInitialized()) {
      // Find the "current" index - for legacy API, we preload from the start
      photoCacheService.preload(routeIds, 0, routesById);
    }
  },

  /**
   * Get photo URI for a route (synchronous)
   * 
   * Returns cloudUri if available, otherwise localUri.
   * Also triggers background caching via photoCacheService.
   */
  getUri(routeId: string, routesById: RoutesById, photoIndex: number = 0): string | undefined {
    const route = routesById[routeId];
    
    // Route doesn't exist
    if (!route) {
      return undefined;
    }

    // Route has no photos
    if (!route.photos || route.photos.length === 0) {
      return undefined;
    }

    // Photo index out of bounds
    if (photoIndex < 0 || photoIndex >= route.photos.length) {
      return undefined;
    }

    const photo = route.photos[photoIndex];

    // Trigger async cache operation (fire and forget)
    if (photoCacheService.isInitialized() && photo.cloudUri) {
      // This will check cache and queue download if needed
      photoCacheService.getUri(routeId, routesById, photoIndex).catch(() => {
        // Silently ignore errors - we'll fall back to cloudUri
      });
    }

    // Prefer cloudUri (for uploaded routes), fall back to localUri (for drafts)
    if (photo.cloudUri) {
      return photo.cloudUri;
    }

    if (photo.localUri) {
      return photo.localUri;
    }

    // Error case: Route photo exists but has neither cloudUri nor localUri
    return undefined;
  },
};
