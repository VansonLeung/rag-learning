import { useId, useState } from 'react';
import type { GraphSpec } from './learningTypes';
import { evaluateGraph, sampleGraph } from './graphMath';

export function FunctionGraph({ spec, label }: { spec: GraphSpec; label: string }) {
  const id = useId().replace(/:/g, '');
  const [x, setX] = useState(0);
  const { xMin, xMax, yMin, yMax } = spec.viewport;
  const px = (value: number) => 28 + ((value - xMin) / (xMax - xMin)) * 304;
  const py = (value: number) => 214 - ((value - yMin) / (yMax - yMin)) * 196;
  const y = evaluateGraph(spec, x);
  const ticks = Array.from({ length: 13 }, (_, i) => i - 6);
  return (
    <div className="function-graph">
      <svg viewBox="0 0 360 238" role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>Graph {label}</title>
        <desc id={`${id}-description`}>
          Coordinate plot from −6 to 6 on both axes. Use the x-coordinate control below to inspect
          points.
        </desc>
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x="28" y="18" width="304" height="196" />
          </clipPath>
        </defs>
        {ticks.map((tick) => (
          <g key={tick} className="graph-grid">
            <line x1={px(tick)} x2={px(tick)} y1="18" y2="214" />
            <line x1="28" x2="332" y1={py(tick)} y2={py(tick)} />
            {tick % 2 === 0 && tick !== 0 && (
              <>
                <text x={px(tick)} y={py(0) + 14} textAnchor="middle">
                  {tick}
                </text>
                <text x={px(0) - 7} y={py(tick) + 3} textAnchor="end">
                  {tick}
                </text>
              </>
            )}
          </g>
        ))}
        <g className="graph-axis">
          <line x1="28" x2="332" y1={py(0)} y2={py(0)} />
          <line x1={px(0)} x2={px(0)} y1="18" y2="214" />
        </g>
        <text x="340" y={py(0) + 4} className="graph-axis-label">
          x
        </text>
        <text x={px(0) + 7} y="14" className="graph-axis-label">
          y
        </text>
        <g clipPath={`url(#${id}-clip)`}>
          {sampleGraph(spec).map((points, index) => (
            <path
              key={index}
              className="graph-curve"
              d={points
                .map(
                  (point, i) =>
                    `${i ? 'L' : 'M'}${px(point.x).toFixed(2)},${py(point.y).toFixed(2)}`,
                )
                .join(' ')}
            />
          ))}
          {y !== null && y >= yMin && y <= yMax && (
            <circle cx={px(x)} cy={py(y)} r="4" className="graph-point" />
          )}
        </g>
      </svg>
      <div className="graph-probe">
        <label htmlFor={`${id}-x`}>x = {x}</label>
        <input
          id={`${id}-x`}
          aria-label={`x coordinate for graph ${label}`}
          type="range"
          min={xMin}
          max={xMax}
          step="0.25"
          value={x}
          onChange={(event) => setX(Number(event.target.value))}
        />
        <output htmlFor={`${id}-x`}>y = {y === null ? 'undefined' : Number(y.toFixed(3))}</output>
      </div>
      <div className="muted graph-domain">
        {spec.domain.excluded.length
          ? `Domain: all real x except ${spec.domain.excluded.join(', ')}`
          : 'Domain: all real x'}
      </div>
    </div>
  );
}
