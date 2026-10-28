import type { GraphSpec } from './learningTypes';

export function evaluateGraph(spec: GraphSpec, x: number): number | null {
  if (spec.domain.excluded.some((excluded) => Math.abs(x - excluded) < 1e-10)) return null;
  const shifted = x - spec.h;
  let y: number;
  switch (spec.kind) {
    case 'linear':
      y = spec.a * shifted + spec.k;
      break;
    case 'quadratic':
      y = spec.a * shifted * shifted + spec.k;
      break;
    case 'absolute':
      y = spec.a * Math.abs(shifted) + spec.k;
      break;
    case 'reciprocal':
      if (Math.abs(shifted) < 1e-10) return null;
      y = spec.a / shifted + spec.k;
      break;
    default:
      return null;
  }
  return Number.isFinite(y) ? y : null;
}

// Sample each continuous interval separately so no line crosses an excluded point.
export function sampleGraph(spec: GraphSpec): { x: number; y: number }[][] {
  const { xMin, xMax } = spec.viewport;
  const excluded = [
    ...new Set([...spec.domain.excluded, ...(spec.kind === 'reciprocal' ? [spec.h] : [])]),
  ];
  const boundaries = [
    xMin,
    ...excluded.filter((x) => x > xMin && x < xMax).sort((a, b) => a - b),
    xMax,
  ];
  return boundaries.slice(0, -1).map((start, interval) => {
    const end = boundaries[interval + 1];
    const epsilon = (end - start) / 1000;
    const low = excluded.includes(start) ? start + epsilon : start;
    const high = excluded.includes(end) ? end - epsilon : end;
    const points = [];
    for (let i = 0; i <= 240; i++) {
      const x = low + ((high - low) * i) / 240;
      const y = evaluateGraph(spec, x);
      if (y !== null) points.push({ x, y });
    }
    return points;
  });
}
