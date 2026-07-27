import { Wall, Projection } from './wall';

describe('Wall', () => {
  describe('parsePathData', () => {
    it('should parse simple path with absolute coordinates', () => {
      const wall = new Wall('M 0,0 L 100,100', 'test');
      expect(wall.vertices).toEqual([
        [0, 0],
        [100, 100],
      ]);
    });

    it('should parse path with closed loop', () => {
      const wall = new Wall('M 0,0 L 100,100 L 0,100 Z', 'test');
      expect(wall.vertices).toEqual([
        [0, 0],
        [100, 100],
        [0, 100],
      ]);
    });

    it('should parse path with multiple segments', () => {
      const wall = new Wall('M 0,0 L 100,0 L 100,100 L 0,100', 'test');
      expect(wall.vertices).toEqual([
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ]);
    });

    it('should handle path without commas', () => {
      // Note: Current parser expects comma-separated coordinates
      // This tests demonstrates the limitation
      const wall = new Wall('M 0,0 100,100', 'test');
      expect(wall.vertices).toEqual([
        [0, 0],
        [100, 100],
      ]);
    });

    it('should handle malformed path data gracefully', () => {
      const wall = new Wall('M invalid L 100,100', 'test');
      // Should still extract valid coordinates
      expect(wall.vertices.length).toBeGreaterThan(0);
    });

    it('should handle empty path', () => {
      const wall = new Wall('', 'test');
      expect(wall.vertices).toEqual([]);
    });
  });

  describe('getClosestPoint', () => {
    describe('horizontal segment', () => {
      it('should find projection when point is inside segment bounds', () => {
        const wall = new Wall('M 100,100 L 500,100', 'test');
        const result = wall.getClosestPoint(300, 110);
        
        expect(result).not.toBeNull();
        expect(result!.svgPoint[0]).toBe(300);
        expect(result!.svgPoint[1]).toBe(100);
        expect(result!.sqDist).toBe(100); // (110-100)^2
        expect(result!.segment).toBe(0);
      });

      it('should return null when point is outside segment bounds', () => {
        const wall = new Wall('M 100,100 L 500,100', 'test', 10);
        const result = wall.getClosestPoint(600, 110);
        
        expect(result).toBeNull();
      });

      it('should find projection on segment with point inside hitbox', () => {
        const wall = new Wall('M 100,100 L 500,100', 'test', 30);
        // Point inside segment bounds
        const result = wall.getClosestPoint(450, 105);
        
        expect(result).not.toBeNull();
        expect(result!.svgPoint[0]).toBe(450);
        expect(result!.svgPoint[1]).toBe(100);
      });
    });

    describe('vertical segment', () => {
      it('should find projection when point is inside segment bounds', () => {
        const wall = new Wall('M 100,100 L 100,500', 'test');
        const result = wall.getClosestPoint(105, 300);
        
        expect(result).not.toBeNull();
        expect(result!.svgPoint[0]).toBe(100);
        expect(result!.svgPoint[1]).toBe(300);
        expect(result!.sqDist).toBe(25); // (105-100)^2
        expect(result!.segment).toBe(0);
      });

      it('should return null when point is outside segment bounds', () => {
        const wall = new Wall('M 100,100 L 100,500', 'test', 10);
        const result = wall.getClosestPoint(95, 600);
        
        expect(result).toBeNull();
      });

      it('should find projection on segment with point inside hitbox', () => {
        const wall = new Wall('M 100,100 L 100,500', 'test', 30);
        // Point inside segment bounds
        const result = wall.getClosestPoint(105, 450);
        
        expect(result).not.toBeNull();
        expect(result!.svgPoint[0]).toBe(100);
        expect(result!.svgPoint[1]).toBe(450);
      });
    });

    describe('skew segment', () => {
      it('should find projection when point is inside segment bounds', () => {
        const wall = new Wall('M 0,0 L 100,100', 'test');
        const result = wall.getClosestPoint(50, 60);
        
        expect(result).not.toBeNull();
        expect(result!.segment).toBe(0);
        expect(result!.sqDist).toBeGreaterThanOrEqual(0);
      });

      it('should return null when point is outside segment bounds', () => {
        const wall = new Wall('M 0,0 L 100,100', 'test', 10);
        const result = wall.getClosestPoint(200, 200);
        
        expect(result).toBeNull();
      });

      it('should find projection on segment with point inside hitbox', () => {
        const wall = new Wall('M 0,0 L 100,100', 'test', 30);
        // Point inside segment bounds
        const result = wall.getClosestPoint(75, 85);
        
        expect(result).not.toBeNull();
        // Should project to closest point on skew segment
      });
    });

    describe('projection accuracy', () => {
      it('should calculate correct t-value', () => {
        const wall = new Wall('M 0,0 L 100,0', 'test');
        const result = wall.getClosestPoint(50, 5);
        
        expect(result).not.toBeNull();
        expect(result!.t).toBe(0.5); // Middle of segment
      });

      it('should calculate t-value at start of segment', () => {
        const wall = new Wall('M 0,0 L 100,0', 'test');
        // Point on the segment itself
        const result = wall.getClosestPoint(0, 5);
        
        expect(result).not.toBeNull();
        // t should be near 0 at the start
        expect(result!.t).toBeCloseTo(0, 0.001);
      });
    });

    describe('multiple segments', () => {
      it('should find closest among multiple segments', () => {
        const wall = new Wall('M 0,0 L 100,0 L 100,100', 'test');
        // Point closer to second segment (vertical)
        const result = wall.getClosestPoint(105, 50);
        
        expect(result).not.toBeNull();
        expect(result!.segment).toBe(1);
      });

      it('should return closest point among all segments', () => {
        const wall = new Wall('M 0,0 L 100,0 L 100,100 L 0,100', 'test');
        // Point inside the rectangular boundary formed by segments
        const result = wall.getClosestPoint(50, 120);
        
        expect(result).not.toBeNull();
        // Should find the closest segment
        expect(result!.sqDist).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('hitbox padding', () => {
    it('should return projection for point inside padded hitbox', () => {
      const wall = new Wall('M 100,100 L 500,100', 'test', 20);
      // Point is outside segment but inside padded hitbox
      const result = wall.getClosestPoint(510, 100);
      
      expect(result).not.toBeNull();
    });

    it('should return null for point outside padded hitbox', () => {
      const wall = new Wall('M 100,100 L 500,100', 'test', 20);
      // Point is outside padded hitbox
      const result = wall.getClosestPoint(530, 100);
      
      expect(result).toBeNull();
    });

    it('should work with different padding values', () => {
      const wallSmall = new Wall('M 100,100 L 500,100', 'test', 10);
      const wallLarge = new Wall('M 100,100 L 500,100', 'test', 50);
      
      // Point is outside small padding (10) but inside large padding (50)
      // For wallSmall: maxX = 500 + 10 = 510, so 515 is outside
      // For wallLarge: maxX = 500 + 50 = 550, so 515 is inside
      const resultSmall = wallSmall.getClosestPoint(515, 100);
      const resultLarge = wallLarge.getClosestPoint(515, 100);
      
      expect(resultSmall).toBeNull();
      expect(resultLarge).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle horizontal segment with dy=0 but dx≠0', () => {
      const wall = new Wall('M 0,0 L 100,0', 'test');
      const result = wall.getClosestPoint(50, 10);
      
      expect(result).not.toBeNull();
      expect(result!.svgPoint[1]).toBe(0);
    });

    it('should handle vertical segment with dx=0 but dy≠0', () => {
      const wall = new Wall('M 0,0 L 0,100', 'test');
      const result = wall.getClosestPoint(10, 50);
      
      expect(result).not.toBeNull();
      expect(result!.svgPoint[0]).toBe(0);
    });
    
    it('should handle wallCode', () => {
      const wall = new Wall('M 0,0 L 100,0', '0a0');
      expect(wall.wallCode).toBe('0a0');
    });
  });
});

