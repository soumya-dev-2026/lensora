// Limit complete, synchronized AI/render frames and leave time for UI and cooling.
export class FrameBudget {
  private lastFrame = -Infinity;
  private averageCost = 0;

  constructor(private maxFps: number) {}

  shouldProcess(time: number): boolean {
    const interval = Math.max(1000 / this.maxFps, this.averageCost * 2);
    if (time - this.lastFrame < interval - 1) return false;
    this.lastFrame = time;
    return true;
  }

  recordCost(milliseconds: number): void {
    this.averageCost = this.averageCost === 0
      ? milliseconds : this.averageCost * 0.8 + milliseconds * 0.2;
  }
}
