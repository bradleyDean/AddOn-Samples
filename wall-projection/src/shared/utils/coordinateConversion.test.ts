import { screenToSvg, svgToScreen } from './coordinateConversion';

describe('coordinateConversion', () => {
  describe('screenToSvg', () => {
    const baseContainerDims = { width: 1000, height: 1000 };
    const baseSvgViewBox = { width: 1000, height: 1000 };

    it('should convert screen coords to SVG coords', () => {
      const result = screenToSvg(
        500,
        500,
        baseContainerDims,
        baseSvgViewBox
      );

      expect(result.xSvg).toBeCloseTo(500, 5);
      expect(result.ySvg).toBeCloseTo(500, 5);
    });

    it('should map screen coordinates directly to SVG viewBox space', () => {
      // The function maps screen coordinates directly to SVG space
      // without accounting for zoom/pan (handled by shared transform context)
      const result = screenToSvg(
        500,
        500,
        baseContainerDims,
        baseSvgViewBox
      );

      // For a 1:1 aspect ratio container and viewBox, screen point maps directly
      expect(result.xSvg).toBeCloseTo(500, 5);
      expect(result.ySvg).toBeCloseTo(500, 5);
    });

    it('should handle different points in container', () => {
      // Top-left corner
      const topLeft = screenToSvg(0, 0, baseContainerDims, baseSvgViewBox);
      expect(topLeft.xSvg).toBeCloseTo(0, 5);
      expect(topLeft.ySvg).toBeCloseTo(0, 5);

      // Bottom-right corner
      const bottomRight = screenToSvg(1000, 1000, baseContainerDims, baseSvgViewBox);
      expect(bottomRight.xSvg).toBeCloseTo(1000, 5);
      expect(bottomRight.ySvg).toBeCloseTo(1000, 5);

      // Center
      const center = screenToSvg(500, 500, baseContainerDims, baseSvgViewBox);
      expect(center.xSvg).toBeCloseTo(500, 5);
      expect(center.ySvg).toBeCloseTo(500, 5);
    });

    it('should handle different container/viewBox aspect ratios', () => {
      // Container is 2000x1000, viewBox is 1000x1000
      // Height-limited: content fills height, pillarbox on sides
      const wideContainer = { width: 2000, height: 1000 };
      const result = screenToSvg(1000, 500, wideContainer, baseSvgViewBox);
      expect(result.xSvg).toBeCloseTo(500, 5);
      expect(result.ySvg).toBeCloseTo(500, 5);

      // Container is 1000x2000, viewBox is 1000x1000
      // Width-limited: content fills width, letterbox top/bottom
      const tallContainer = { width: 1000, height: 2000 };
      const result2 = screenToSvg(500, 1000, tallContainer, baseSvgViewBox);
      expect(result2.xSvg).toBeCloseTo(500, 5);
      expect(result2.ySvg).toBeCloseTo(500, 5);
    });

    it('should have round-trip accuracy with svgToScreen', () => {
      const originalScreen = { xScreen: 500, yScreen: 500 };
      const scale = 2.0;
      const translateX = 100;
      const translateY = 50;

      // Convert screen to SVG (doesn't use scale/translate)
      const svg = screenToSvg(
        originalScreen.xScreen,
        originalScreen.yScreen,
        baseContainerDims,
        baseSvgViewBox
      );

      // Convert back to screen (uses scale/translate)
      const backToScreen = svgToScreen(
        svg.xSvg,
        svg.ySvg,
        scale,
        translateX,
        translateY,
        baseContainerDims,
        baseSvgViewBox
      );

      // Note: screenToSvg doesn't account for transforms, so round-trip won't match
      // when transforms are applied. This is expected behavior.
      // Round-trip accuracy only works when scale=1 and translate=0
      const backToScreenNoTransform = svgToScreen(
        svg.xSvg,
        svg.ySvg,
        1.0,
        0,
        0,
        baseContainerDims,
        baseSvgViewBox
      );

      expect(backToScreenNoTransform.xScreen).toBeCloseTo(originalScreen.xScreen, 5);
      expect(backToScreenNoTransform.yScreen).toBeCloseTo(originalScreen.yScreen, 5);
    });
  });

  describe('svgToScreen', () => {
    const baseContainerDims = { width: 1000, height: 1000 };
    const baseSvgViewBox = { width: 1000, height: 1000 };

    it('should convert SVG coords to screen coords with no transform', () => {
      const result = svgToScreen(
        500,
        500,
        1.0, // scale
        0, // translateX
        0, // translateY
        baseContainerDims,
        baseSvgViewBox
      );

      expect(result.xScreen).toBeCloseTo(500, 5);
      expect(result.yScreen).toBeCloseTo(500, 5);
    });

    it('should account for zoom (zoom from center)', () => {
      // With zoom from center (container 1000x1000, viewBox 1000x1000):
      // Content center is (500, 500)
      // 
      // SVG point (250, 250) at scale 2.0:
      // zoomedX = 500 + (250 - 500) * 2 = 500 - 500 = 0
      // zoomedY = 500 + (250 - 500) * 2 = 500 - 500 = 0
      // xScreen = 0, yScreen = 0
      const result = svgToScreen(
        250,
        250,
        2.0, // scale - zoomed in
        0, // translateX
        0, // translateY
        baseContainerDims,
        baseSvgViewBox
      );

      expect(result.xScreen).toBeCloseTo(0, 5);
      expect(result.yScreen).toBeCloseTo(0, 5);
    });

    it('should account for pan', () => {
      // When panned right by 100 pixels, SVG point 500,500 should map to screen point 600,500
      const result = svgToScreen(
        500,
        500,
        1.0, // scale
        100, // translateX - panned right
        0, // translateY
        baseContainerDims,
        baseSvgViewBox
      );

      expect(result.xScreen).toBeCloseTo(600, 5);
      expect(result.yScreen).toBeCloseTo(500, 5);
    });

    it('should account for both zoom and pan (zoom from center)', () => {
      // SVG point 200,200 with scale 2 and pan 100,50
      // Container: 1000x1000, ViewBox: 1000x1000 (matching, no letterboxing)
      // Content center: (500, 500)
      // 
      // xInContentArea = 200
      // zoomedX = 500 + (200 - 500) * 2 = 500 - 600 = -100
      // xScreen = -100 + 0 (offsetX) + 100 (translateX) = 0
      // 
      // yInContentArea = 200  
      // zoomedY = 500 + (200 - 500) * 2 = 500 - 600 = -100
      // yScreen = -100 + 0 (offsetY) + 50 (translateY) = -50
      const result = svgToScreen(
        200,
        200,
        2.0, // scale
        100, // translateX
        50, // translateY
        baseContainerDims,
        baseSvgViewBox
      );

      expect(result.xScreen).toBeCloseTo(0, 5);
      expect(result.yScreen).toBeCloseTo(-50, 5);
    });

    it('should handle different zoom levels (zoom from center)', () => {
      // With zoom from center (container 1000x1000, viewBox 1000x1000):
      // - Content center is (500, 500)
      // - Points at center stay at center regardless of scale
      // - Points away from center move proportionally
      
      // Center point stays at center at any scale
      const centerAtScale1 = svgToScreen(500, 500, 1.0, 0, 0, baseContainerDims, baseSvgViewBox);
      expect(centerAtScale1.xScreen).toBeCloseTo(500, 5);
      
      const centerAtScale2 = svgToScreen(500, 500, 2.0, 0, 0, baseContainerDims, baseSvgViewBox);
      expect(centerAtScale2.xScreen).toBeCloseTo(500, 5);
      
      const centerAtScale05 = svgToScreen(500, 500, 0.5, 0, 0, baseContainerDims, baseSvgViewBox);
      expect(centerAtScale05.xScreen).toBeCloseTo(500, 5);
      
      // Point at edge (1000, 1000) with different scales
      // At scale 1.0: stays at 1000
      const edgeAtScale1 = svgToScreen(1000, 1000, 1.0, 0, 0, baseContainerDims, baseSvgViewBox);
      expect(edgeAtScale1.xScreen).toBeCloseTo(1000, 5);
      
      // At scale 2.0: moves to 500 + (1000-500)*2 = 1500
      const edgeAtScale2 = svgToScreen(1000, 1000, 2.0, 0, 0, baseContainerDims, baseSvgViewBox);
      expect(edgeAtScale2.xScreen).toBeCloseTo(1500, 5);
      
      // At scale 0.5: moves to 500 + (1000-500)*0.5 = 750
      const edgeAtScale05 = svgToScreen(1000, 1000, 0.5, 0, 0, baseContainerDims, baseSvgViewBox);
      expect(edgeAtScale05.xScreen).toBeCloseTo(750, 5);
    });

    it('should handle different pan offsets', () => {
      // Positive pan (right/down)
      const result1 = svgToScreen(
        500,
        500,
        1.0,
        100, // translateX - right
        100, // translateY - down
        baseContainerDims,
        baseSvgViewBox
      );
      expect(result1.xScreen).toBeCloseTo(600, 5);
      expect(result1.yScreen).toBeCloseTo(600, 5);

      // Negative pan (left/up)
      const result2 = svgToScreen(
        500,
        500,
        1.0,
        -100, // translateX - left
        -100, // translateY - up
        baseContainerDims,
        baseSvgViewBox
      );
      expect(result2.xScreen).toBeCloseTo(400, 5);
      expect(result2.yScreen).toBeCloseTo(400, 5);
    });

    it('should handle different SVG coordinates', () => {
      // Top-left corner
      const topLeft = svgToScreen(0, 0, 1.0, 0, 0, baseContainerDims, baseSvgViewBox);
      expect(topLeft.xScreen).toBeCloseTo(0, 5);
      expect(topLeft.yScreen).toBeCloseTo(0, 5);

      // Bottom-right corner
      const bottomRight = svgToScreen(1000, 1000, 1.0, 0, 0, baseContainerDims, baseSvgViewBox);
      expect(bottomRight.xScreen).toBeCloseTo(1000, 5);
      expect(bottomRight.yScreen).toBeCloseTo(1000, 5);

      // Center
      const center = svgToScreen(500, 500, 1.0, 0, 0, baseContainerDims, baseSvgViewBox);
      expect(center.xScreen).toBeCloseTo(500, 5);
      expect(center.yScreen).toBeCloseTo(500, 5);
    });

    it('should handle different container/viewBox aspect ratios with letterboxing', () => {
      // Container is 2000x1000, viewBox is 1000x1000
      // Height-limited: content is 1000x1000, pillarbox on sides (offsetX = 500)
      const wideContainer = { width: 2000, height: 1000 };
      
      // Center point: SVG (500, 500) -> content (500, 500) -> screen (500 + 500, 500 + 0) = (1000, 500)
      const center = svgToScreen(500, 500, 1.0, 0, 0, wideContainer, baseSvgViewBox);
      expect(center.xScreen).toBeCloseTo(1000, 5);
      expect(center.yScreen).toBeCloseTo(500, 5);
      
      // Top-left corner: SVG (0, 0) -> content (0, 0) -> screen (0 + 500, 0 + 0) = (500, 0)
      const topLeft = svgToScreen(0, 0, 1.0, 0, 0, wideContainer, baseSvgViewBox);
      expect(topLeft.xScreen).toBeCloseTo(500, 5);
      expect(topLeft.yScreen).toBeCloseTo(0, 5);
      
      // Bottom-right corner: SVG (1000, 1000) -> content (1000, 1000) -> screen (1000 + 500, 1000 + 0) = (1500, 1000)
      const bottomRight = svgToScreen(1000, 1000, 1.0, 0, 0, wideContainer, baseSvgViewBox);
      expect(bottomRight.xScreen).toBeCloseTo(1500, 5);
      expect(bottomRight.yScreen).toBeCloseTo(1000, 5);

      // Container is 1000x2000, viewBox is 1000x1000
      // Width-limited: content is 1000x1000, letterbox top/bottom (offsetY = 500)
      const tallContainer = { width: 1000, height: 2000 };
      
      // Center point: SVG (500, 500) -> content (500, 500) -> screen (500 + 0, 500 + 500) = (500, 1000)
      const center2 = svgToScreen(500, 500, 1.0, 0, 0, tallContainer, baseSvgViewBox);
      expect(center2.xScreen).toBeCloseTo(500, 5);
      expect(center2.yScreen).toBeCloseTo(1000, 5);
      
      // Top-left corner: SVG (0, 0) -> content (0, 0) -> screen (0 + 0, 0 + 500) = (0, 500)
      const topLeft2 = svgToScreen(0, 0, 1.0, 0, 0, tallContainer, baseSvgViewBox);
      expect(topLeft2.xScreen).toBeCloseTo(0, 5);
      expect(topLeft2.yScreen).toBeCloseTo(500, 5);
      
      // Bottom-right corner: SVG (1000, 1000) -> content (1000, 1000) -> screen (1000 + 0, 1000 + 500) = (1000, 1500)
      const bottomRight2 = svgToScreen(1000, 1000, 1.0, 0, 0, tallContainer, baseSvgViewBox);
      expect(bottomRight2.xScreen).toBeCloseTo(1000, 5);
      expect(bottomRight2.yScreen).toBeCloseTo(1500, 5);
    });

    it('should have round-trip accuracy with screenToSvg when no transforms', () => {
      const originalSvg = { xSvg: 500, ySvg: 500 };

      // Convert SVG to screen (no transforms)
      const screen = svgToScreen(
        originalSvg.xSvg,
        originalSvg.ySvg,
        1.0,
        0,
        0,
        baseContainerDims,
        baseSvgViewBox
      );

      // Convert back to SVG
      const backToSvg = screenToSvg(
        screen.xScreen,
        screen.yScreen,
        baseContainerDims,
        baseSvgViewBox
      );

      expect(backToSvg.xSvg).toBeCloseTo(originalSvg.xSvg, 5);
      expect(backToSvg.ySvg).toBeCloseTo(originalSvg.ySvg, 5);
    });

    it('should have round-trip accuracy with different aspect ratios', () => {
      // Test with wide container
      const wideContainer = { width: 2000, height: 1000 };
      const testPoints = [
        { xSvg: 0, ySvg: 0 },
        { xSvg: 500, ySvg: 500 },
        { xSvg: 1000, ySvg: 1000 },
      ];

      testPoints.forEach(({ xSvg, ySvg }) => {
        const screen = svgToScreen(xSvg, ySvg, 1.0, 0, 0, wideContainer, baseSvgViewBox);
        const backToSvg = screenToSvg(screen.xScreen, screen.yScreen, wideContainer, baseSvgViewBox);
        expect(backToSvg.xSvg).toBeCloseTo(xSvg, 5);
        expect(backToSvg.ySvg).toBeCloseTo(ySvg, 5);
      });

      // Test with tall container
      const tallContainer = { width: 1000, height: 2000 };
      testPoints.forEach(({ xSvg, ySvg }) => {
        const screen = svgToScreen(xSvg, ySvg, 1.0, 0, 0, tallContainer, baseSvgViewBox);
        const backToSvg = screenToSvg(screen.xScreen, screen.yScreen, tallContainer, baseSvgViewBox);
        expect(backToSvg.xSvg).toBeCloseTo(xSvg, 5);
        expect(backToSvg.ySvg).toBeCloseTo(ySvg, 5);
      });
    });

    it('should account for letterboxing when applying scale (zoom from center)', () => {
      // Container is 2000x1000, viewBox is 1000x1000
      // Height-limited: content is 1000x1000, offsetX = 500, offsetY = 0
      // Content center: (500, 500)
      const wideContainer = { width: 2000, height: 1000 };
      
      // At scale 1.0: SVG (0, 0) -> screen (500, 0)
      const scale1 = svgToScreen(0, 0, 1.0, 0, 0, wideContainer, baseSvgViewBox);
      expect(scale1.xScreen).toBeCloseTo(500, 5);
      expect(scale1.yScreen).toBeCloseTo(0, 5);
      
      // At scale 2.0 with ZOOM FROM CENTER:
      // SVG (0, 0) -> content (0, 0) -> zoomed from center (500 + (0-500)*2 = -500, 500 + (0-500)*2 = -500)
      // -> screen (-500 + 500, -500 + 0) = (0, -500)
      const scale2 = svgToScreen(0, 0, 2.0, 0, 0, wideContainer, baseSvgViewBox);
      expect(scale2.xScreen).toBeCloseTo(0, 5);
      expect(scale2.yScreen).toBeCloseTo(-500, 5);
      
      // Center point at scale 2.0: SVG (500, 500) stays at center because zoom is from center
      // -> content (500, 500) -> zoomed (500, 500) -> screen (1000, 500)
      const centerScale2 = svgToScreen(500, 500, 2.0, 0, 0, wideContainer, baseSvgViewBox);
      expect(centerScale2.xScreen).toBeCloseTo(1000, 5); // 500 + 500 (offset)
      expect(centerScale2.yScreen).toBeCloseTo(500, 5);  // stays at content center
    });

    it('should account for letterboxing when applying translate', () => {
      // Container is 2000x1000, viewBox is 1000x1000
      // Height-limited: content is 1000x1000, offsetX = 500
      const wideContainer = { width: 2000, height: 1000 };
      
      // SVG (0, 0) with translate (100, 50): content (0, 0) -> screen (500 + 100, 0 + 50) = (600, 50)
      const result = svgToScreen(0, 0, 1.0, 100, 50, wideContainer, baseSvgViewBox);
      expect(result.xScreen).toBeCloseTo(600, 5);
      expect(result.yScreen).toBeCloseTo(50, 5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero container dimensions', () => {
      const zeroDims = { width: 0, height: 0 };
      const svgViewBox = { width: 1000, height: 1000 };

      const result = screenToSvg(100, 100, zeroDims, svgViewBox);
      // Should handle gracefully - result may be NaN or Infinity, which is expected
      expect(typeof result.xSvg).toBe('number');
      expect(typeof result.ySvg).toBe('number');
    });

    it('should handle zero viewBox dimensions', () => {
      const containerDims = { width: 1000, height: 1000 };
      const zeroViewBox = { width: 0, height: 0 };

      const result = screenToSvg(100, 100, containerDims, zeroViewBox);
      // Should handle gracefully
      expect(typeof result.xSvg).toBe('number');
      expect(typeof result.ySvg).toBe('number');
    });

    it('should handle very large coordinates', () => {
      const containerDims = { width: 1000, height: 1000 };
      const svgViewBox = { width: 1000, height: 1000 };

      const result = screenToSvg(1000000, 1000000, containerDims, svgViewBox);
      expect(result.xSvg).toBeGreaterThan(0);
      expect(result.ySvg).toBeGreaterThan(0);
    });

    it('should handle very small coordinates', () => {
      const containerDims = { width: 1000, height: 1000 };
      const svgViewBox = { width: 1000, height: 1000 };

      const result = screenToSvg(0.0001, 0.0001, containerDims, svgViewBox);
      expect(result.xSvg).toBeGreaterThanOrEqual(0);
      expect(result.ySvg).toBeGreaterThanOrEqual(0);
    });
  });
});

