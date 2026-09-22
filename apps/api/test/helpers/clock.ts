import { type Clock } from '../../src/common/clock.js';

export class FakeClock implements Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  /** Pin "now" to an instant (the offset keeps ticking from there). */
  set(at: Date): void {
    this.offsetMs = at.getTime() - Date.now();
  }

  reset(): void {
    this.offsetMs = 0;
  }
}
