/** Virtual clock. No wall-clock time is ever read inside the core. */
export class VirtualClock {
  private elapsed = 0;
  private readonly start: number;

  constructor(startMs: number) {
    this.start = startMs;
  }

  now(): number {
    return this.elapsed;
  }

  absolute(): number {
    return this.start + this.elapsed;
  }

  iso(): string {
    return new Date(this.absolute()).toISOString();
  }

  advance(ms: number): number {
    if (ms < 0) throw new Error('The clock cannot move backwards');
    this.elapsed += ms;
    return this.elapsed;
  }
}

export function isoAt(epochMs: number, virtualMs: number): string {
  return new Date(epochMs + virtualMs).toISOString();
}
