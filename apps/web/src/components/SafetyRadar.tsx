import { LAW_SHORT } from '@airbag/core';
import type { LawResult } from '@airbag/core';

export function SafetyRadar({ laws, size = 360 }: { laws: LawResult[]; size?: number }) {
  const center = 200;
  const radius = 132;
  const count = 7;
  const point = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return [center + Math.cos(angle) * r, center + Math.sin(angle) * r] as const;
  };
  const polygon = laws
    .map((law, index) => point(index, law.score).join(','))
    .join(' ');
  const rings = [25, 50, 75, 100];
  const labelPoints = laws.map((law, index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return {
      law,
      x: center + Math.cos(angle) * (radius + 10),
      y: center + Math.sin(angle) * (radius + 10),
      anchor: Math.cos(angle) > 0.2 ? 'start' : Math.cos(angle) < -0.2 ? 'end' : 'middle',
    } as const;
  });

  return (
    <div className="radar-wrap">
      <svg
        viewBox="0 0 400 400"
        width={size}
        height={size}
        className="radar"
        role="img"
        aria-label="Safety shape: seven law scores"
      >
        {rings.map((ring) => (
          <polygon
            key={ring}
            points={laws
              .map((_, index) => point(index, ring).join(','))
              .join(' ')}
            fill="none"
            stroke="var(--line)"
            strokeWidth={ring === 100 ? 1.4 : 1}
          />
        ))}
        {laws.map((_, index) => {
          const [x, y] = point(index, 100);
          return (
            <line
              key={index}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="var(--line)"
              strokeWidth="1"
            />
          );
        })}
        <polygon
          points={polygon}
          fill="rgba(213,217,224,.09)"
          stroke="var(--text-200)"
          strokeWidth="1.6"
        />
        {laws.map((law, index) => {
          const [x, y] = point(index, law.score);
          return <circle key={law.law} cx={x} cy={y} r="3.4" fill="var(--text-50)" />;
        })}
        {labelPoints.map(({ law, x, y, anchor }) => (
          <g key={law.law}>
            <text
              x={x}
              y={y - 4}
              textAnchor={anchor}
              fill="var(--text-400)"
              fontSize="10"
              letterSpacing=".08em"
            >
              L{law.law}
            </text>
            <text
              x={x}
              y={y + 10}
              textAnchor={anchor}
              fill="var(--text-200)"
              fontSize="10.5"
            >
              {LAW_SHORT[law.law as 1]}
            </text>
          </g>
        ))}
      </svg>
      <table className="sr-only">
        <caption>Safety shape: scores for the seven laws</caption>
        <thead>
          <tr>
            <th>Law</th>
            <th>Name</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {laws.map((law) => (
            <tr key={law.law}>
              <td>{law.law}</td>
              <td>{law.name}</td>
              <td>{law.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
