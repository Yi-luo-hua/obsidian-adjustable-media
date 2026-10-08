/** Calibrated W01 ceiling for one source/environment/observed range, not a time deadline. */
export const MAX_LAYOUT_MEASUREMENT_ROUNDS = 16;

export class ConvergenceBudget {
  rounds = 0;
  blocked = false;
  private scope: unknown;

  take(scope: unknown): boolean {
    if (scope !== this.scope) { this.reset(); this.scope = scope; }
    if (this.rounds === MAX_LAYOUT_MEASUREMENT_ROUNDS) { this.blocked = true; return false; }
    this.rounds++;
    return true;
  }

  /** Only new source, environment, observed range or a valid completed resource resumes work. */
  reset(): void { this.rounds = 0; this.blocked = false; }
}
