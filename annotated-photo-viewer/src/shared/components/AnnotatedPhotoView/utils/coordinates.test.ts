/**
 * Unit tests for coordinate conversion utilities
 */

import {
  calculateImageBounds,
  containerToNormalized,
  normalizedToContainer,
  pixelRadiusToNormalized,
  normalizedRadiusToPixel,
  isPointInImage,
  clampPointToImage,
  isInsideNormalizedCircle,
} from './coordinates';

describe('calculateImageBounds', () => {
  describe('letterbox cases (image wider than container)', () => {
    it('should calculate bounds for wide image in square container', () => {
      // 1000x500 image (2:1 aspect) in 400x400 container
      const bounds = calculateImageBounds(400, 400, 1000, 500);
      
      expect(bounds.left).toBe(0);
      expect(bounds.width).toBe(400);
      expect(bounds.height).toBe(200); // 400 / 2 = 200
      expect(bounds.top).toBe(100); // (400 - 200) / 2 = 100
    });

    it('should calculate bounds for wide image in portrait container', () => {
      // 1600x900 image (16:9 aspect) in 320x480 container
      const bounds = calculateImageBounds(320, 480, 1600, 900);
      
      expect(bounds.left).toBe(0);
      expect(bounds.width).toBe(320);
      expect(bounds.height).toBe(180); // 320 / (16/9) = 180
      expect(bounds.top).toBe(150); // (480 - 180) / 2 = 150
    });
  });

  describe('pillarbox cases (image taller than container)', () => {
    it('should calculate bounds for tall image in square container', () => {
      // 500x1000 image (1:2 aspect) in 400x400 container
      const bounds = calculateImageBounds(400, 400, 500, 1000);
      
      expect(bounds.top).toBe(0);
      expect(bounds.height).toBe(400);
      expect(bounds.width).toBe(200); // 400 / 2 = 200
      expect(bounds.left).toBe(100); // (400 - 200) / 2 = 100
    });

    it('should calculate bounds for tall image in landscape container', () => {
      // 900x1600 image (9:16 aspect) in 480x320 container
      const bounds = calculateImageBounds(480, 320, 900, 1600);
      
      expect(bounds.top).toBe(0);
      expect(bounds.height).toBe(320);
      expect(bounds.width).toBe(180); // 320 / (16/9) = 180
      expect(bounds.left).toBe(150); // (480 - 180) / 2 = 150
    });
  });

  describe('matching aspect ratios', () => {
    it('should fill container when aspects match exactly', () => {
      // 1000x500 image in 400x200 container (both 2:1)
      const bounds = calculateImageBounds(400, 200, 1000, 500);
      
      expect(bounds.left).toBe(0);
      expect(bounds.top).toBe(0);
      expect(bounds.width).toBe(400);
      expect(bounds.height).toBe(200);
    });

    it('should handle square image in square container', () => {
      const bounds = calculateImageBounds(300, 300, 500, 500);
      
      expect(bounds.left).toBe(0);
      expect(bounds.top).toBe(0);
      expect(bounds.width).toBe(300);
      expect(bounds.height).toBe(300);
    });
  });

  describe('edge cases', () => {
    it('should handle zero container dimensions', () => {
      const bounds = calculateImageBounds(0, 0, 100, 100);
      
      expect(bounds.left).toBe(0);
      expect(bounds.top).toBe(0);
      expect(bounds.width).toBe(0);
      expect(bounds.height).toBe(0);
    });

    it('should handle zero image dimensions', () => {
      const bounds = calculateImageBounds(400, 400, 0, 0);
      
      expect(bounds.left).toBe(0);
      expect(bounds.top).toBe(0);
      expect(bounds.width).toBe(400);
      expect(bounds.height).toBe(400);
    });
  });
});

