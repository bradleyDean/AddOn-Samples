/**
 * Photo Cache Configuration
 * 
 * Configuration constants for the local image cache system.
 * These values control cache size, preloading behavior, and download concurrency.
 */
const MAX_CACHED_IMAGES = 100;

/**
 * Fraction of max cache size to use as eviction buffer.
 * When eviction triggers, we evict (overCount + bufferFraction * maxSize) images.
 * This prevents frequent evictions when near the limit.
 */
const EVICTION_BUFFER_FRACTION = 0.2;

export const PHOTO_CACHE_CONFIG = {
  /** Maximum number of images in cache */
  maxCachedImages: MAX_CACHED_IMAGES,
  
  /** Buffer size for preloading (N ± buffer = 2*buffer+1 images) */
  preloadBuffer: 5,
  
  /** Max concurrent downloads */
  maxConcurrentDownloads: 2,
  
  /** Directory name within DocumentDirectoryPath */
  cacheDirectoryName: 'route-photo-cache',
  
  /** Metadata file name */
  metadataFileName: 'metadata.json',
  
  /** 
   * Fraction of max cache to evict as buffer (0.2 = 20%).
   * Calculated dynamically based on current maxCachedImages setting.
   */
  evictionBufferFraction: EVICTION_BUFFER_FRACTION,
  
  /**
   * Current metadata schema version (for future migrations).
   * v2: added `sourceUri` to CacheEntry for content-aware invalidation.
   */
  metadataVersion: 2,
} as const;

export type PhotoCacheConfig = typeof PHOTO_CACHE_CONFIG;

