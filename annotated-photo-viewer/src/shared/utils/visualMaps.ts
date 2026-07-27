/**
 * Maps hold types to their visual representations
 */

export function getHoldColor(type: 'start' | 'finish' | 'intermediate'): string {
  switch (type) {
    case 'start':
      return 'green';
    case 'finish':
      return 'red';
    case 'intermediate':
      return 'yellow';
    default:
      return 'limegreen'; // fallback
  }
}

export const HOLD_COLORS = {
  start: 'green',
  finish: 'red',
  intermediate: 'yellow',
} as const;


