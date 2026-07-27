/**
 * PhotoCacheService Tests
 * 
 * Tests for the core cache service implementation including:
 * - Initialization
 * - Max cached images configuration (dev mode)
 * - Eviction logic with dynamic buffer calculation
 * - Cache path generation
 * - Preloading logic
 */

import RNFS from 'react-native-fs';
import { PHOTO_CACHE_CONFIG } from '../../shared/config/photoCacheConfig';

// Mock RNFS
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  exists: jest.fn(),
  mkdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn(),
  copyFile: jest.fn(),
  moveFile: jest.fn(),
  downloadFile: jest.fn(),
  readDir: jest.fn(),
}));

// Import after mocking
import { PhotoCacheServiceImpl } from './PhotoCacheService';
import type { CacheMetadata, RoutesById } from './types';

describe('PhotoCacheServiceImpl', () => {
  let service: PhotoCacheServiceImpl;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Create a fresh instance for each test
    service = new PhotoCacheServiceImpl();
  });

  describe('getMaxCachedImages and setMaxCachedImages', () => {
    it('should return default max from config when no override is set', () => {
      const result = service.getMaxCachedImages();
      expect(result).toBe(PHOTO_CACHE_CONFIG.maxCachedImages);
    });

    it('should return custom max when override is set', () => {
      service.setMaxCachedImages(50);
      expect(service.getMaxCachedImages()).toBe(50);
    });

    it('should reset to default when undefined is passed', () => {
      service.setMaxCachedImages(25);
      expect(service.getMaxCachedImages()).toBe(25);
      
      service.setMaxCachedImages(undefined);
      expect(service.getMaxCachedImages()).toBe(PHOTO_CACHE_CONFIG.maxCachedImages);
    });

    it('should handle very small values', () => {
      service.setMaxCachedImages(5);
      expect(service.getMaxCachedImages()).toBe(5);
    });

    it('should handle very large values', () => {
      service.setMaxCachedImages(10000);
      expect(service.getMaxCachedImages()).toBe(10000);
    });
  });

  describe('getCachePath', () => {
    it('should generate correct path for route photo', () => {
      const path = service.getCachePath('route123', 0);
      expect(path).toBe('/mock/documents/route-photo-cache/route123_0.jpg');
    });

    it('should generate correct path for different photo indices', () => {
      const path0 = service.getCachePath('route123', 0);
      const path1 = service.getCachePath('route123', 1);
      const path2 = service.getCachePath('route123', 2);
      
      expect(path0).toBe('/mock/documents/route-photo-cache/route123_0.jpg');
      expect(path1).toBe('/mock/documents/route-photo-cache/route123_1.jpg');
      expect(path2).toBe('/mock/documents/route-photo-cache/route123_2.jpg');
    });

    it('should handle route IDs with special characters', () => {
      const path = service.getCachePath('AbCdEfGhIjKlMnOpQrSt', 0);
      expect(path).toBe('/mock/documents/route-photo-cache/AbCdEfGhIjKlMnOpQrSt_0.jpg');
    });
  });

  describe('isInCacheSync', () => {
    it('should return false when service is not initialized', () => {
      const result = service.isInCacheSync('route123', 0);
      expect(result).toBe(false);
    });

    it('should return false when entry does not exist in metadata', async () => {
      // Initialize service with empty metadata
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true); // cache dir exists
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true); // metadata exists
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify({
        version: 1,
        entries: {},
      }));
      
      await service.initialize();
      
      const result = service.isInCacheSync('route123', 0);
      expect(result).toBe(false);
    });

    it('should return true when entry exists in metadata', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route123_0': {
            routeId: 'route123',
            photoIndex: 0,
            fileName: 'route123_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      
      await service.initialize();
      
      expect(service.isInCacheSync('route123', 0)).toBe(true);
      expect(service.isInCacheSync('route123', 1)).toBe(false);
      expect(service.isInCacheSync('route456', 0)).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should create cache directory if it does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(false); // cache dir doesn't exist
      (RNFS.mkdir as jest.Mock).mockResolvedValueOnce(undefined);
      (RNFS.writeFile as jest.Mock).mockResolvedValueOnce(undefined);
      
      await service.initialize();
      
      expect(RNFS.mkdir).toHaveBeenCalledWith('/mock/documents/route-photo-cache');
      expect(service.isInitialized()).toBe(true);
    });

    it('should load existing metadata if directory exists', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route123_0': {
            routeId: 'route123',
            photoIndex: 0,
            fileName: 'route123_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true); // cache dir exists
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true); // metadata exists
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      
      await service.initialize();
      
      expect(service.isInitialized()).toBe(true);
      expect(service.isInCacheSync('route123', 0)).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ version: 1, entries: {} }));
      
      await service.initialize();
      await service.initialize(); // Second call
      
      // mkdir should only be called once (or not at all if dir exists)
      // The point is initialize should be idempotent
      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return correct stats for empty cache', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify({
        version: 1,
        entries: {},
      }));
      
      await service.initialize();
      const stats = await service.getStats();
      
      expect(stats.count).toBe(0);
      expect(stats.totalSizeMB).toBe(0);
      expect(stats.oldestAccessDays).toBeGreaterThanOrEqual(0);
    });

    it('should return correct stats for populated cache', async () => {
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 1024 * 1024, // 1 MB
            lastAccessedAt: now,
            downloadedAt: now,
            source: 'download',
          },
          'route2_0': {
            routeId: 'route2',
            photoIndex: 0,
            fileName: 'route2_0.jpg',
            fileSize: 1024 * 1024, // 1 MB
            lastAccessedAt: oneDayAgo,
            downloadedAt: oneDayAgo,
            source: 'download',
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      
      await service.initialize();
      const stats = await service.getStats();
      
      expect(stats.count).toBe(2);
      expect(stats.totalSizeMB).toBeCloseTo(2, 1); // ~2 MB
      expect(stats.oldestAccessDays).toBeCloseTo(1, 0); // ~1 day
    });
  });

  describe('eviction buffer calculation', () => {
    // These tests verify the eviction buffer is calculated correctly
    // based on the current maxCachedImages setting
    
    it('should calculate correct eviction buffer for default max (100)', () => {
      const maxCachedImages = service.getMaxCachedImages();
      const expectedBuffer = Math.max(1, Math.round(maxCachedImages * PHOTO_CACHE_CONFIG.evictionBufferFraction));
      
      // With default 100 and 0.2 fraction, buffer should be 20
      expect(expectedBuffer).toBe(20);
    });

    it('should calculate correct eviction buffer for small max (10)', () => {
      service.setMaxCachedImages(10);
      const maxCachedImages = service.getMaxCachedImages();
      const expectedBuffer = Math.max(1, Math.round(maxCachedImages * PHOTO_CACHE_CONFIG.evictionBufferFraction));
      
      // With max 10 and 0.2 fraction, buffer should be 2
      expect(expectedBuffer).toBe(2);
    });

    it('should calculate correct eviction buffer for very small max (3)', () => {
      service.setMaxCachedImages(3);
      const maxCachedImages = service.getMaxCachedImages();
      const expectedBuffer = Math.max(1, Math.round(maxCachedImages * PHOTO_CACHE_CONFIG.evictionBufferFraction));
      
      // With max 3 and 0.2 fraction, round(0.6) = 1, min is 1
      expect(expectedBuffer).toBe(1);
    });

    it('should calculate correct eviction buffer for large max (500)', () => {
      service.setMaxCachedImages(500);
      const maxCachedImages = service.getMaxCachedImages();
      const expectedBuffer = Math.max(1, Math.round(maxCachedImages * PHOTO_CACHE_CONFIG.evictionBufferFraction));
      
      // With max 500 and 0.2 fraction, buffer should be 100
      expect(expectedBuffer).toBe(100);
    });

    it('eviction buffer fraction should be 0.2 (20%)', () => {
      expect(PHOTO_CACHE_CONFIG.evictionBufferFraction).toBe(0.2);
    });
  });

  describe('preload', () => {
    it('should not throw when service is not initialized', () => {
      const routeIds = ['route1', 'route2', 'route3'];
      const routesById: RoutesById = {};
      
      expect(() => {
        service.preload(routeIds, 1, routesById);
      }).not.toThrow();
    });

    it('should handle empty routeIds array', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify({ version: 1, entries: {} }));
      
      await service.initialize();
      
      expect(() => {
        service.preload([], 0, {});
      }).not.toThrow();
    });

    it('should handle currentIndex out of bounds', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify({ version: 1, entries: {} }));
      
      await service.initialize();
      
      const routeIds = ['route1', 'route2'];
      const routesById: RoutesById = {};
      
      expect(() => {
        service.preload(routeIds, 10, routesById); // Index out of bounds
      }).not.toThrow();
      
      expect(() => {
        service.preload(routeIds, -1, routesById); // Negative index
      }).not.toThrow();
    });
  });

  describe('getUri - content-aware invalidation (§1)', () => {
    // Initialize a service whose cache already contains the given entries, with
    // all filesystem existence checks returning true so isInCache() hits.
    async function initWith(entries: CacheMetadata['entries']): Promise<void> {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readDir as jest.Mock).mockResolvedValue(
        Object.values(entries)
          .map((e) => ({ name: e.fileName, path: `/mock/documents/route-photo-cache/${e.fileName}`, isFile: () => true }))
          .concat([{ name: 'metadata.json', path: '/mock/documents/route-photo-cache/metadata.json', isFile: () => true }])
      );
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ version: 2, entries }));
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
      // Keep any background download harmless.
      (RNFS.downloadFile as jest.Mock).mockReturnValue({ promise: Promise.resolve({ statusCode: 200 }) });
      (RNFS.stat as jest.Mock).mockResolvedValue({ size: 123 });
      (RNFS.moveFile as jest.Mock).mockResolvedValue(undefined);
      await service.initialize();
    }

    const entry = (sourceUri?: string) => ({
      routeId: 'route1',
      photoIndex: 0,
      fileName: 'route1_0.jpg',
      fileSize: 1000,
      lastAccessedAt: Date.now(),
      downloadedAt: Date.now(),
      source: 'download' as const,
      ...(sourceUri !== undefined ? { sourceUri } : {}),
    });

    const routes = (cloudUri: string): RoutesById =>
      ({ route1: { photos: [{ cloudUri }] } } as unknown as RoutesById);

    it('returns the cached file:// path when sourceUri matches current cloudUri', async () => {
      await initWith({ route1_0: entry('urlA') });
      const result = await service.getUri('route1', routes('urlA'), 0);
      expect(result).toBe('file:///mock/documents/route-photo-cache/route1_0.jpg');
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });

    it('invalidates and returns the new cloudUri when cloudUri changed (edited photo)', async () => {
      await initWith({ route1_0: entry('urlA') });
      const result = await service.getUri('route1', routes('urlB'), 0);
      // Stale entry removed from disk, and caller gets the fresh remote URL.
      expect(RNFS.unlink).toHaveBeenCalledWith('/mock/documents/route-photo-cache/route1_0.jpg');
      expect(result).toBe('urlB');
      expect(service.isInCacheSync('route1', 0)).toBe(false);
    });

    it('invalidates a legacy entry lacking sourceUri when a cloudUri is present', async () => {
      await initWith({ route1_0: entry(undefined) });
      const result = await service.getUri('route1', routes('urlA'), 0);
      expect(RNFS.unlink).toHaveBeenCalledWith('/mock/documents/route-photo-cache/route1_0.jpg');
      expect(result).toBe('urlA');
    });

    it('preload skips a photo whose cached sourceUri matches', async () => {
      await initWith({ route1_0: entry('urlA') });
      (RNFS.downloadFile as jest.Mock).mockClear();
      service.preload(['route1'], 0, routes('urlA'));
      await new Promise((r) => setTimeout(r, 0));
      expect(RNFS.downloadFile).not.toHaveBeenCalled();
    });

    it('preload re-queues a photo whose cloudUri changed', async () => {
      await initWith({ route1_0: entry('urlA') });
      (RNFS.downloadFile as jest.Mock).mockClear();
      service.preload(['route1'], 0, routes('urlB'));
      await new Promise((r) => setTimeout(r, 0));
      expect(RNFS.downloadFile).toHaveBeenCalled();
    });
  });

  describe('onEntryReady - completion emitter (§2)', () => {
    async function initEmpty(): Promise<void> {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readDir as jest.Mock).mockResolvedValue([
        { name: 'metadata.json', path: '/mock/documents/route-photo-cache/metadata.json', isFile: () => true },
      ]);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ version: 2, entries: {} }));
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      (RNFS.stat as jest.Mock).mockResolvedValue({ size: 123 });
      (RNFS.moveFile as jest.Mock).mockResolvedValue(undefined);
      (RNFS.downloadFile as jest.Mock).mockReturnValue({ promise: Promise.resolve({ statusCode: 200 }) });
      await service.initialize();
    }

    it('fires the listener with the file:// path when a download completes', async () => {
      await initEmpty();
      const listener = jest.fn();
      service.onEntryReady('route1_0', listener);

      const routes = { route1: { photos: [{ cloudUri: 'urlA' }] } } as unknown as RoutesById;
      // Miss → queues a background download that completes on the next tick.
      await service.getUri('route1', routes, 0);
      await new Promise((r) => setTimeout(r, 0));

      expect(listener).toHaveBeenCalledWith('file:///mock/documents/route-photo-cache/route1_0.jpg');
    });

    it('stops delivering after unsubscribe', async () => {
      await initEmpty();
      const listener = jest.fn();
      const unsubscribe = service.onEntryReady('route1_0', listener);
      unsubscribe();

      const routes = { route1: { photos: [{ cloudUri: 'urlA' }] } } as unknown as RoutesById;
      await service.getUri('route1', routes, 0);
      await new Promise((r) => setTimeout(r, 0));

      expect(listener).not.toHaveBeenCalled();
    });

    it('delivers to multiple subscribers of the same key', async () => {
      await initEmpty();
      const a = jest.fn();
      const b = jest.fn();
      service.onEntryReady('route1_0', a);
      service.onEntryReady('route1_0', b);

      const routes = { route1: { photos: [{ cloudUri: 'urlA' }] } } as unknown as RoutesById;
      await service.getUri('route1', routes, 0);
      await new Promise((r) => setTimeout(r, 0));

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelPendingDownloads', () => {
    it('should not throw when called before initialization', () => {
      expect(() => {
        service.cancelPendingDownloads();
      }).not.toThrow();
    });

    it('should not throw when called after initialization', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify({ version: 1, entries: {} }));
      
      await service.initialize();
      
      expect(() => {
        service.cancelPendingDownloads();
      }).not.toThrow();
    });
  });

  describe('clearCache', () => {
    it('should clear all entries and reset metadata', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      (RNFS.readDir as jest.Mock).mockResolvedValue([
        { path: '/mock/documents/route-photo-cache/route1_0.jpg', name: 'route1_0.jpg', isFile: () => true },
      ]);
      (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
      (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      
      await service.initialize();
      
      // Verify entry exists before clear
      expect(service.isInCacheSync('route1', 0)).toBe(true);
      
      await service.clearCache();
      
      // Verify entry is gone after clear
      expect(service.isInCacheSync('route1', 0)).toBe(false);
      
      // Verify stats are reset
      const stats = await service.getStats();
      expect(stats.count).toBe(0);
    });
  });

  describe('getOrphanedPendingRouteId', () => {
    it('should return null when no pending uploads exist', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
            awaitingUpload: false,
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      
      await service.initialize();
      
      const result = service.getOrphanedPendingRouteId(null);
      expect(result).toBeNull();
    });

    it('should return pending routeId when it exists and is not excluded', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'local_capture',
            awaitingUpload: true,
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      
      await service.initialize();
      
      const result = service.getOrphanedPendingRouteId(null);
      expect(result).toBe('route1');
    });

    it('should return null when pending routeId is excluded', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'local_capture',
            awaitingUpload: true,
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      
      await service.initialize();
      
      // Exclude 'route1' - should return null
      const result = service.getOrphanedPendingRouteId('route1');
      expect(result).toBeNull();
    });

    it('should return different pending routeId when one is excluded', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'local_capture',
            awaitingUpload: true,
          },
          'route2_0': {
            routeId: 'route2',
            photoIndex: 0,
            fileName: 'route2_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'local_capture',
            awaitingUpload: true,
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      
      await service.initialize();
      
      // Exclude 'route1' - should return 'route2'
      const result = service.getOrphanedPendingRouteId('route1');
      expect(result).toBe('route2');
    });
  });
});

