// Shared building blocks for the phaser/wah filters
export class PhasersAllPass {
  a1 = 0.0;
  zm1 = 0.0;

  run(x: number): number {
    const y = x * -this.a1 + this.zm1;
    this.zm1 = y * this.a1 + x;
    return y;
  }

  setDelay(d: number): void {
    this.a1 = (1.0 - d) / (1.0 + d);
  }

  clear(): void {
    this.a1 = 0.0;
    this.zm1 = 0.0;
  }
}

export class PhasersEnvelope {
  ga = 1.0;
  gr = 1.0;
  env = 0.0;

  run(inVal: number): number {
    let envLvl = this.env;
    const absIn = Math.abs(inVal);
    if (envLvl < absIn) {
      envLvl = this.ga * (envLvl - absIn) + absIn;
    } else {
      envLvl = this.gr * (envLvl - absIn) + absIn;
    }
    this.env = envLvl;
    return envLvl;
  }

  setAttack(a: number): void {
    this.ga = Math.exp(-1.0 / Math.max(1e-6, a));
  }

  setRelease(r: number): void {
    this.gr = Math.exp(-1.0 / Math.max(1e-6, r));
  }
}
