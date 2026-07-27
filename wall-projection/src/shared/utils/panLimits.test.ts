import { calculatePanLimits, clampPanToLimits } from './panLimits';

describe('panLimits', () => {
  describe('calculatePanLimits', () => {
    it('should allow no panning when scale is 1.0 and content fits container', () => {
      const containerDims = { width: 400, height: 600 };
      const svgViewBox = { width: 400, height: 600 };
      const scale = 1.0;

      const limits = calculatePanLimits(containerDims, svgViewBox, scale);

      expect(limits.minTranslateX).toBe(0);
      expect(limits.maxTranslateX).toBe(0);
      expect(limits.minTranslateY).toBe(0);
      expect(limits.maxTranslateY).toBe(0);
    });

    it('should calculate pan limits when zoomed in (scale > 1.0)', () => {
      const containerDims = { width: 400, height: 600 };
      const svgViewBox = { width: 400, height: 600 };
      const scale = 2.0; // 2x zoom

      const limits = calculatePanLimits(containerDims, svgViewBox, scale);

      // At 2x zoom, content is 800x1200, container is 400x600
      // X: can pan from -200 (left edge) to +200 (right edge)
      // Y: can pan from -300 (top edge) to +300 (bottom edge)
      expect(limits.minTranslateX).toBe(-200);
      expect(limits.maxTranslateX).toBe(200);
      expect(limits.minTranslateY).toBe(-300);
      expect(limits.maxTranslateY).toBe(300);
    });

    it('should handle width-limited container (letterbox)', () => {
      // Container is wider than viewBox aspect ratio
      // This creates letterboxing (black bars top/bottom)
      // Container: 800x600 (AR = 1.33), ViewBox: 400x300 (AR = 1.33, but smaller)
      // Actually, let's use a viewBox that's taller: 400x600 (AR = 0.67)
      const containerDims = { width: 800, height: 600 };
      const svgViewBox = { width: 400, height: 600 }; // Taller aspect ratio
      const scale = 1.5;

      const limits = calculatePanLimits(containerDims, svgViewBox, scale);

      // Container AR (1.33) > ViewBox AR (0.67), so height-limited (pillarbox)
      // Content at scale 1.0: 400x600 (height-limited, matches container height)
      // At 1.5x zoom: 600x900
      // X: scaledContentW (600) < containerW (800) - fits, so no panning (0)
      // Y: scaledContentH (900) > containerH (600) - doesn't fit, so panning needed
      expect(limits.minTranslateX).toBe(0); // Content fits width-wise
      expect(limits.maxTranslateX).toBe(0);
      expect(limits.minTranslateY).toBe(-150); // (600 - 900) / 2
      expect(limits.maxTranslateY).toBe(150); // (900 - 600) / 2
    });

    it('should handle height-limited container (pillarbox)', () => {
      // Container is taller than viewBox aspect ratio
      // This creates pillarboxing (black bars left/right)
      // Container: 400x800 (AR = 0.5), ViewBox: 400x300 (AR = 1.33)
      const containerDims = { width: 400, height: 800 };
      const svgViewBox = { width: 400, height: 300 }; // Wider aspect ratio
      const scale = 1.5;

      const limits = calculatePanLimits(containerDims, svgViewBox, scale);

      // Container AR (0.5) < ViewBox AR (1.33), so width-limited (letterbox)
      // Content at scale 1.0: 400x300 (width-limited, matches container width)
      // At 1.5x zoom: 600x450
      // X: scaledContentW (600) > containerW (400) - doesn't fit, so panning needed
      // Y: scaledContentH (450) < containerH (800) - fits, so no panning (0)
      expect(limits.minTranslateX).toBe(-100); // (400 - 600) / 2
      expect(limits.maxTranslateX).toBe(100); // (600 - 400) / 2
      expect(limits.minTranslateY).toBe(0); // Content fits height-wise
      expect(limits.maxTranslateY).toBe(0);
    });

    it('should handle scale < 1.0 (zoomed out)', () => {
      const containerDims = { width: 400, height: 600 };
      const svgViewBox = { width: 800, height: 1200 };
      const scale = 0.5; // Zoomed out

      const limits = calculatePanLimits(containerDims, svgViewBox, scale);

      // At 0.5x zoom, content is smaller than container - should center (no panning)
      expect(limits.minTranslateX).toBe(0);
      expect(limits.maxTranslateX).toBe(0);
      expect(limits.minTranslateY).toBe(0);
      expect(limits.maxTranslateY).toBe(0);
    });

    it('should handle very large scale', () => {
      const containerDims = { width: 400, height: 600 };
      const svgViewBox = { width: 400, height: 600 };
      const scale = 5.0; // 5x zoom

      const limits = calculatePanLimits(containerDims, svgViewBox, scale);

      // At 5x zoom, content is 2000x3000, container is 400x600
      // X: can pan from -800 to +800
      // Y: can pan from -1200 to +1200
      expect(limits.minTranslateX).toBe(-800);
      expect(limits.maxTranslateX).toBe(800);
      expect(limits.minTranslateY).toBe(-1200);
      expect(limits.maxTranslateY).toBe(1200);
    });
  });

  describe('clampPanToLimits', () => {
    it('should return desired values when within limits', () => {
      const limits = {
        minTranslateX: -100,
        maxTranslateX: 100,
        minTranslateY: -150,
        maxTranslateY: 150,
      };

      const result = clampPanToLimits(50, 75, limits);

      expect(result.translateX).toBe(50);
      expect(result.translateY).toBe(75);
    });

    it('should clamp X when exceeding max', () => {
      const limits = {
        minTranslateX: -100,
        maxTranslateX: 100,
        minTranslateY: -150,
        maxTranslateY: 150,
      };

      const result = clampPanToLimits(200, 75, limits);

      expect(result.translateX).toBe(100); // Clamped to max
      expect(result.translateY).toBe(75);
    });

    it('should clamp X when below min', () => {
      const limits = {
        minTranslateX: -100,
        maxTranslateX: 100,
        minTranslateY: -150,
        maxTranslateY: 150,
      };

      const result = clampPanToLimits(-200, 75, limits);

      expect(result.translateX).toBe(-100); // Clamped to min
      expect(result.translateY).toBe(75);
    });

    it('should clamp Y when exceeding max', () => {
      const limits = {
        minTranslateX: -100,
        maxTranslateX: 100,
        minTranslateY: -150,
        maxTranslateY: 150,
      };

      const result = clampPanToLimits(50, 200, limits);

      expect(result.translateX).toBe(50);
      expect(result.translateY).toBe(150); // Clamped to max
    });

    it('should clamp Y when below min', () => {
      const limits = {
        minTranslateX: -100,
        maxTranslateX: 100,
        minTranslateY: -150,
        maxTranslateY: 150,
      };

      const result = clampPanToLimits(50, -200, limits);

      expect(result.translateX).toBe(50);
      expect(result.translateY).toBe(-150); // Clamped to min
    });

    it('should clamp both X and Y when both exceed limits', () => {
      const limits = {
        minTranslateX: -100,
        maxTranslateX: 100,
        minTranslateY: -150,
        maxTranslateY: 150,
      };

      const result = clampPanToLimits(200, -200, limits);

      expect(result.translateX).toBe(100);
      expect(result.translateY).toBe(-150);
    });

    it('should handle zero limits (no panning allowed)', () => {
      const limits = {
        minTranslateX: 0,
        maxTranslateX: 0,
        minTranslateY: 0,
        maxTranslateY: 0,
      };

      const result = clampPanToLimits(50, -50, limits);

      expect(result.translateX).toBe(0);
      expect(result.translateY).toBe(0);
    });
  });
});

