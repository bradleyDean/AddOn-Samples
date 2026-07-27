export interface Projection {
  svgPoint: [number, number]; // Coordinates in SVG space
  sqDist: number;
  t: number; // fractional distance along segment (0-1)
  segment: number; // segment index within wall
}

/**
 * Wall class for detecting closest point on wall segments
 * Ported from Angular implementation
 */
export class Wall {
  wallCode: string;
  vertices: [number, number][]; // SVG coordinates
  hitBoxPadding: number;

  constructor(pathData: string, wallCode: string, hitBoxPadding: number = 20) {
    this.wallCode = wallCode;
    this.hitBoxPadding = hitBoxPadding;
    this.vertices = this.parsePathData(pathData);
  }

  /**
   * Parse SVG path data to extract vertices
   * Handles absolute path commands (M, L, H, V, Z) and relative commands (m, l, h, v, z)
   * Also handles implicit lineTo (numbers without L command after M)
   */
  private parsePathData(pathData: string): [number, number][] {
    const vertices: [number, number][] = [];
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;

    // Normalize path data: replace commas with spaces (commas are just separators like spaces in SVG paths)
    const normalized = pathData.replace(/,/g, ' ');
    
    // Tokenize path data: split into commands and numbers
    // This regex matches commands (M, L, H, V, Z, m, l, h, v, z) or numbers (including negative and decimals)
    const tokens: string[] = [];
    const tokenRegex = /([MmLlHhVvZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
    let match;
    
    while ((match = tokenRegex.exec(normalized)) !== null) {
      if (match[1]) {
        // It's a command
        tokens.push(match[1]);
      } else if (match[2]) {
        // It's a number
        tokens.push(match[2]);
      }
    }

    let i = 0;
    let implicitCommand = 'L'; // Default to LineTo for implicit commands

    while (i < tokens.length) {
      const token = tokens[i];
      
      // Check if this is a command (single letter)
      if (/^[MmLlHhVvZz]$/.test(token)) {
        const command = token;
        i++;

        switch (command.toUpperCase()) {
          case 'M': {
            // MoveTo (absolute)
            if (command === 'M') {
              const x = parseFloat(tokens[i++]);
              const y = parseFloat(tokens[i++]);
              if (!isNaN(x) && !isNaN(y)) {
                currentX = x;
                currentY = y;
                startX = x;
                startY = y;
                vertices.push([x, y]);
                implicitCommand = 'L'; // After M, implicit commands are LineTo
              }
            } else {
              // MoveTo (relative) - lowercase 'm'
              const dx = parseFloat(tokens[i++]);
              const dy = parseFloat(tokens[i++]);
              if (!isNaN(dx) && !isNaN(dy)) {
                currentX += dx;
                currentY += dy;
                startX = currentX;
                startY = currentY;
                vertices.push([currentX, currentY]);
                implicitCommand = 'l'; // After m, implicit commands are relative LineTo
              }
            }
            break;
          }
          case 'L': {
            // LineTo (absolute)
            if (command === 'L') {
              const x = parseFloat(tokens[i++]);
              const y = parseFloat(tokens[i++]);
              if (!isNaN(x) && !isNaN(y)) {
                currentX = x;
                currentY = y;
                vertices.push([x, y]);
              }
            } else {
              // LineTo (relative) - lowercase 'l'
              const dx = parseFloat(tokens[i++]);
              const dy = parseFloat(tokens[i++]);
              if (!isNaN(dx) && !isNaN(dy)) {
                currentX += dx;
                currentY += dy;
                vertices.push([currentX, currentY]);
              }
            }
            break;
          }
          case 'H': {
            // Horizontal lineTo (absolute)
            if (command === 'H') {
              const x = parseFloat(tokens[i++]);
              if (!isNaN(x)) {
                currentX = x;
                vertices.push([x, currentY]);
              }
            } else {
              // Horizontal lineTo (relative) - lowercase 'h'
              const dx = parseFloat(tokens[i++]);
              if (!isNaN(dx)) {
                currentX += dx;
                vertices.push([currentX, currentY]);
              }
            }
            break;
          }
          case 'V': {
            // Vertical lineTo (absolute)
            if (command === 'V') {
              const y = parseFloat(tokens[i++]);
              if (!isNaN(y)) {
                currentY = y;
                vertices.push([currentX, y]);
              }
            } else {
              // Vertical lineTo (relative) - lowercase 'v'
              const dy = parseFloat(tokens[i++]);
              if (!isNaN(dy)) {
                currentY += dy;
                vertices.push([currentX, currentY]);
              }
            }
            break;
          }
          case 'Z': {
            // ClosePath - connect back to start
            if (vertices.length > 0 && (currentX !== startX || currentY !== startY)) {
              vertices.push([startX, startY]);
            }
            currentX = startX;
            currentY = startY;
            // Don't increment i, Z doesn't consume tokens
            break;
          }
        }
      } else {
        // Implicit command: numbers without a preceding command
        // After M/m, implicit commands are treated as L/l (LineTo)
        // Parse coordinate pairs
        const x = parseFloat(tokens[i++]);
        if (i < tokens.length) {
          const y = parseFloat(tokens[i++]);
          if (!isNaN(x) && !isNaN(y)) {
            if (implicitCommand === 'L') {
              // Absolute lineTo
              currentX = x;
              currentY = y;
              vertices.push([x, y]);
            } else {
              // Relative lineTo (after lowercase 'm')
              currentX += x;
              currentY += y;
              vertices.push([currentX, currentY]);
            }
          }
        }
      }
    }

    return vertices;
  }

  /**
   * Find the closest point on any segment of this wall to the target point
   * @param xSvg - SVG X coordinate of target point
   * @param ySvg - SVG Y coordinate of target point
   * @returns Projection with closest point, or null if no valid projection
   */
  getClosestPoint(xSvg: number, ySvg: number): Projection | null {
    let smallestDist: number | null = null;
    let closestPoint: [number, number] | null = null;
    let segment: number | null = null;
    let t: number | null = null;

    for (let i = 0; i < this.vertices.length - 1; i++) {
      const result = this.getClosestPointOnSegment(
        this.vertices[i][0],
        this.vertices[i][1],
        this.vertices[i + 1][0],
        this.vertices[i + 1][1],
        xSvg,
        ySvg
      );

      if (result && (!smallestDist || result.sqDist < smallestDist)) {
        smallestDist = result.sqDist;
        closestPoint = result.svgPoint;
        t = result.t;
        segment = i;
        
        // Debug logging removed - use dev mode toggle in settings if needed
      }
    }

    if (closestPoint) {
      return {
        svgPoint: closestPoint,
        sqDist: smallestDist!,
        t: t!,
        segment: segment!
      };
    }

    return null;
  }

  /**
   * Find closest point on a segment to a target point
   * Handles horizontal, vertical, and skew segments
   */
  private getClosestPointOnSegment(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    tx: number,
    ty: number
  ): Projection | null {
    // Build hitbox
    const maxX = (x1 > x2 ? x1 : x2) + this.hitBoxPadding;
    const minX = (x1 < x2 ? x1 : x2) - this.hitBoxPadding;
    const maxY = (y1 > y2 ? y1 : y2) + this.hitBoxPadding;
    const minY = (y1 < y2 ? y1 : y2) - this.hitBoxPadding;

    // Check if target is outside hitbox (early rejection for performance)
    if (tx < minX || tx > maxX || ty < minY || ty > maxY) {
      return null;
    }

    // Calculate projection
    let projection: Projection | null = null;
    
    // Horizontal segment
    if (y1 === y2) {
      projection = this.getProjToHorizSeg(x1, y1, x2, y2, tx, ty);
    }
    // Vertical segment
    else if (x1 === x2) {
      projection = this.getProjToVertSeg(x1, y1, x2, y2, tx, ty);
    }
    // Skew segment
    else {
      projection = this.getProjToSkewSeg(x1, y1, x2, y2, tx, ty);
    }

    // CRITICAL: Verify actual distance is within hitBoxPadding
    // The bounding box check above is just for early rejection
    // We need to check the actual squared distance
    if (projection && projection.sqDist <= this.hitBoxPadding * this.hitBoxPadding) {
      return projection;
    }

    return null;
  }

  /**
   * Project target to horizontal segment
   */
  private getProjToHorizSeg(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    tx: number,
    ty: number
  ): Projection | null {
    const maxX = x1 > x2 ? x1 : x2;
    const minX = x1 < x2 ? x1 : x2;

    // Clamp tx to segment bounds
    const clampedX = Math.max(minX, Math.min(maxX, tx));
    const svgPoint: [number, number] = [clampedX, y1];
    const sqDist = Math.pow(y1 - ty, 2);
    const t = Math.abs((clampedX - x1) / (x2 - x1));
    return { svgPoint, sqDist, t, segment: 0 };
  }

  /**
   * Project target to vertical segment
   */
  private getProjToVertSeg(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    tx: number,
    ty: number
  ): Projection | null {
    const maxY = y1 > y2 ? y1 : y2;
    const minY = y1 < y2 ? y1 : y2;

    // Clamp ty to segment bounds
    const clampedY = Math.max(minY, Math.min(maxY, ty));
    const svgPoint: [number, number] = [x1, clampedY];
    const sqDist = Math.pow(x1 - tx, 2);
    const t = Math.abs((clampedY - y1) / (y2 - y1));
    return { svgPoint, sqDist, t, segment: 0 };
  }

  /**
   * Project target to skew (non-horizontal, non-vertical) segment
   */
  private getProjToSkewSeg(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    tx: number,
    ty: number
  ): Projection | null {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dx2 = dx * dx;
    const dy2 = dy * dy;

    const px = (tx * dx2 + x1 * dy2 + dx * dy * (ty - y1)) / (dx2 + dy2);
    const isOnSeg = this.skewProjIsOnSeg(px, x1, dx);

    if (isOnSeg.isOnseg) {
      const py = ((y2 - y1) / (x2 - x1)) * (px - x1) + y1;
      const svgPoint: [number, number] = [px, py];
      const sqDist = Math.pow(tx - px, 2) + Math.pow(ty - py, 2);
      const t = isOnSeg.t;

      return { svgPoint, sqDist, t, segment: 0 };
    }

    return null;
  }

  /**
   * Check if projected x-coordinate lies on segment
   */
  private skewProjIsOnSeg(ox: number, x1: number, dx: number): { isOnseg: boolean; t: number } {
    const to = (ox - x1) / dx;
    const isOnSeg = to >= 0 && to <= 1;
    return { isOnseg: isOnSeg, t: to };
  }

  /**
   * Calculate the Euclidean distance between two points
   */
  private getDistance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate the total path length of the wall from start to end
   * @returns Total path length in SVG units
   */
  getTotalPathLength(): number {
    let totalLength = 0;
    for (let i = 0; i < this.vertices.length - 1; i++) {
      totalLength += this.getDistance(
        this.vertices[i][0],
        this.vertices[i][1],
        this.vertices[i + 1][0],
        this.vertices[i + 1][1]
      );
    }
    return totalLength;
  }

  /**
   * Calculate the cumulative distance from the start of the wall to the start of a segment
   * @param segmentIndex - The segment index (0-based)
   * @returns Cumulative distance from wall start to segment start
   */
  getCumulativeDistanceToSegment(segmentIndex: number): number {
    let cumulativeDistance = 0;
    for (let i = 0; i < segmentIndex && i < this.vertices.length - 1; i++) {
      cumulativeDistance += this.getDistance(
        this.vertices[i][0],
        this.vertices[i][1],
        this.vertices[i + 1][0],
        this.vertices[i + 1][1]
      );
    }
    return cumulativeDistance;
  }

  /**
   * Calculate the distance along a specific segment
   * @param segmentIndex - The segment index (0-based)
   * @returns Distance of the segment
   */
  getSegmentLength(segmentIndex: number): number {
    if (segmentIndex < 0 || segmentIndex >= this.vertices.length - 1) {
      return 0;
    }
    return this.getDistance(
      this.vertices[segmentIndex][0],
      this.vertices[segmentIndex][1],
      this.vertices[segmentIndex + 1][0],
      this.vertices[segmentIndex + 1][1]
    );
  }
}

