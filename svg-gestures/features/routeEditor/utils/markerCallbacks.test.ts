import { createMarkerCallbacks } from './markerCallbacks';
import { HoldMarker } from '../../../shared/types/holds';
import { DEFAULT_HOLD_MARKER_LAYER_CONFIG } from '../../../shared/config/holdMarkerLayerConfig';

describe('markerCallbacks', () => {
  describe('createMarkerCallbacks', () => {
    it('should create callbacks that update marker state correctly', () => {
      let markers: HoldMarker[] = [
        { id: 'marker-1', x: 100, y: 150, r: 30, type: 'start', selected: false },
        { id: 'marker-2', x: 200, y: 250, r: 25, type: 'intermediate', selected: false }
      ];

      const setMarkers = (updater: React.SetStateAction<HoldMarker[]>) => {
        if (typeof updater === 'function') {
          markers = updater(markers);
        } else {
          markers = updater;
        }
      };

      const callbacks = createMarkerCallbacks(setMarkers, DEFAULT_HOLD_MARKER_LAYER_CONFIG);

      // Test handleMoveHold
      callbacks.handleMoveHold('marker-1', 150, 180);
      expect(markers[0]).toEqual({
        id: 'marker-1', x: 150, y: 180, r: 30, type: 'start', selected: false
      });
      expect(markers[1]).toEqual({
        id: 'marker-2', x: 200, y: 250, r: 25, type: 'intermediate', selected: false
      });

      // Test handleResizeHold
      callbacks.handleResizeHold('marker-2', 40);
      expect(markers[1]).toEqual({
        id: 'marker-2', x: 200, y: 250, r: 40, type: 'intermediate', selected: false
      });

      // Test handleSelect - tap at (105, 155) should hit marker-1 (now at 150, 180)
      // Distance = sqrt((105-150)^2 + (155-180)^2) = sqrt(45^2 + 25^2) = sqrt(2025 + 625) = sqrt(2650) ≈ 51.5
      // Radius = 30, so 51.5 > 30, so it shouldn't hit. Let me adjust the test coordinates.
      callbacks.handleSelect(155, 185); // Should hit marker-1 (now at 150, 180)
      expect(markers[0].selected).toBe(true);
      expect(markers[1].selected).toBe(false);

      // Test handleDeselect
      callbacks.handleDeselect();
      expect(markers[0].selected).toBe(false);
      expect(markers[1].selected).toBe(false);

      // Test handleCreateMarker
      const initialLength = markers.length;
      callbacks.handleCreateMarker(300, 350);
      expect(markers).toHaveLength(initialLength + 1);
      expect(markers[markers.length - 1]).toEqual({
        id: expect.stringMatching(/^marker-\d+$/),
        x: 300,
        y: 350,
        r: 30,
        type: 'intermediate',
        selected: false
      });
    });

    it('should handle canvas callbacks without errors', () => {
      let markers: HoldMarker[] = [];
      const setMarkers = (updater: React.SetStateAction<HoldMarker[]>) => {
        if (typeof updater === 'function') {
          markers = updater(markers);
        } else {
          markers = updater;
        }
      };

      const callbacks = createMarkerCallbacks(setMarkers, DEFAULT_HOLD_MARKER_LAYER_CONFIG);

      // These should not throw errors
      expect(() => callbacks.handlePanCanvas(10, 20)).not.toThrow();
      expect(() => callbacks.handleZoomCanvas(1.5)).not.toThrow();
      expect(() => callbacks.handleTapWhileSelected()).not.toThrow();
    });
  });
});
