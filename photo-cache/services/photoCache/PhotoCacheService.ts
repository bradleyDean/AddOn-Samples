/**
 * PhotoCacheService
 * 
 * Local image cache for route photos. Provides:
 * - Cache-first photo retrieval with background download
 * - LRU eviction when cache is full
 * - Concurrent download management with priority queue
 * - Integration with Route Editor for local captures
 */

import RNFS from 'react-native-fs';
import { PHOTO_CACHE_CONFIG } from '../../shared/config/photoCacheConfig';
import { logDebug, logWarn, logError } from './logger';
import type {
  CacheEntry,
  CacheMetadata,
  DownloadTask,
  CacheStats,
  RoutesById,
  PhotoCacheService as IPhotoCacheService,
} from './types';

// ============================================================
// DownloadQueue - Manages concurrent downloads with priority
// ============================================================

class DownloadQueue {
  private queue: DownloadTask[] = [];
  private inProgress: Map<string, DownloadTask> = new Map();
  private maxConcurrent = PHOTO_CACHE_CONFIG.maxConcurrentDownloads;
  private onDownloadComplete: (task: DownloadTask) => Promise<void>;
  
  constructor(onDownloadComplete: (task: DownloadTask) => Promise<void>) {
    this.onDownloadComplete = onDownloadComplete;
  }
  
  /**
   * Add a download task to the queue
   */
  add(task: DownloadTask): void {
    const key = `${task.routeId}_${task.photoIndex}`;
    
    // Don't add if already in queue or in progress
    if (this.inProgress.has(key)) {
      return;
    }
    
    const existingIndex = this.queue.findIndex(
      t => t.routeId === task.routeId && t.photoIndex === task.photoIndex
    );
    
    if (existingIndex !== -1) {
      // Update priority if already queued
      this.queue[existingIndex].priority = Math.min(
        this.queue[existingIndex].priority,
        task.priority
      );
      // Re-sort queue
      this.queue.sort((a, b) => a.priority - b.priority);
      return;
    }
    
    // Add to queue and sort by priority
    this.queue.push(task);
    this.queue.sort((a, b) => a.priority - b.priority);
    
    // Try to process queue
    this.processQueue();
  }
  
  /**
   * Cancel a specific download
   */
  cancel(routeId: string, photoIndex: number): void {
    const key = `${routeId}_${photoIndex}`;
    
    // Cancel if in progress
    const inProgressTask = this.inProgress.get(key);
    if (inProgressTask) {
      inProgressTask.abortController.abort();
      this.inProgress.delete(key);
    }
    
    // Remove from queue
    this.queue = this.queue.filter(
      t => !(t.routeId === routeId && t.photoIndex === photoIndex)
    );
  }
  
  /**
   * Cancel all pending and in-progress downloads
   */
  cancelAll(): void {
    // Abort all in-progress downloads
    this.inProgress.forEach((task) => {
      task.abortController.abort();
    });
    this.inProgress.clear();
    
    // Clear queue
    this.queue = [];
    
    logDebug('[PhotoCache] All downloads cancelled');
  }
  
  /**
   * Get queue status for debugging
   */
  getStatus(): { queued: number; inProgress: number } {
    return {
      queued: this.queue.length,
      inProgress: this.inProgress.size,
    };
  }
  
  /**
   * Process the queue - start downloads up to maxConcurrent
   */
  private processQueue(): void {
    while (
      this.inProgress.size < this.maxConcurrent &&
      this.queue.length > 0
    ) {
      const task = this.queue.shift()!;
      const key = `${task.routeId}_${task.photoIndex}`;
      this.inProgress.set(key, task);
      
      this.executeDownload(task);
    }
  }
  
  /**
   * Execute a single download
   */
  private async executeDownload(task: DownloadTask): Promise<void> {
    const key = `${task.routeId}_${task.photoIndex}`;
    
    try {
      await this.onDownloadComplete(task);
    } catch (error) {
      // Error already logged in onDownloadComplete
    } finally {
      this.inProgress.delete(key);
      this.processQueue();
    }
  }
}

