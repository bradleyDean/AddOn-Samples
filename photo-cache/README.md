# Photo cache

Route photos are the most expensive resource in the app. They're large files, fetched often, billed on every Firebase Storage download. This sample shows the on-device cache that makes carousel browsing feel instant while cutting redundant egress.

## How it works

1. **Cache-first display** — `getUri()` checks local disk first. On a hit, it returns a `file://` path and updates `lastAccessedAt`. On a miss, it returns the remote `cloudUri` immediately (no blocking spinner) and enqueues a background download.

2. **On-disk layout** — Photos live under `{DocumentDirectoryPath}/route-photo-cache/` as `{routeId}_{photoIndex}.jpg`, with a `metadata.json` index tracking size, timestamps, source (`download` vs `local_capture`), and the `sourceUri` the entry was fetched from.

3. **Priority download queue** — A `DownloadQueue` caps concurrent downloads (default: 2), deduplicates tasks, supports abort, and sorts by priority (lower number = higher priority). If the same photo is queued twice, the higher-priority request wins.

4. **Scroll-aware preloading** — Users are most likely to view cards near the current card they're viewing, so when the feed carousel settles on a card, `preload()` walks outward from the current index: current → next → previous → next+1 → previous+1 → …, up to a configurable buffer (`preloadBuffer: 5`). Forward cards get slightly higher priority than backward ones at the same distance. `CarouselView.tsx` triggers this on momentum scroll end and when selection changes from outside the carousel (e.g. map pin tap).

5. **LRU eviction** — When the cache exceeds `maxCachedImages`, the least-recently-accessed entries are removed. Eviction evicts **over-limit count + a proportional buffer** (20% of max) so the cache does not thrash at the boundary. Entries with `awaitingUpload: true` (route-editor drafts) are never evicted.

6. **Live UI updates** — `onEntryReady` listeners let a mounted card swap from a remote URL to the local file the moment a download completes. `useCachedPhotoUri` is the React hook that wires this into photo components (see also [`annotated-photo-viewer/`](../annotated-photo-viewer/)).

7. **Content-aware invalidation** — Each cache entry stores the `cloudUri` it was downloaded from. If a route’s photo is replaced server-side, a mismatch forces a re-fetch instead of serving stale bytes.

8. **Route editor integration** — Photos captured during route creation are written directly into the cache directory and registered with `awaitingUpload: true`, so the author sees their photo instantly and the upload step does not re-download what is already local. `confirmUpload()` and `removePendingPhotos()` manage the draft lifecycle.

## Configuration in production

Compiled defaults live in `shared/config/photoCacheConfig.ts`. In the full app, the effective cache size can be tuned **without a release**:

- A global **`APP_CONFIG/photo`** Firestore document sets the production default (same pattern as other runtime config).
- Dev-mode per-user overrides take precedence when set.
- `PhotoCacheConfigSync.tsx` keeps the running service aligned with whichever value wins.

Pending downloads are cancelled when the user switches map floors, so bandwidth is not spent on photos they are no longer browsing.

## Why it matters

| Without cache | With cache |
|---------------|------------|
| Every view = Storage download | First view downloads; later views are local |
| Visible loading while scrolling | Adjacent cards often already on disk |
| Poor experience on slow networks | Cached routes remain viewable offline |

## Key files

| File | Role |
|------|------|
| `services/photoCache/PhotoCacheService.ts` | Core service: queue, downloads, eviction, preload, integrity checks |
| `services/photoCache/types.ts` | `CacheEntry`, `DownloadTask`, public interface |
| `services/photoCache/index.ts` | Singleton export and legacy sync wrapper |
| `services/photoCache/PhotoCacheService.test.ts` | Unit tests (eviction, preload, edge cases) |
| `services/photoCache/PhotoCacheConfigSync.tsx` | Runtime config sync from Firestore / settings |
| `shared/config/photoCacheConfig.ts` | Defaults: max size, preload buffer, concurrency |
| `shared/hooks/useCachedPhotoUri.ts` | Cache-first URI resolution for React components |
| `features/feed/components/CarouselView.tsx` | Calls `preload()` when carousel selection settles |
