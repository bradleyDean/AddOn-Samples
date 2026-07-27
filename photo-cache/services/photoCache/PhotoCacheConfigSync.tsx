/**
 * PhotoCacheConfigSync
 *
 * Headless component that keeps `photoCacheService`'s max-cached-images limit in
 * sync with the effective runtime config. Precedence:
 *   per-user dev override (`settings.photoCacheMaxImages`)
 *     > global runtime config (`APP_CONFIG/photo`)
 *       > compiled-in default.
 *
 * Mounted once near the top of the tree (under both SettingsProvider and
 * AppConfigProvider) so the production cache size is applied at startup and
 * updates live when the global config doc changes. Renders nothing.
 */
import { useEffect } from 'react';
import { useServices } from '../ServicesProvider';
import { useSettings } from '../../context/SettingsContext';
import { useAppConfig } from '../../context/AppConfigContext';

export const PhotoCacheConfigSync: React.FC = () => {
  const { photoCacheService, isPhotoCacheReady } = useServices();
  const { settings } = useSettings();
  const { maxCachedImages } = useAppConfig();

  useEffect(() => {
    if (!isPhotoCacheReady) return;
    // Per-user dev override wins when present; otherwise the global config value.
    const effectiveMax = settings.photoCacheMaxImages ?? maxCachedImages;
    photoCacheService.setMaxCachedImages(effectiveMax);
  }, [
    isPhotoCacheReady,
    settings.photoCacheMaxImages,
    maxCachedImages,
    photoCacheService,
  ]);

  return null;
};