describe('containerToNormalized', () => {
  const letterboxBounds = { left: 0, top: 100, width: 400, height: 200 };
  const pillarboxBounds = { left: 100, top: 0, width: 200, height: 400 };

  it('should convert center of image to (0.5, 0.5) - letterbox', () => {
    // Center of visible image: x=200, y=200 (100 + 100)
    const point = containerToNormalized(200, 200, letterboxBounds);
    
    expect(point.x).toBeCloseTo(0.5);
    expect(point.y).toBeCloseTo(0.5);
  });

  it('should convert center of image to (0.5, 0.5) - pillarbox', () => {
    // Center of visible image: x=200 (100 + 100), y=200
    const point = containerToNormalized(200, 200, pillarboxBounds);
    
    expect(point.x).toBeCloseTo(0.5);
    expect(point.y).toBeCloseTo(0.5);
  });

  it('should convert top-left corner to (0, 0)', () => {
    const point = containerToNormalized(0, 100, letterboxBounds);
    
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
  });

  it('should convert bottom-right corner to (1, 1)', () => {
    const point = containerToNormalized(400, 300, letterboxBounds);
    
    expect(point.x).toBeCloseTo(1);
    expect(point.y).toBeCloseTo(1);
  });

  it('should return negative values for taps in letterbox area', () => {
    // Tap at y=50, which is above the image (letterbox starts at y=100)
    const point = containerToNormalized(200, 50, letterboxBounds);
    
    expect(point.x).toBeCloseTo(0.5);
    expect(point.y).toBeLessThan(0);
  });

  it('should handle zero-size bounds', () => {
    const zeroBounds = { left: 0, top: 0, width: 0, height: 0 };
    const point = containerToNormalized(100, 100, zeroBounds);
    
    expect(point.x).toBe(0);
    expect(point.y).toBe(0);
  });
});

describe('normalizedToContainer', () => {
  const letterboxBounds = { left: 0, top: 100, width: 400, height: 200 };

  it('should convert (0.5, 0.5) to center of image', () => {
    const point = normalizedToContainer(0.5, 0.5, letterboxBounds);
    
    expect(point.x).toBe(200);
    expect(point.y).toBe(200); // 100 + 100
  });

  it('should convert (0, 0) to top-left of image', () => {
    const point = normalizedToContainer(0, 0, letterboxBounds);
    
    expect(point.x).toBe(0);
    expect(point.y).toBe(100); // letterbox offset
  });

  it('should convert (1, 1) to bottom-right of image', () => {
    const point = normalizedToContainer(1, 1, letterboxBounds);
    
    expect(point.x).toBe(400);
    expect(point.y).toBe(300); // 100 + 200
  });
});

describe('round-trip conversion', () => {
  const bounds = { left: 50, top: 100, width: 300, height: 200 };

  it('should preserve coordinates through round-trip conversion', () => {
    const originalContainer = { x: 200, y: 200 };
    
    const normalized = containerToNormalized(
      originalContainer.x,
      originalContainer.y,
      bounds
    );
    const backToContainer = normalizedToContainer(
      normalized.x,
      normalized.y,
      bounds
    );
    
    expect(backToContainer.x).toBeCloseTo(originalContainer.x);
    expect(backToContainer.y).toBeCloseTo(originalContainer.y);
  });

  it('should preserve multiple points through round-trip', () => {
    const testPoints = [
      { x: 50, y: 100 },   // top-left of image
      { x: 350, y: 300 },  // bottom-right of image
      { x: 200, y: 200 },  // center
      { x: 125, y: 150 },  // arbitrary point
    ];

    testPoints.forEach((original) => {
      const normalized = containerToNormalized(original.x, original.y, bounds);
      const roundTrip = normalizedToContainer(normalized.x, normalized.y, bounds);
      
      expect(roundTrip.x).toBeCloseTo(original.x, 5);
      expect(roundTrip.y).toBeCloseTo(original.y, 5);
    });
  });
});

describe('pixelRadiusToNormalized / normalizedRadiusToPixel', () => {
  const bounds = { left: 0, top: 0, width: 400, height: 600 };

  it('should convert pixel radius to normalized', () => {
    const normalized = pixelRadiusToNormalized(40, bounds);
    
    expect(normalized).toBeCloseTo(0.1); // 40 / 400 = 0.1
  });

  it('should convert normalized radius to pixels', () => {
    const pixels = normalizedRadiusToPixel(0.1, bounds);
    
    expect(pixels).toBe(40); // 0.1 * 400 = 40
  });

  it('should round-trip radius conversion', () => {
    const originalPixels = 30;
    const normalized = pixelRadiusToNormalized(originalPixels, bounds);
    const backToPixels = normalizedRadiusToPixel(normalized, bounds);
    
    expect(backToPixels).toBeCloseTo(originalPixels);
  });

  it('should handle zero-width bounds', () => {
    const zeroBounds = { left: 0, top: 0, width: 0, height: 100 };
    const normalized = pixelRadiusToNormalized(50, zeroBounds);
    
    expect(normalized).toBe(0);
  });
});

