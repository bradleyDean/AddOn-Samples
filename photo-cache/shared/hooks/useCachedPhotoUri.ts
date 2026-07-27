/**
 * useCachedPhotoUri
 *
 * Resolves the URI a photo component should render, cache-first:
 * - Returns the local `file://` path when the photo is cached on disk.
 * - Otherwise returns the remote `cloudUri` (and the cache queues a background
 *   download); when that download lands, the hook swaps to the `file://` path
 *   via the cache's readiness emitter.
 * - Falls back to the raw remote/local URI while the cache is still initializing.
 *
 * This is the single seam that makes the photo cache the source of truth for
 * display. Content-aware invalidation (edited photos) is handled inside
 * `photoCacheService.getUri` — see the route photo cache fix plan.
 */

import { useEffect, useState } from 'react';
import { useServices } from '../../services/ServicesProvider';
import type { RoutesById } from '../../services/photoCache';

export function useCachedPhotoUri(
  routeId: string,
  photoIndex: number,
  routesById: RoutesById
): string | undefined {
  const { photoCacheService, isPhotoCacheReady } = useServices();

  const photo = routesById[routeId]?.photos?.[photoIndex];
  const cloudUri = photo?.cloudUri;
  const localUri = photo?.localUri;
  const fallback = cloudUri || localUri;

  // While the cache is initializing we render the raw URI (preserves prior
  // behavior). Once the cache is ready we start from `undefined` so a cached
  // photo resolves to its `file://` path without first hitting the network.
  const [uri, setUri] = useState<string | undefined>(
    isPhotoCacheReady ? undefined : fallback
  );

  useEffect(() => {
    let cancelled = false;

    if (!photo) {
      setUri(undefined);
      return;
    }

    if (!isPhotoCacheReady) {
      setUri(fallback);
      return;
    }

    // Resolve cache-first. getUri returns the local file:// path on a hit, or
    // the remote cloudUri on a miss (and queues the download).
    photoCacheService
      .getUri(routeId, routesById, photoIndex)
      .then((resolved) => {
        if (!cancelled && resolved) setUri(resolved);
      })
      .catch(() => {
        if (!cancelled) setUri(fallback);
      });

    // Swap to the local file the moment a background download completes.
    const cacheKey = `${routeId}_${photoIndex}`;
    const unsubscribe = photoCacheService.onEntryReady(cacheKey, (fileUri) => {
      if (!cancelled) setUri(fileUri);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // routesById is intentionally omitted: the meaningful input is cloudUri,
    // which we key on. Re-running on every routesById identity change would
    // thrash the resolver without changing the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, photoIndex, cloudUri, isPhotoCacheReady]);

  return uri;
}

export default useCachedPhotoUri;
