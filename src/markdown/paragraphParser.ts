/** A debounced, single-flight host parse per editor pane; intermediate buffers are coalesced. */
export class ParagraphParser<T, R> {
  private latest: T | null = null;
  private revision = 0;
  private timer: number | undefined;
  private running = false;
  private disposed = false;

  constructor(parse: (source: T) => Promise<R>, accept: (source: T, result: R) => void,
    timers: Pick<Window, "setTimeout" | "clearTimeout">, delay = 80) {
    this.parse = parse;
    this.accept = accept;
    this.delay = delay;
    this.timers = timers;
  }
  private readonly parse: (source: T) => Promise<R>;
  private readonly accept: (source: T, result: R) => void;
  private readonly delay: number;
  private readonly timers: Pick<Window, "setTimeout" | "clearTimeout">;

  request(source: T | null): void {
    this.latest = source;
    this.revision++;
    this.timers.clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.disposed && source !== null) this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    this.latest = null;
    this.revision++;
    this.timers.clearTimeout(this.timer);
  }

  private schedule(): void {
    this.timer = this.timers.setTimeout(() => { this.timer = undefined; void this.run(); }, this.delay);
  }

  private async run(): Promise<void> {
    if (this.running || this.disposed || this.latest === null) return;
    const source = this.latest;
    const revision = this.revision;
    this.running = true;
    try {
      const result = await this.parse(source);
      if (!this.disposed && revision === this.revision) this.accept(source, result);
    } finally {
      this.running = false;
      if (!this.disposed && this.latest !== null && revision !== this.revision && this.timer === undefined) this.schedule();
    }
  }
}
