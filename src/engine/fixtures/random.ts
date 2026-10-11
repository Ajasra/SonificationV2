/** Fixture-only PRNG. Production filters continue to default to Math.random. */
export class FixtureRandom {
  private state: number;
  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) throw new Error('Fixture seed must be a nonzero u32');
    this.state = seed >>> 0;
  }
  next = (): number => {
    let value = this.state;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x100000000;
  };
  snapshot(): number { return this.state; }
}