describe('isPointInImage', () => {
  it('should return true for center point', () => {
    expect(isPointInImage({ x: 0.5, y: 0.5 })).toBe(true);
  });

  it('should return true for corner points', () => {
    expect(isPointInImage({ x: 0, y: 0 })).toBe(true);
    expect(isPointInImage({ x: 1, y: 0 })).toBe(true);
    expect(isPointInImage({ x: 0, y: 1 })).toBe(true);
    expect(isPointInImage({ x: 1, y: 1 })).toBe(true);
  });

  it('should return false for points outside image', () => {
    expect(isPointInImage({ x: -0.1, y: 0.5 })).toBe(false);
    expect(isPointInImage({ x: 1.1, y: 0.5 })).toBe(false);
    expect(isPointInImage({ x: 0.5, y: -0.1 })).toBe(false);
    expect(isPointInImage({ x: 0.5, y: 1.1 })).toBe(false);
  });
});

describe('clampPointToImage', () => {
  it('should not modify points already in range', () => {
    const point = clampPointToImage({ x: 0.5, y: 0.5 });
    
    expect(point.x).toBe(0.5);
    expect(point.y).toBe(0.5);
  });

  it('should clamp negative coordinates to 0', () => {
    const point = clampPointToImage({ x: -0.5, y: -0.2 });
    
    expect(point.x).toBe(0);
    expect(point.y).toBe(0);
  });

  it('should clamp coordinates > 1 to 1', () => {
    const point = clampPointToImage({ x: 1.5, y: 1.2 });
    
    expect(point.x).toBe(1);
    expect(point.y).toBe(1);
  });

  it('should handle mixed clamping', () => {
    const point = clampPointToImage({ x: -0.1, y: 1.1 });
    
    expect(point.x).toBe(0);
    expect(point.y).toBe(1);
  });
});

describe('isInsideNormalizedCircle', () => {
  describe('with square image (aspect = 1)', () => {
    const aspect = 1;

    it('should return true for tap at circle center', () => {
      const result = isInsideNormalizedCircle(0.5, 0.5, 0.5, 0.5, 0.1, aspect);
      expect(result).toBe(true);
    });

    it('should return true for tap inside circle', () => {
      const result = isInsideNormalizedCircle(0.55, 0.5, 0.5, 0.5, 0.1, aspect);
      expect(result).toBe(true);
    });

    it('should return false for tap outside circle', () => {
      const result = isInsideNormalizedCircle(0.7, 0.5, 0.5, 0.5, 0.1, aspect);
      expect(result).toBe(false);
    });

    it('should return true for tap exactly on edge', () => {
      const result = isInsideNormalizedCircle(0.6, 0.5, 0.5, 0.5, 0.1, aspect);
      expect(result).toBe(true);
    });
  });

  describe('with non-square image', () => {
    const aspect = 2; // width is 2x height

    it('should correctly handle aspect ratio adjustment', () => {
      // Circle at center with radius 0.1
      // With aspect=2, Y distances are scaled by 2
      
      // Tap 0.05 to the right (should be inside: dx=0.05, dy*aspect=0, dist=0.05 < 0.1)
      expect(isInsideNormalizedCircle(0.55, 0.5, 0.5, 0.5, 0.1, aspect)).toBe(true);
      
      // Tap 0.03 down (should be inside: dx=0, dy*aspect=0.03*2=0.06, dist=0.06 < 0.1)
      expect(isInsideNormalizedCircle(0.5, 0.53, 0.5, 0.5, 0.1, aspect)).toBe(true);
      
      // Tap 0.1 down (should be outside: dx=0, dy*aspect=0.1*2=0.2, dist=0.2 > 0.1)
      expect(isInsideNormalizedCircle(0.5, 0.6, 0.5, 0.5, 0.1, aspect)).toBe(false);
    });
  });
});

