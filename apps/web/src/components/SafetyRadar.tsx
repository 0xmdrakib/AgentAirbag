import { LAW_SHORT } from '@airbag/core';
import type { LawResult } from '@airbag/core';

type Tone = 'pass' | 'warn' | 'fail';

export interface RadarOverlay {
  label: string;
  laws: LawResult[];
}

const COUNT = 7;
const CENTER = 50;
const RADIUS = 30;
const LABEL_RADIUS = 38;

function angle(index: number): number {
  return (Math.PI * 2 * index) / COUNT - Math.PI / 2;
}

function point(index: number, value: number): [number, number] {
  const r = (Math.max(0, Math.min(100, value)) / 100) * RADIUS;
  return [CENTER + Math.cos(angle(index)) * r, CENTER + Math.sin(angle(index)) * r];
}

function polygon(laws: LawResult[]): string {
  return laws.map((law, index) => point(index, law.score).join(',')).join(' ');
}

export function SafetyRadar({
  laws,
  label,
  tone,
  overlay,
}: {
  laws: LawResult[];
  label: string;
  tone: Tone;
  overlay?: RadarOverlay;
}) {
  const rings = [25, 50, 75, 100];
  return (
    <figure className={`radar radar-${tone}`}>
      <div className="radar-stage">
        <svg viewBox="0 0 100 100" className="radar-svg" role="img" aria-label="Safety shape: seven law scores">
          {rings.map((ring) => (
            <polygon
              key={ring}
              className={ring === 100 ? 'radar-ring radar-ring-outer' : 'radar-ring'}
              points={laws.map((_, index) => point(index, ring).join(',')).join(' ')}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {laws.map((_, index) => {
            const [x, y] = point(index, 100);
            return (
              <line
                key={index}
                className="radar-axis"
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {overlay && (
            <polygon
              className="radar-overlay"
              points={polygon(overlay.laws)}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polygon className="radar-area" points={polygon(laws)} vectorEffect="non-scaling-stroke" />
          {laws.map((law, index) => {
            const [x, y] = point(index, law.score);
            return <circle key={law.law} className="radar-dot" cx={x} cy={y} r="1.5" />;
          })}
        </svg>
        {laws.map((law, index) => {
          const cos = Math.cos(angle(index));
          const sin = Math.sin(angle(index));
          return (
            <div
              key={law.law}
              className="radar-label"
              style={{
                left: `${CENTER + cos * LABEL_RADIUS}%`,
                top: `${CENTER + sin * (LABEL_RADIUS - 2)}%`,
                transform: `translate(calc(-50% + ${(cos * 50).toFixed(1)}%), calc(-50% + ${(sin * 50).toFixed(1)}%))`,
              }}
            >
              <span className="radar-label-code mono">L{law.law}</span>
              <span className="radar-label-name">{LAW_SHORT[law.law as 1]}</span>
              <span className="radar-label-score mono">{law.score}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="radar-legend">
        <span className="radar-key radar-key-main">
          <i /> {label}
        </span>
        {overlay && (
          <span className="radar-key radar-key-overlay">
            <i /> {overlay.label}
          </span>
        )}
      </figcaption>
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
    </figure>
  );
}