// ============================================================
// PhotoCacheService Implementation
// ============================================================

class PhotoCacheServiceImpl implements IPhotoCacheService {
  private cacheDir: string;
  private metadataPath: string;
  private metadata: CacheMetadata | null = null;
  private initialized = false;
  private downloadQueue: DownloadQueue;
  private maxCachedImagesOverride: number | undefined = undefined;
  private metadataLock = false;
  /**
   * Listeners notified when a cache entry becomes ready on disk (download
   * completed or local capture registered). Keyed by cache key
   * ("{routeId}_{photoIndex}"). Lets a mounted card swap from the remote URL
   * (or placeholder) to the local file:// path the moment its photo lands.
   */
  private entryListeners: Map<string, Set<(fileUri: string) => void>> = new Map();
  
  constructor() {
    this.cacheDir = `${RNFS.DocumentDirectoryPath}/${PHOTO_CACHE_CONFIG.cacheDirectoryName}`;
    this.metadataPath = `${this.cacheDir}/${PHOTO_CACHE_CONFIG.metadataFileName}`;
    this.downloadQueue = new DownloadQueue(this.handleDownloadComplete.bind(this));
  }
  
  /**
   * Serialize metadata operations to prevent race conditions.
   * Uses a simple polling lock - waits if another operation is in progress.
   */
  private async withMetadataLock<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for any existing lock to be released
    while (this.metadataLock) {
      await new Promise(r => setTimeout(r, 10));
    }
    this.metadataLock = true;
    try {
      return await fn();
    } finally {
      this.metadataLock = false;
    }
  }
  
  // ============================================================
  // Public API
  // ============================================================
  
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    logDebug('[PhotoCache] Initializing...');
    
    try {
      // Create cache directory if needed
      const dirExists = await RNFS.exists(this.cacheDir);
      if (!dirExists) {
        await RNFS.mkdir(this.cacheDir);
        logDebug('[PhotoCache] Created cache directory:', this.cacheDir);
        // New directory - create fresh metadata and we're done
        this.metadata = this.createEmptyMetadata();
        await this.saveMetadata();
        this.initialized = true;
        logDebug('[PhotoCache] Initialized with empty cache');
        return;
      }
      
      // Load or create metadata
      this.metadata = await this.loadMetadata();
      
      // Validate cache integrity
      await this.validateCacheIntegrity();
      
      // TODO: Analytics - log cache size at startup
      const stats = await this.getStats();
      logDebug('[PhotoCache] Initialized:', {
        count: stats.count,
        totalSizeMB: stats.totalSizeMB.toFixed(2),
        oldestAccessDays: stats.oldestAccessDays.toFixed(1),
      });
      
      this.initialized = true;
    } catch (error) {
      logError('[PhotoCache] Initialization failed:', error);
      // Create empty metadata as fallback
      this.metadata = this.createEmptyMetadata();
      this.initialized = true;
    }
  }
  
  /**
   * Validate cache integrity by checking for:
   * 1. Orphaned files (on disk but not in metadata) - delete them
   * 2. Stale entries (in metadata but not on disk) - remove from metadata
   */
  private async validateCacheIntegrity(): Promise<void> {
    if (!this.metadata) return;
    
    logDebug('[PhotoCache] Validating cache integrity...');
    let orphanedFilesRemoved = 0;
    let staleEntriesRemoved = 0;
    let metadataModified = false;
    
    try {
      // Check for orphaned files (in directory but not in metadata)
      const files = await RNFS.readDir(this.cacheDir);
      for (const file of files) {
        // Skip metadata file
        if (file.name === PHOTO_CACHE_CONFIG.metadataFileName) continue;
        
        // Extract cache key from filename (remove .jpg extension)
        const cacheKey = file.name.replace('.jpg', '');
        
        if (!this.metadata.entries[cacheKey]) {
          logDebug(`[PhotoCache] Removing orphaned file: ${file.name}`);
          try {
            await RNFS.unlink(file.path);
            orphanedFilesRemoved++;
          } catch (unlinkError) {
            logError(`[PhotoCache] Failed to remove orphaned file: ${file.name}`, unlinkError);
          }
        }
      }
      
      // Check for stale entries (in metadata but not on disk)
      const entriesToRemove: string[] = [];
      for (const [cacheKey, entry] of Object.entries(this.metadata.entries)) {
        const filePath = `${this.cacheDir}/${entry.fileName}`;
        const fileExists = await RNFS.exists(filePath);
        
        if (!fileExists) {
          logDebug(`[PhotoCache] Removing stale metadata entry: ${cacheKey}`);
          entriesToRemove.push(cacheKey);
        }
      }
      
      // Remove stale entries
      for (const cacheKey of entriesToRemove) {
        delete this.metadata.entries[cacheKey];
        staleEntriesRemoved++;
        metadataModified = true;
      }
      
      // Save metadata if modified
      if (metadataModified) {
        await this.saveMetadata();
      }
      
      if (orphanedFilesRemoved > 0 || staleEntriesRemoved > 0) {
        logDebug(`[PhotoCache] Integrity check complete: removed ${orphanedFilesRemoved} orphaned files, ${staleEntriesRemoved} stale entries`);
      } else {
        logDebug('[PhotoCache] Integrity check complete: cache is clean');
      }
    } catch (error) {
      logError('[PhotoCache] Error during integrity validation:', error);
      // Don't throw - continue with potentially inconsistent state
      // It will self-heal over time as entries are accessed
    }
  }
  
  isInitialized(): boolean {
    return this.initialized;
  }
  
  setMaxCachedImages(max: number | undefined): void {
    this.maxCachedImagesOverride = max;
    logDebug('[PhotoCache] Max cached images set to:', max ?? PHOTO_CACHE_CONFIG.maxCachedImages, 
      max ? '(custom)' : '(default)');
  }
  
  getMaxCachedImages(): number {
    return this.maxCachedImagesOverride ?? PHOTO_CACHE_CONFIG.maxCachedImages;
  }
  
  async getUri(
    routeId: string,
    routesById: RoutesById,
    photoIndex = 0
  ): Promise<string | undefined> {
    const route = routesById[routeId];
    if (!route?.photos?.[photoIndex]) {
      return undefined;
    }
    
    const photo = route.photos[photoIndex];
    const cacheKey = `${routeId}_${photoIndex}`;
    
    // Check cache first
    if (await this.isInCache(routeId, photoIndex)) {
      const entry = this.metadata?.entries[cacheKey];
      // Content-aware invalidation: if the route document now points at a
      // different cloudUri than the one we cached (photo edited → new download
      // token), the cached bytes are stale. This is a pure string comparison
      // against data already delivered by the Firestore listener — no egress.
      if (photo.cloudUri && entry && entry.sourceUri !== photo.cloudUri) {
        logDebug(`[PhotoCache] Stale (cloudUri changed): ${cacheKey}`);
        await this.invalidate(routeId, photoIndex);
        // Fall through to the cache-miss path below to fetch the new version.
      } else {
        // Update lastAccessedAt
        await this.touchEntry(cacheKey);
        // TODO: Analytics - cache hit
        logDebug(`[PhotoCache] Hit: ${cacheKey}`);
        return `file://${this.getCachePath(routeId, photoIndex)}`;
      }
    }
    
    // Cache miss - return cloudUri and trigger background download
    // TODO: Analytics - cache miss
    logDebug(`[PhotoCache] Miss: ${cacheKey}`);
    
    if (photo.cloudUri) {
      this.queueDownload(routeId, photoIndex, photo.cloudUri, 0);
      return photo.cloudUri;
    }
    
    // Fallback to localUri (for drafts)
    return photo.localUri;
  }
  
  preload(routeIds: string[], currentIndex: number, routesById: RoutesById): void {
    if (!this.initialized) {
      logWarn('[PhotoCache] Cannot preload - not initialized');
      return;
    }
    
    const buffer = PHOTO_CACHE_CONFIG.preloadBuffer;
    const preloadOrder: Array<{ routeId: string; index: number; priority: number }> = [];
    
    // Build preload order: current, then expand outward (+1, -1, +2, -2, ...)
    // Current selection (highest priority)
    if (currentIndex >= 0 && currentIndex < routeIds.length) {
      preloadOrder.push({ 
        routeId: routeIds[currentIndex], 
        index: currentIndex, 
        priority: 0 
      });
    }
    
    // Expand outward from current
    for (let offset = 1; offset <= buffer; offset++) {
      const nextIndex = currentIndex + offset;
      const prevIndex = currentIndex - offset;
      
      // Next (slightly higher priority than prev at same distance)
      if (nextIndex < routeIds.length) {
        preloadOrder.push({ 
          routeId: routeIds[nextIndex], 
          index: nextIndex, 
          priority: offset * 2 - 1 
        });
      }
      // Previous
      if (prevIndex >= 0) {
        preloadOrder.push({ 
          routeId: routeIds[prevIndex], 
          index: prevIndex, 
          priority: offset * 2 
        });
      }
    }
    
    // Queue downloads for routes not already in cache
    let queuedCount = 0;
    let skippedCached = 0;
    let skippedNoPhoto = 0;
    
    for (const { routeId, priority } of preloadOrder) {
      const route = routesById[routeId];
      
      if (!route?.photos?.[0]?.cloudUri) {
        skippedNoPhoto++;
        continue;
      }
      
      // Use sync check to avoid async overhead during preload. Skip only if the
      // cached entry matches the current cloudUri; a changed cloudUri (edited
      // photo) must be re-fetched, so let it fall through to queueDownload.
      const existingEntry = this.metadata?.entries[`${routeId}_0`];
      if (existingEntry && existingEntry.sourceUri === route.photos[0].cloudUri) {
        skippedCached++;
        continue;
      }
      
      this.queueDownload(routeId, 0, route.photos[0].cloudUri, priority);
      queuedCount++;
    }
    
    // Log preload summary
    if (queuedCount > 0 || skippedCached > 0) {
      logDebug(`[PhotoCache] Preload: queued=${queuedCount}, cached=${skippedCached}, noPhoto=${skippedNoPhoto}, currentIdx=${currentIndex}`);
    }
  }
  
  /**
   * Synchronous cache check (metadata only, no disk verification)
   * Used for preloading to avoid async overhead
   */
  isInCacheSync(routeId: string, photoIndex: number): boolean {
    if (!this.metadata) return false;
    const cacheKey = `${routeId}_${photoIndex}`;
    return !!this.metadata.entries[cacheKey];
  }
  
  /**
   * Get the cache file path for a route photo.
   * Used by Route Editor to save captured photos directly to cache.
   */
  getCachePath(routeId: string, photoIndex: number): string {
    return `${this.cacheDir}/${routeId}_${photoIndex}.jpg`;
  }

  /**
   * Subscribe to "entry ready" events for a specific cache key. The listener is
   * called with the local `file://` path once the photo has been written to disk
   * (background download completed, or local capture registered). Returns an
   * unsubscribe function. Safe to call before initialization.
   */
  onEntryReady(cacheKey: string, listener: (fileUri: string) => void): () => void {
    let set = this.entryListeners.get(cacheKey);
    if (!set) {
      set = new Set();
      this.entryListeners.set(cacheKey, set);
    }
    set.add(listener);
    return () => {
      const current = this.entryListeners.get(cacheKey);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.entryListeners.delete(cacheKey);
      }
    };
  }
  
  /**
   * Check if there are any pending (awaitingUpload) photos for a different route.
   * Used for orphan cleanup when Route Editor opens.
   * Returns the routeId of orphaned photos, or null if none.
   */
  getOrphanedPendingRouteId(excludeRouteId: string | null): string | null {
    if (!this.metadata) return null;
    
    for (const entry of Object.values(this.metadata.entries)) {
      if (entry.awaitingUpload && entry.routeId !== excludeRouteId) {
        return entry.routeId;
      }
    }
    return null;
  }
  
  cancelPendingDownloads(): void {
    this.downloadQueue.cancelAll();
  }
  
  async registerLocalCapture(
    routeId: string,
    photoIndex: number,
    localPath: string
  ): Promise<void> {
    if (!this.initialized || !this.metadata) {
      throw new Error('PhotoCache not initialized');
    }
    
    // INVARIANT: Only one routeId can have awaitingUpload=true at a time
    // If there are pending photos for a different route, clean them up first
    const orphanedRouteId = this.getOrphanedPendingRouteId(routeId);
    if (orphanedRouteId) {
      logWarn(`[PhotoCache] Invariant enforcement: Found pending photos for ${orphanedRouteId}, cleaning up before registering ${routeId}`);
      await this.removePendingPhotos(orphanedRouteId);
    }
    
    const cacheKey = `${routeId}_${photoIndex}`;
    const fileName = `${routeId}_${photoIndex}.jpg`;
    const destPath = `${this.cacheDir}/${fileName}`;
    
    try {
      // File should already be at destPath (copied by usePhotoCapture)
      // but verify and get file size
      const exists = await RNFS.exists(destPath);
      if (!exists) {
        // Fallback: copy from localPath if not at destPath
        if (localPath !== destPath) {
          await RNFS.copyFile(localPath, destPath);
        } else {
          throw new Error(`File does not exist at expected path: ${destPath}`);
        }
      }
      
      const stats = await RNFS.stat(destPath);
      
      // Add entry to metadata
      const entry: CacheEntry = {
        routeId,
        photoIndex,
        fileName,
        fileSize: typeof stats.size === 'number' ? stats.size : parseInt(stats.size, 10),
        lastAccessedAt: Date.now(),
        downloadedAt: Date.now(),
        source: 'local_capture',
        awaitingUpload: true,
      };
      
      this.metadata.entries[cacheKey] = entry;
      await this.saveMetadata();
      
      this.emitEntryReady(routeId, photoIndex);
      
      logDebug(`[PhotoCache] Registered local capture: ${cacheKey}, size=${entry.fileSize} bytes`);
    } catch (error) {
      logError(`[PhotoCache] Failed to register local capture: ${cacheKey}`, error);
      throw error;
    }
  }
  
  async confirmUpload(routeId: string): Promise<void> {
    if (!this.initialized || !this.metadata) {
      return;
    }
    
    let updated = false;
    
    // Find all entries for this route and mark as uploaded
    for (const [key, entry] of Object.entries(this.metadata.entries)) {
      if (entry.routeId === routeId && entry.awaitingUpload) {
        entry.awaitingUpload = false;
        updated = true;
        logDebug(`[PhotoCache] Confirmed upload: ${key}`);
      }
    }
    
    if (updated) {
      await this.saveMetadata();
    }
  }
  
  async removePendingPhotos(routeId: string): Promise<void> {
    if (!this.initialized || !this.metadata) {
      return;
    }
    
    const keysToRemove: string[] = [];
    
    // Find all pending entries for this route
    for (const [key, entry] of Object.entries(this.metadata.entries)) {
      if (entry.routeId === routeId && entry.awaitingUpload) {
        keysToRemove.push(key);
      }
    }
    
    // Remove files and metadata entries
    for (const key of keysToRemove) {
      const entry = this.metadata.entries[key];
      const filePath = `${this.cacheDir}/${entry.fileName}`;
      
      try {
        await RNFS.unlink(filePath);
        logDebug(`[PhotoCache] Removed pending photo: ${key}`);
      } catch (error) {
        logWarn(`[PhotoCache] Failed to remove file: ${filePath}`, error);
      }
      
      delete this.metadata.entries[key];
    }
    
    if (keysToRemove.length > 0) {
      await this.saveMetadata();
    }
  }
  
  async getStats(): Promise<CacheStats> {
    if (!this.metadata) {
      return { count: 0, totalSizeMB: 0, oldestAccessDays: 0 };
    }
    
    const entries = Object.values(this.metadata.entries);
    const count = entries.length;
    
    if (count === 0) {
      return { count: 0, totalSizeMB: 0, oldestAccessDays: 0 };
    }
    
    const totalBytes = entries.reduce((sum, e) => sum + e.fileSize, 0);
    const totalSizeMB = totalBytes / (1024 * 1024);
    
    const oldestAccess = Math.min(...entries.map(e => e.lastAccessedAt));
    const oldestAccessDays = (Date.now() - oldestAccess) / (1000 * 60 * 60 * 24);
    
    return { count, totalSizeMB, oldestAccessDays };
  }
  
  async clearCache(): Promise<void> {
    logDebug('[PhotoCache] Clearing cache...');
    
    try {
      // Cancel all downloads
      this.downloadQueue.cancelAll();
      
      // Delete all files in cache directory
      if (await RNFS.exists(this.cacheDir)) {
        const files = await RNFS.readDir(this.cacheDir);
        for (const file of files) {
          await RNFS.unlink(file.path);
        }
      }
      
      // Reset metadata
      this.metadata = this.createEmptyMetadata();
      await this.saveMetadata();
      
      // Drop any pending readiness listeners; their entries no longer exist.
      this.entryListeners.clear();
      
      logDebug('[PhotoCache] Cache cleared');
    } catch (error) {
      logError('[PhotoCache] Failed to clear cache:', error);
      throw error;
    }
  }
  
  // ============================================================
  // Private Methods
  // ============================================================
  
  private async isInCache(routeId: string, photoIndex: number): Promise<boolean> {
    if (!this.metadata) return false;
    
    const cacheKey = `${routeId}_${photoIndex}`;
    const entry = this.metadata.entries[cacheKey];
    
    if (!entry) return false;
    
    // Verify file exists on disk
    const filePath = this.getCachePath(routeId, photoIndex);
    const exists = await RNFS.exists(filePath);
    
    if (!exists) {
      // Clean up stale metadata entry
      delete this.metadata.entries[cacheKey];
      await this.saveMetadata();
      return false;
    }
    
    return true;
  }
  
  private async touchEntry(cacheKey: string): Promise<void> {
    if (!this.metadata || !this.metadata.entries[cacheKey]) return;
    
    this.metadata.entries[cacheKey].lastAccessedAt = Date.now();
    await this.saveMetadata();
  }

  /**
   * Notify listeners that a cache entry is ready on disk. Fires with the local
   * file:// path. Errors in listeners are swallowed so one bad subscriber can't
   * break the cache pipeline.
   */
  private emitEntryReady(routeId: string, photoIndex: number): void {
    const cacheKey = `${routeId}_${photoIndex}`;
    const listeners = this.entryListeners.get(cacheKey);
    if (!listeners || listeners.size === 0) return;
    const fileUri = `file://${this.getCachePath(routeId, photoIndex)}`;
    listeners.forEach((listener) => {
      try {
        listener(fileUri);
      } catch (error) {
        logWarn(`[PhotoCache] entryReady listener threw for ${cacheKey}`, error);
      }
    });
  }

  /**
   * Remove a cache entry and its file from disk. Used when a photo is detected
   * as stale (its route's cloudUri changed) so the next access re-downloads the
   * current version.
   */
  private async invalidate(routeId: string, photoIndex: number): Promise<void> {
    if (!this.metadata) return;
    const cacheKey = `${routeId}_${photoIndex}`;
    const filePath = this.getCachePath(routeId, photoIndex);
    try {
      await RNFS.unlink(filePath);
    } catch (error) {
      // File may already be gone; not fatal.
      logWarn(`[PhotoCache] Failed to unlink during invalidate: ${cacheKey}`, error);
    }
    delete this.metadata.entries[cacheKey];
    await this.saveMetadata();
    logDebug(`[PhotoCache] Invalidated: ${cacheKey}`);
  }
  
  private queueDownload(
    routeId: string,
    photoIndex: number,
    cloudUri: string,
    priority: number
  ): void {
    if (!this.initialized) return;
    
    const task: DownloadTask = {
      routeId,
      photoIndex,
      cloudUri,
      priority,
      abortController: new AbortController(),
    };
    
    this.downloadQueue.add(task);
  }
  
  private async handleDownloadComplete(task: DownloadTask): Promise<void> {
    const { routeId, photoIndex, cloudUri, abortController } = task;
    const cacheKey = `${routeId}_${photoIndex}`;
    const destPath = this.getCachePath(routeId, photoIndex);
    const tempPath = `${destPath}.tmp`;
    
    try {
      // Check if already in cache (might have been downloaded by another request)
      if (await this.isInCache(routeId, photoIndex)) {
        const existing = this.metadata?.entries[cacheKey];
        if (existing && existing.sourceUri === cloudUri) {
          logDebug(`[PhotoCache] Already cached: ${cacheKey}`);
          return;
        }
        // The cloudUri changed since this entry was cached (photo edited).
        // Remove the stale file + entry so the re-download can overwrite it.
        await this.invalidate(routeId, photoIndex);
      }
      
      // Download to temp file first
      const downloadResult = await RNFS.downloadFile({
        fromUrl: cloudUri,
        toFile: tempPath,
        // Note: RNFS doesn't support AbortController directly
        // We'll check abort status after download
      }).promise;
      
      // Check if cancelled during download
      if (abortController.signal.aborted) {
        await RNFS.unlink(tempPath).catch(() => {});
        logDebug(`[PhotoCache] Download cancelled: ${cacheKey}`);
        return;
      }
      
      // Check download success
      if (downloadResult.statusCode !== 200) {
        throw new Error(`HTTP ${downloadResult.statusCode}`);
      }
      
      // Get file size
      const stats = await RNFS.stat(tempPath);
      
      // Move to final location
      await RNFS.moveFile(tempPath, destPath);
      
      // Add to metadata
      if (this.metadata) {
        const entry: CacheEntry = {
          routeId,
          photoIndex,
          fileName: `${routeId}_${photoIndex}.jpg`,
          fileSize: typeof stats.size === 'number' ? stats.size : parseInt(stats.size, 10),
          lastAccessedAt: Date.now(),
          downloadedAt: Date.now(),
          source: 'download',
          sourceUri: cloudUri,
        };
        
        this.metadata.entries[cacheKey] = entry;
        await this.saveMetadata();
        
        logDebug(`[PhotoCache] Downloaded: ${cacheKey}`);
        // TODO: Analytics - download success
        
        // Notify any mounted view waiting on this photo so it can swap to the
        // local file:// path immediately.
        this.emitEntryReady(routeId, photoIndex);
        
        // Check if eviction is needed
        await this.evictIfNeeded();
      }
    } catch (error) {
      logError(`[PhotoCache] Download failed: ${cacheKey}`, error);
      // TODO: Analytics - download failure
      
      // Clean up temp file if exists
      await RNFS.unlink(tempPath).catch(() => {});
    }
  }
  
  private async evictIfNeeded(): Promise<void> {
    if (!this.metadata) return;
    
    const entries = Object.values(this.metadata.entries);
    const currentCount = entries.length;
    const maxCachedImages = this.getMaxCachedImages();
    
    if (currentCount <= maxCachedImages) {
      return; // Under limit
    }
    
    // Sort by lastAccessedAt (oldest first), excluding pending uploads
    const evictableEntries = entries
      .filter(e => !e.awaitingUpload)
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    
    // Calculate how many to evict: over-limit count + buffer (fraction of current max)
    // The buffer prevents frequent evictions when near the limit
    const overLimitCount = currentCount - maxCachedImages;
    const evictionBuffer = Math.max(1, Math.round(maxCachedImages * PHOTO_CACHE_CONFIG.evictionBufferFraction));
    const toEvictCount = overLimitCount + evictionBuffer;
    
    logDebug(`[PhotoCache] Eviction triggered: count=${currentCount}, max=${maxCachedImages}, overLimit=${overLimitCount}, buffer=${evictionBuffer}, evicting=${toEvictCount}`);
    // TODO: Analytics - eviction event
    
    let evictedCount = 0;
    let evictedBytes = 0;
    
    for (let i = 0; i < toEvictCount && i < evictableEntries.length; i++) {
      const entry = evictableEntries[i];
      const cacheKey = `${entry.routeId}_${entry.photoIndex}`;
      const filePath = `${this.cacheDir}/${entry.fileName}`;
      
      try {
        await RNFS.unlink(filePath);
        delete this.metadata.entries[cacheKey];
        evictedCount++;
        evictedBytes += entry.fileSize;
        logDebug(`[PhotoCache] Evicted: ${cacheKey}`);
      } catch (error) {
        logError(`[PhotoCache] Failed to evict: ${cacheKey}`, error);
      }
    }
    
    await this.saveMetadata();
    logDebug(`[PhotoCache] Eviction complete: evicted=${evictedCount}, freedMB=${(evictedBytes / 1024 / 1024).toFixed(2)}`);
  }
  
  private createEmptyMetadata(): CacheMetadata {
    return {
      version: PHOTO_CACHE_CONFIG.metadataVersion,
      entries: {},
    };
  }
  
  private async loadMetadata(): Promise<CacheMetadata> {
    try {
      const exists = await RNFS.exists(this.metadataPath);
      if (!exists) {
        logDebug('[PhotoCache] No metadata file, creating new');
        const metadata = this.createEmptyMetadata();
        await this.saveMetadataToFile(metadata);
        return metadata;
      }
      
      const content = await RNFS.readFile(this.metadataPath, 'utf8');
      const metadata = JSON.parse(content) as CacheMetadata;
      
      // Version migration would go here
      if (metadata.version !== PHOTO_CACHE_CONFIG.metadataVersion) {
        logDebug(`[PhotoCache] Migrating metadata from v${metadata.version} to v${PHOTO_CACHE_CONFIG.metadataVersion}`);
        metadata.version = PHOTO_CACHE_CONFIG.metadataVersion;
        await this.saveMetadataToFile(metadata);
      }
      
      return metadata;
    } catch (error) {
      logError('[PhotoCache] Failed to load metadata:', error);
      return this.createEmptyMetadata();
    }
  }
  
  private async saveMetadata(): Promise<void> {
    if (!this.metadata) return;
    // Use lock to serialize metadata writes and prevent race conditions
    await this.withMetadataLock(async () => {
      await this.saveMetadataToFile(this.metadata!);
    });
  }
  
  private async saveMetadataToFile(metadata: CacheMetadata): Promise<void> {
    try {
      const content = JSON.stringify(metadata, null, 2);
      await RNFS.writeFile(this.metadataPath, content, 'utf8');
    } catch (error) {
      logError('[PhotoCache] Failed to save metadata:', error);
    }
  }
}

// ============================================================
// Singleton Export
// ============================================================

/**
 * Export the class for testing purposes
 */
export { PhotoCacheServiceImpl };

/**
 * Singleton instance of PhotoCacheService
 */
export const photoCacheService = new PhotoCacheServiceImpl();