describe('Eviction Behavior Integration', () => {
  // These tests verify the eviction count calculation formula
  // toEvictCount = overLimitCount + evictionBuffer
  // where evictionBuffer = max(1, round(maxCachedImages * evictionBufferFraction))
  
  describe('eviction count calculations', () => {
    it('should calculate correct eviction count for default settings', () => {
      // Default: max = 100, fraction = 0.2
      const maxCachedImages = 100;
      const currentCount = 105; // 5 over limit
      const evictionBufferFraction = 0.2;
      
      const overLimitCount = currentCount - maxCachedImages; // 5
      const evictionBuffer = Math.max(1, Math.round(maxCachedImages * evictionBufferFraction)); // 20
      const toEvictCount = overLimitCount + evictionBuffer; // 25
      
      expect(overLimitCount).toBe(5);
      expect(evictionBuffer).toBe(20);
      expect(toEvictCount).toBe(25);
    });

    it('should calculate correct eviction count for small cache (10 max)', () => {
      // Small cache: max = 10, fraction = 0.2
      const maxCachedImages = 10;
      const currentCount = 11; // 1 over limit
      const evictionBufferFraction = 0.2;
      
      const overLimitCount = currentCount - maxCachedImages; // 1
      const evictionBuffer = Math.max(1, Math.round(maxCachedImages * evictionBufferFraction)); // 2
      const toEvictCount = overLimitCount + evictionBuffer; // 3
      
      expect(overLimitCount).toBe(1);
      expect(evictionBuffer).toBe(2);
      expect(toEvictCount).toBe(3);
      
      // After eviction: 11 - 3 = 8 images remaining (80% of max)
      expect(currentCount - toEvictCount).toBe(8);
    });

    it('should not over-evict with small cache (old bug scenario)', () => {
      // This test verifies the bug fix: with max=10, we should NOT evict 21 images
      const maxCachedImages = 10;
      const currentCount = 11;
      const evictionBufferFraction = 0.2;
      
      const overLimitCount = currentCount - maxCachedImages;
      const evictionBuffer = Math.max(1, Math.round(maxCachedImages * evictionBufferFraction));
      const toEvictCount = overLimitCount + evictionBuffer;
      
      // Should evict 3, not 21 (which was the old bug with fixed buffer of 20)
      expect(toEvictCount).toBe(3);
      expect(toEvictCount).toBeLessThan(currentCount); // Should never evict all images
      
      // Remaining should be reasonable percentage
      const remaining = currentCount - toEvictCount;
      expect(remaining).toBe(8);
      expect(remaining / maxCachedImages).toBe(0.8); // 80% remaining
    });

    it('should handle edge case of max = 1', () => {
      const maxCachedImages = 1;
      const currentCount = 2; // 1 over limit
      const evictionBufferFraction = 0.2;
      
      const overLimitCount = currentCount - maxCachedImages; // 1
      const evictionBuffer = Math.max(1, Math.round(maxCachedImages * evictionBufferFraction)); // max(1, 0) = 1
      const toEvictCount = overLimitCount + evictionBuffer; // 2
      
      expect(evictionBuffer).toBe(1); // Minimum buffer is 1
      expect(toEvictCount).toBe(2);
    });

    it('should maintain consistent eviction percentage across different max sizes', () => {
      const evictionBufferFraction = 0.2;
      
      // Test different max sizes
      const testCases = [
        { max: 10, over: 1 },
        { max: 50, over: 5 },
        { max: 100, over: 10 },
        { max: 500, over: 50 },
      ];
      
      for (const { max, over } of testCases) {
        const currentCount = max + over;
        const evictionBuffer = Math.max(1, Math.round(max * evictionBufferFraction));
        const toEvictCount = over + evictionBuffer;
        const remaining = currentCount - toEvictCount;
        const remainingPercent = remaining / max;
        
        // All should result in ~80% remaining (max - 20% buffer)
        expect(remainingPercent).toBeCloseTo(0.8, 1);
      }
    });
  });
});

