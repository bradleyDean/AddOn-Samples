import { PhotoCache, RoutesById } from './index';
import type { Route } from '../../shared/types/holds';

describe('PhotoCache', () => {
  describe('preload', () => {
    it('should be a no-op and not throw', () => {
      const routesById: RoutesById = {};
      const routeIds: string[] = ['route1', 'route2'];
      
      expect(() => {
        PhotoCache.preload(routeIds, routesById);
      }).not.toThrow();
    });

    it('should handle empty routeIds array', () => {
      const routesById: RoutesById = {};
      const routeIds: string[] = [];
      
      expect(() => {
        PhotoCache.preload(routeIds, routesById);
      }).not.toThrow();
    });

    it('should handle empty routesById', () => {
      const routesById: RoutesById = {};
      const routeIds: string[] = ['route1'];
      
      expect(() => {
        PhotoCache.preload(routeIds, routesById);
      }).not.toThrow();
    });
  });

  describe('getUri', () => {
    describe('route with photos and cloudUri', () => {
      it('should return cloudUri when available', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path.jpg',
              cloudUri: 'https://storage.googleapis.com/photo.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBe('https://storage.googleapis.com/photo.jpg');
      });

      it('should prefer cloudUri over localUri', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path.jpg',
              cloudUri: 'https://storage.googleapis.com/photo.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBe('https://storage.googleapis.com/photo.jpg');
        expect(result).not.toBe('file://local/path.jpg');
      });
    });

    describe('route with photos but only localUri', () => {
      it('should return localUri when cloudUri is not available', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBe('file://local/path.jpg');
      });
    });

    describe('route with no photos', () => {
      it('should return undefined when route has no photos array', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBeUndefined();
      });

      it('should return undefined when route photos is null', () => {
        const route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: null as any,
        };

        const routesById: RoutesById = {
          route1: route as Route,
        };

        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBeUndefined();
      });
    });

    describe('route that does not exist', () => {
      it('should return undefined when routeId is not in routesById', () => {
        const routesById: RoutesById = {};

        const result = PhotoCache.getUri('nonexistent', routesById);
        expect(result).toBeUndefined();
      });

      it('should return undefined when routesById is empty', () => {
        const routesById: RoutesById = {};

        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBeUndefined();
      });
    });

    describe('photo index out of bounds', () => {
      it('should return undefined when photoIndex is negative', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path.jpg',
              cloudUri: 'https://storage.googleapis.com/photo.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById, -1);
        expect(result).toBeUndefined();
      });

      it('should return undefined when photoIndex exceeds array length', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path1.jpg',
              cloudUri: 'https://storage.googleapis.com/photo1.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById, 1);
        expect(result).toBeUndefined();
      });

      it('should return undefined when photoIndex equals array length', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path1.jpg',
              cloudUri: 'https://storage.googleapis.com/photo1.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById, 1);
        expect(result).toBeUndefined();
      });
    });

    describe('multiple photos', () => {
      it('should return correct photo for index 0 (default)', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path1.jpg',
              cloudUri: 'https://storage.googleapis.com/photo1.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
            {
              localUri: 'file://local/path2.jpg',
              cloudUri: 'https://storage.googleapis.com/photo2.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBe('https://storage.googleapis.com/photo1.jpg');
      });

      it('should return correct photo for specific index', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path1.jpg',
              cloudUri: 'https://storage.googleapis.com/photo1.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
            {
              localUri: 'file://local/path2.jpg',
              cloudUri: 'https://storage.googleapis.com/photo2.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById, 1);
        expect(result).toBe('https://storage.googleapis.com/photo2.jpg');
      });

      it('should handle routes with many photos', () => {
        const photos = Array.from({ length: 5 }, (_, i) => ({
          localUri: `file://local/path${i}.jpg`,
          cloudUri: `https://storage.googleapis.com/photo${i}.jpg`,
          holdMarkers: [],
          width: 1000,
          height: 1500,
        }));

        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos,
        };

        const routesById: RoutesById = {
          route1: route,
        };

        const result = PhotoCache.getUri('route1', routesById, 3);
        expect(result).toBe('https://storage.googleapis.com/photo3.jpg');
      });
    });

    describe('error case: photo with neither cloudUri nor localUri', () => {
      it('should return undefined when photo has no URIs', () => {
        const route: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: '',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route,
        };

        // This is an error case - photo exists but has no valid URI
        // Should fail silently and return undefined
        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBeUndefined();
      });

      it('should return undefined when photo has empty strings for URIs', () => {
        const route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: '',
              cloudUri: '',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route as Route,
        };

        // Empty strings are falsy, so this should return undefined
        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      it('should handle photo with only localUri when cloudUri is explicitly undefined', () => {
        const route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Test Route',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path.jpg',
              cloudUri: undefined,
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1: route as Route,
        };

        const result = PhotoCache.getUri('route1', routesById);
        expect(result).toBe('file://local/path.jpg');
      });

      it('should handle multiple routes in routesById', () => {
        const route1: Route = {
          id: 'route1',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Route 1',
          grade: 'V5',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 100, ySvg: 200 },
            t: 0.5,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.5000',
          },
          photos: [
            {
              localUri: 'file://local/path1.jpg',
              cloudUri: 'https://storage.googleapis.com/photo1.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const route2: Route = {
          id: 'route2',
          mapId: 'map1',
          createdAt: '2024-01-01T00:00:00Z',
          name: 'Route 2',
          grade: 'V6',
          tags: [],
          description: 'Test description',
          location: {
            svgPoint: { xSvg: 200, ySvg: 300 },
            t: 0.6,
            wallCode: '0a0',
            floor: 0,
            dist: '0a00.6000',
          },
          photos: [
            {
              localUri: 'file://local/path2.jpg',
              cloudUri: 'https://storage.googleapis.com/photo2.jpg',
              holdMarkers: [],
              width: 1000,
              height: 1500,
            },
          ],
        };

        const routesById: RoutesById = {
          route1,
          route2,
        };

        const result1 = PhotoCache.getUri('route1', routesById);
        const result2 = PhotoCache.getUri('route2', routesById);

        expect(result1).toBe('https://storage.googleapis.com/photo1.jpg');
        expect(result2).toBe('https://storage.googleapis.com/photo2.jpg');
      });
    });
  });
});

