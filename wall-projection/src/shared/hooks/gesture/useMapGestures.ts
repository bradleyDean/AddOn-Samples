import React from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, SharedValue } from 'react-native-reanimated';
import { Wall } from '../../utils/wall';
import { WallData, MapConfig, RouteLocationPin } from '../../types/map';
import { MapLocation } from '../../types/holds';
import { screenToSvg } from '../../utils/coordinateConversion';

/**
 * Hit detection radius multiplier for pin taps.
 * Taps within (pinRadius * PIN_HIT_RADIUS_MULTIPLIER) of the nearest pin register as hits.
 */
const PIN_HIT_RADIUS_MULTIPLIER = 10;

/**
 * Gesture hook for map tap interactions
 * Handles coordinate conversion, pin tap detection, and wall projection
 * 
 * Modes:
 * - 'routeEditor': Handles pin taps and wall projection for location creation
 * - 'feed': Only handles pin taps, skips wall projection
 */
export function useMapGestures({
  wallsData,
  svgViewBox,
  containerDims,
  scale,
  translateXScreen,
  translateYScreen,
  onLocationSelected,
  onRoutePinTap,
  onDebugTap,
  onProjectedLocation,
  locationPins,
  mode = 'routeEditor',
  config,
}: {
  wallsData: WallData[];
  svgViewBox: { width: number; height: number };
  containerDims: { width: number; height: number };
  scale: SharedValue<number>;
  translateXScreen: SharedValue<number>;
  translateYScreen: SharedValue<number>;
  onLocationSelected: (location: MapLocation) => void;
  onRoutePinTap?: (routeId: string) => void;
  onDebugTap?: (svgPoint: { 
    xSvg: number; 
    ySvg: number;
    debugCenters?: {
      containerCenter: { x: number; y: number };
      contentCenter: { x: number; y: number };
    };
  }) => void;
  onProjectedLocation?: (svgPoint: { xSvg: number; ySvg: number }) => void;
  locationPins?: RouteLocationPin[];
  mode?: 'routeEditor' | 'feed';
  config: MapConfig;
}) {
  // Create Wall instances from WallData, memoized to avoid recreation
  const walls = React.useMemo(() => {
    return wallsData.map(
      (wallData) =>
        new Wall(wallData.pathData, wallData.wallCode, config.wallHitBoxPadding)
    );
  }, [wallsData, config.wallHitBoxPadding]);

  // Stable callback reference for runOnJS
  const handleLocationSelected = React.useCallback(
    (location: MapLocation) => onLocationSelected(location),
    [onLocationSelected]
  );

  // Stable callback reference for pin tap
  const handleRoutePinTap = React.useCallback(
    (routeId: string) => {
      if (onRoutePinTap) {
        onRoutePinTap(routeId);
      }
    },
    [onRoutePinTap]
  );

  // JS function to handle coordinate conversion and wall finding
  const convertAndFindLocation = React.useCallback(
    (
      xScreen: number,
      yScreen: number,
      currentScale: number,
      currentTranslateX: number,
      currentTranslateY: number
    ) => {
      // 1. Convert screen coordinates to SVG coordinates
      const svgCoords = screenToSvg(
        xScreen,
        yScreen,
        containerDims,
        svgViewBox
      );

      // Debug: report converted svg coordinates and debug centers
      if (onDebugTap) {
        onDebugTap({ 
          xSvg: svgCoords.xSvg, 
          ySvg: svgCoords.ySvg,
          debugCenters: svgCoords.debugCenters,
        });
      }

      // 2. Check if tap hits any route pin (before wall projection)
      // Find the nearest pin and check if tap is within expanded hit radius
      if (locationPins && locationPins.length > 0 && onRoutePinTap) {
        let nearestPin: RouteLocationPin | null = null;
        let nearestDistSq = Infinity;
        
        for (const pin of locationPins) {
          const pinX = pin.location.svgPoint.xSvg;
          const pinY = pin.location.svgPoint.ySvg;
          const dx = svgCoords.xSvg - pinX;
          const dy = svgCoords.ySvg - pinY;
          const distSq = dx * dx + dy * dy;
          
          if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestPin = pin;
          }
        }
        
        // If we found a nearest pin, check if tap is within hit radius
        if (nearestPin) {
          const pinRadius = nearestPin.radius ?? config.defaultPinRadius;
          const hitRadius = pinRadius * PIN_HIT_RADIUS_MULTIPLIER;
          
          if (nearestDistSq <= hitRadius * hitRadius) {
            handleRoutePinTap(nearestPin.id);
            if (onProjectedLocation) {
              onProjectedLocation({ xSvg: NaN, ySvg: NaN });
            }
            return; // Early return - don't process wall projection
          }
        }
      }

      // 3. Skip wall projection in feed mode (only pin taps matter)
      if (mode === 'feed') {
        // In feed mode, if no pin was hit, do nothing
        if (onProjectedLocation) {
          onProjectedLocation({ xSvg: NaN, ySvg: NaN });
        }
        return; // Early return - skip wall projection
      }

      // 4. Find closest wall segment (only in routeEditor mode)
      let closestProjection: {
        projection: { svgPoint: [number, number]; sqDist: number; t: number; segment: number };
        wallData: WallData;
        wallIndex: number;
      } | null = null;

      for (let i = 0; i < walls.length; i++) {
        const wall = walls[i];
        const projection = wall.getClosestPoint(svgCoords.xSvg, svgCoords.ySvg);
        if (projection) {
          if (
            !closestProjection ||
            projection.sqDist < closestProjection.projection.sqDist
          ) {
            const wallData = wallsData[i];
            closestProjection = {
              projection,
              wallData,
              wallIndex: i,
            };
          }
        }
      }

      // 5. Create MapLocation object if we found a wall
      if (closestProjection) {
        const { projection, wallData, wallIndex } = closestProjection;
        const wall = walls[wallIndex];
        
        // Calculate fractional distance (0-1) along the entire wall path
        // t should represent the fraction of total wall length from start to projected point
        const totalPathLength = wall.getTotalPathLength();
        const cumulativeDistanceToSegment = wall.getCumulativeDistanceToSegment(projection.segment);
        const segmentLength = wall.getSegmentLength(projection.segment);
        const distanceAlongSegment = projection.t * segmentLength;
        const totalDistanceFromStart = cumulativeDistanceToSegment + distanceAlongSegment;
        
        // t is the fractional distance along the entire wall (0-1), rounded to 4 decimal places
        const totalT = totalPathLength > 0 
          ? Math.round((totalDistanceFromStart / totalPathLength) * 10000) / 10000 
          : 0;

        const location: MapLocation = {
          svgPoint: {
            xSvg: projection.svgPoint[0],
            ySvg: projection.svgPoint[1],
          },
          wallCode: wallData.wallCode,
          t: totalT,
          floor: wallData.floor,
          dist: `${wallData.wallCode}${totalT}`,
        };

        // Report projected location for visualization
        if (onProjectedLocation) {
          const projectedPoint = {
            xSvg: projection.svgPoint[0],
            ySvg: projection.svgPoint[1],
          };
          onProjectedLocation(projectedPoint);
        }

        handleLocationSelected(location);
      } else {
        // Clear projected location when no wall is found
        if (onProjectedLocation) {
          onProjectedLocation({ xSvg: NaN, ySvg: NaN });
        }
        console.warn('[convertAndFindLocation] No wall found near tap. Check wall extraction/parsing and hitbox padding.');
      }
    },
    [walls, wallsData, containerDims, svgViewBox, handleLocationSelected, handleRoutePinTap, onRoutePinTap, onDebugTap, onProjectedLocation, locationPins, mode, config]
  );

  // Map tap gesture - converts screen coords to SVG, finds closest wall, creates MapLocation
  const mapTap = React.useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(350)
        .maxDeltaX(12)
        .maxDeltaY(12)
        .numberOfTaps(1)
        .onTouchesDown((_e) => {
          'worklet';
        })
        .onBegin((_e) => {
          'worklet';
        })
        .onEnd((e) => {
          'worklet';
          // Get current scale and translation values from shared values
          const currentScale = scale.value;
          const currentTranslateX = translateXScreen.value;
          const currentTranslateY = translateYScreen.value;

          // Call JS function to do coordinate conversion and wall finding
          runOnJS(convertAndFindLocation)(
            e.x,
            e.y,
            currentScale,
            currentTranslateX,
            currentTranslateY
          );
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convertAndFindLocation]
  );

  return React.useMemo(
    () => ({
      combined: mapTap,
      mapTap,
    }),
    [mapTap]
  );
}