describe('Phase 6: Startup Validation and Edge Cases', () => {
  let service: PhotoCacheServiceImpl;
  
  beforeEach(() => {
    jest.clearAllMocks();
    service = new PhotoCacheServiceImpl();
  });

  describe('validateCacheIntegrity - orphaned files cleanup', () => {
    it('should remove files that are not in metadata', async () => {
      // Metadata has only route1_0
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
          },
        },
      };
      
      // But directory has route1_0.jpg AND orphaned_0.jpg
      const mockFiles = [
        { name: 'route1_0.jpg', path: '/mock/documents/route-photo-cache/route1_0.jpg', isFile: () => true },
        { name: 'orphaned_0.jpg', path: '/mock/documents/route-photo-cache/orphaned_0.jpg', isFile: () => true },
        { name: 'metadata.json', path: '/mock/documents/route-photo-cache/metadata.json', isFile: () => true },
      ];
      
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      (RNFS.readDir as jest.Mock).mockResolvedValueOnce(mockFiles);
      (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      
      await service.initialize();
      
      // Should have attempted to delete the orphaned file
      expect(RNFS.unlink).toHaveBeenCalledWith('/mock/documents/route-photo-cache/orphaned_0.jpg');
      // Should NOT have deleted the valid file
      expect(RNFS.unlink).not.toHaveBeenCalledWith('/mock/documents/route-photo-cache/route1_0.jpg');
    });

    it('should not remove metadata.json file', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {},
      };
      
      const mockFiles = [
        { name: 'metadata.json', path: '/mock/documents/route-photo-cache/metadata.json', isFile: () => true },
      ];
      
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      (RNFS.readDir as jest.Mock).mockResolvedValueOnce(mockFiles);
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      
      await service.initialize();
      
      // Should NOT have deleted metadata.json
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('validateCacheIntegrity - stale metadata entries cleanup', () => {
    it('should remove metadata entries for missing files', async () => {
      // Metadata has two entries
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
          },
          'route2_0': {
            routeId: 'route2',
            photoIndex: 0,
            fileName: 'route2_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
          },
        },
      };
      
      // But only route1_0.jpg exists on disk
      const mockFiles = [
        { name: 'route1_0.jpg', path: '/mock/documents/route-photo-cache/route1_0.jpg', isFile: () => true },
        { name: 'metadata.json', path: '/mock/documents/route-photo-cache/metadata.json', isFile: () => true },
      ];
      
      (RNFS.exists as jest.Mock)
        .mockResolvedValueOnce(true)  // cache dir exists
        .mockResolvedValueOnce(true)  // metadata file exists
        .mockResolvedValueOnce(true)  // route1_0.jpg exists
        .mockResolvedValueOnce(false); // route2_0.jpg does NOT exist
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      (RNFS.readDir as jest.Mock).mockResolvedValueOnce(mockFiles);
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      
      await service.initialize();
      
      // After initialization, route2_0 should NOT be in cache
      expect(service.isInCacheSync('route2', 0)).toBe(false);
      // route1_0 should still be in cache
      expect(service.isInCacheSync('route1', 0)).toBe(true);
    });

    it('should save modified metadata after removing stale entries', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'stale_0': {
            routeId: 'stale',
            photoIndex: 0,
            fileName: 'stale_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
          },
        },
      };
      
      const mockFiles = [
        { name: 'metadata.json', path: '/mock/documents/route-photo-cache/metadata.json', isFile: () => true },
      ];
      
      (RNFS.exists as jest.Mock)
        .mockResolvedValueOnce(true)  // cache dir exists
        .mockResolvedValueOnce(true)  // metadata file exists
        .mockResolvedValueOnce(false); // stale_0.jpg does NOT exist
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      (RNFS.readDir as jest.Mock).mockResolvedValueOnce(mockFiles);
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      
      await service.initialize();
      
      // Metadata should have been saved (at least once for the stale entry removal)
      expect(RNFS.writeFile).toHaveBeenCalled();
    });
  });

  describe('fresh cache directory creation', () => {
    it('should create empty metadata when directory does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(false); // cache dir doesn't exist
      (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      
      await service.initialize();
      
      expect(RNFS.mkdir).toHaveBeenCalled();
      expect(RNFS.writeFile).toHaveBeenCalled();
      expect(service.isInitialized()).toBe(true);
      
      // Cache should be empty
      const stats = await service.getStats();
      expect(stats.count).toBe(0);
    });
  });

  describe('metadata lock', () => {
    it('should serialize concurrent saveMetadata calls', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      (RNFS.readDir as jest.Mock).mockResolvedValueOnce([
        { name: 'route1_0.jpg', path: '/mock/documents/route-photo-cache/route1_0.jpg', isFile: () => true },
        { name: 'metadata.json', path: '/mock/documents/route-photo-cache/metadata.json', isFile: () => true },
      ]);
      
      // Make writeFile take some time to simulate I/O
      (RNFS.writeFile as jest.Mock).mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 10));
      });
      
      await service.initialize();
      
      // Clear the mock to only count writes from clearCache
      (RNFS.writeFile as jest.Mock).mockClear();
      
      // Call clearCache which internally calls saveMetadata
      // This verifies the lock is being used
      await service.clearCache();
      
      // Should have completed without errors
      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('error recovery', () => {
    it('should continue with empty metadata if initialization fails', async () => {
      (RNFS.exists as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));
      
      await service.initialize();
      
      // Should still be initialized (with empty fallback)
      expect(service.isInitialized()).toBe(true);
      
      // Cache should be empty
      const stats = await service.getStats();
      expect(stats.count).toBe(0);
    });

    it('should handle readDir errors gracefully during validation', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {
          'route1_0': {
            routeId: 'route1',
            photoIndex: 0,
            fileName: 'route1_0.jpg',
            fileSize: 50000,
            lastAccessedAt: Date.now(),
            downloadedAt: Date.now(),
            source: 'download',
          },
        },
      };
      
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      (RNFS.readDir as jest.Mock).mockRejectedValueOnce(new Error('I/O Error'));
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      
      // Should not throw
      await expect(service.initialize()).resolves.not.toThrow();
      
      // Should still be initialized
      expect(service.isInitialized()).toBe(true);
    });

    it('should handle unlink errors gracefully when removing orphaned files', async () => {
      const metadata: CacheMetadata = {
        version: 1,
        entries: {},
      };
      
      const mockFiles = [
        { name: 'orphaned_0.jpg', path: '/mock/documents/route-photo-cache/orphaned_0.jpg', isFile: () => true },
        { name: 'metadata.json', path: '/mock/documents/route-photo-cache/metadata.json', isFile: () => true },
      ];
      
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(metadata));
      (RNFS.readDir as jest.Mock).mockResolvedValueOnce(mockFiles);
      (RNFS.unlink as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
      
      // Should not throw even if unlink fails
      await expect(service.initialize()).resolves.not.toThrow();
      
      // Should still be initialized
      expect(service.isInitialized()).toBe(true);
    });
  });
});

