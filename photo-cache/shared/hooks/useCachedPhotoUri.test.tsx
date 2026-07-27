/**
 * Unit tests for useCachedPhotoUri (§3).
 * Covers cache hit, miss→live-swap, not-ready fallback, and edit re-resolution.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useCachedPhotoUri } from './useCachedPhotoUri';
import type { RoutesById } from '../../services/photoCache';

let mockReady: boolean;
const mockGetUri = jest.fn();
let entryListener: ((uri: string) => void) | null;
const mockOnEntryReady = jest.fn((_key: string, listener: (uri: string) => void) => {
  entryListener = listener;
  return () => {
    entryListener = null;
  };
});

jest.mock('../../services/ServicesProvider', () => ({
  useServices: () => ({
    photoCacheService: { getUri: mockGetUri, onEntryReady: mockOnEntryReady },
    isPhotoCacheReady: mockReady,
  }),
}));

const routes = (cloudUri?: string): RoutesById =>
  ({ r1: { photos: [{ cloudUri }] } } as unknown as RoutesById);

describe('useCachedPhotoUri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReady = true;
    entryListener = null;
  });

  it('returns the cached file:// path on a hit', async () => {
    mockGetUri.mockResolvedValue('file:///cache/r1_0.jpg');
    const { result } = renderHook(() => useCachedPhotoUri('r1', 0, routes('urlA')));
    await waitFor(() => expect(result.current).toBe('file:///cache/r1_0.jpg'));
  });

  it('returns cloudUri on a miss, then swaps to file:// when the download lands', async () => {
    mockGetUri.mockResolvedValue('urlA'); // miss returns remote URL
    const { result } = renderHook(() => useCachedPhotoUri('r1', 0, routes('urlA')));
    await waitFor(() => expect(result.current).toBe('urlA'));

    act(() => {
      entryListener?.('file:///cache/r1_0.jpg');
    });
    await waitFor(() => expect(result.current).toBe('file:///cache/r1_0.jpg'));
  });

  it('falls back to the raw cloudUri while the cache is not ready', () => {
    mockReady = false;
    const { result } = renderHook(() => useCachedPhotoUri('r1', 0, routes('urlA')));
    expect(result.current).toBe('urlA');
    expect(mockGetUri).not.toHaveBeenCalled();
  });

  it('re-resolves when cloudUri changes (edited photo)', async () => {
    mockGetUri.mockResolvedValueOnce('file:///cache/r1_0.jpg');
    const { result, rerender } = renderHook(
      ({ c }: { c: string }) => useCachedPhotoUri('r1', 0, routes(c)),
      { initialProps: { c: 'urlA' } }
    );
    await waitFor(() => expect(result.current).toBe('file:///cache/r1_0.jpg'));

    // After an edit, getUri invalidates and returns the new remote URL.
    mockGetUri.mockResolvedValueOnce('urlB');
    rerender({ c: 'urlB' });
    await waitFor(() => expect(result.current).toBe('urlB'));
  });
});
