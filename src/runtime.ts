import type { ResolvedFluidPrismOptions } from './shared';

export interface Stroke { x: number; y: number; tx: number; ty: number; dx: number; dy: number; speed?: number }
export interface FluidFrame { now: number; dt: number; simulate: boolean; strokes: Stroke[] }
const MAX_SPLATS = 64;
export const MAX_STROKES = 8;
const interactive = 'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [tabindex], [role="button"]';

/** Shared scheduling and input policy; GPU resources stay in their backend. */
export class FluidRuntime {
  private enabled = false;
  private destroyed = false;
  private visible = true;
  private dirty = true;
  private raf = 0;
  private last = 0;
  private simulationTime = 0;
  private remaining = 0;
  private rect: DOMRect | null = null;
  private pointers = new Map<number, Stroke & { speed: number }>();
  private queued: [number, number, number, number][] = [];
  private listeners = new AbortController();
  private motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private intersection: IntersectionObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    private options: () => ResolvedFluidPrismOptions,
    private interacting: () => boolean,
    private render: (frame: FluidFrame) => void,
    private canRender: () => boolean = () => true,
  ) {
    const signal = this.listeners.signal;
    window.addEventListener('pointermove', this.move, { passive: true, signal });
    window.addEventListener('pointerdown', this.down, { passive: true, signal });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      window.addEventListener(name, this.leave, { passive: true, signal });
    }
    window.addEventListener('blur', this.resetPointers, { signal });
    window.addEventListener('scroll', this.resetPointers, { capture: true, passive: true, signal });
    document.addEventListener('visibilitychange', this.visibility, { signal });
    this.motion.addEventListener('change', this.motionChanged, { signal });
    this.intersection = new IntersectionObserver(entries => {
      this.visible = entries[entries.length - 1]?.isIntersecting ?? true;
      this.visibility();
    });
    this.intersection.observe(canvas);
    this.enabled = this.options().autoStart;
    this.invalidate();
  }

  start() { if (!this.destroyed) { this.enabled = true; this.last = 0; this.invalidate(); } }
  stop() {
    this.enabled = false;
    this.resetPointers();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
    this.simulationTime = 0;
  }
  invalidate = () => {
    if (this.destroyed) return;
    this.dirty = true;
    this.schedule();
  };
  resize() { this.resetPointers(); this.invalidate(); }
  update() {
    if (this.remaining > 0) this.remaining = this.idleDuration();
    this.motionChanged();
  }

  splat(x: number, y: number, dx: number, dy: number) {
    if (this.destroyed) return;
    if (![x, y, dx, dy].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) {
      throw new RangeError('splat requires x/y in [0, 1] and finite dx/dy.');
    }
    if (this.reduced || this.interactionPaused || !this.options().radius || !this.options().force) return;
    if (this.queued.length === MAX_SPLATS) this.queued.shift();
    this.queued.push([x, y, dx, dy]);
    this.activate();
  }

  destroy() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this.queued.length = 0;
    this.listeners.abort();
    this.intersection.disconnect();
  }

  private get reduced() { return this.options().respectReducedMotion && this.motion.matches; }
  private get interactionPaused() { return this.options().pauseOnInteraction && this.interacting(); }
  private get suspended() { return !this.visible || document.hidden; }
  private get dynamic() {
    const options = this.options();
    return Boolean(options.contentRenderer || options.source instanceof HTMLVideoElement || options.source instanceof HTMLCanvasElement);
  }
  private idleDuration() {
    const options = this.options();
    const dissipation = Math.max(options.velocityDissipation, options.weight1Dissipation, options.weight2Dissipation);
    return dissipation >= 1 ? Infinity : Math.max(1000 / 60, dissipation <= 0 ? 0 : Math.log(1e-5) / Math.log(dissipation) * 1000 / 60);
  }
  private activate() { this.remaining = this.idleDuration(); this.invalidate(); }
  private schedule() {
    if (!this.raf && !this.destroyed && !this.suspended) this.raf = requestAnimationFrame(this.frame);
  }
  private resetPointers = () => { this.pointers.clear(); this.rect = null; };
  private visibility = () => {
    if (this.suspended) { cancelAnimationFrame(this.raf); this.raf = 0; this.last = 0; this.resetPointers(); }
    else this.invalidate();
  };
  private motionChanged = () => {
    if (this.reduced || !this.options().radius || !this.options().force) { this.resetPointers(); this.queued.length = 0; }
    this.invalidate();
  };
  private leave = (event: PointerEvent) => { this.pointers.delete(event.pointerId); };
  private down = (event: PointerEvent) => { this.rect = null; this.move(event, true); };
  private move = (event: PointerEvent, down = false) => {
    if (this.destroyed || !this.enabled || this.suspended || this.reduced || !this.options().radius || !this.options().force) return;
    if (this.interactionPaused || (this.options().pauseOnInteraction && this.options().htmlSource && event.target instanceof Element && event.target.closest(interactive))) {
      this.pointers.delete(event.pointerId);
      return;
    }
    const rect = this.rect ??= this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 || x > rect.width || y > rect.height) {
      this.pointers.delete(event.pointerId);
      return;
    }
    const previous = this.pointers.get(event.pointerId);
    if (previous && !down) { previous.tx = x; previous.ty = y; }
    else {
      if (this.pointers.size === MAX_STROKES) this.pointers.delete(this.pointers.keys().next().value!);
      this.pointers.set(event.pointerId, { x, y, tx: x, ty: y, dx: 0, dy: 0, speed: 0 });
    }
    if (down) this.splat(x / rect.width, y / rect.height, 1, 1);
    if (previous || down) this.activate();
  };

  private frame = (now: number) => {
    this.raf = 0;
    if (this.destroyed || this.suspended) return;
    // Initialization/native paint will invalidate when ready. Preserve queued input.
    if (!this.canRender()) { this.last = 0; return; }
    const elapsed = this.last ? Math.max(0, Math.min(100, now - this.last)) / (1000 / 60) : 1;
    this.last = now;
    const options = this.options();
    const active = this.enabled && (this.remaining > 0 || this.queued.length > 0 || !options.autoSleep);
    // Aggregate high-refresh frames: sub-frame decay can round away in RGBA8.
    this.simulationTime = active ? this.simulationTime + elapsed : 0;
    const simulate = active && this.simulationTime >= 1 - 1e-6;
    const dt = simulate ? this.simulationTime : elapsed;
    const step = Math.min(1, dt);
    if (simulate) this.simulationTime = 0;
    const strokes: Stroke[] = [];
    if (this.interactionPaused) this.queued.length = 0;
    if (simulate && !this.reduced && !this.interactionPaused) {
      const budget = MAX_STROKES - (this.queued.length ? 1 : 0);
      const smoothing = 1 - Math.pow(0.45, step);
      for (const [id, pointer] of [...this.pointers]) {
        if (strokes.length >= budget) break;
        const dx = (pointer.tx - pointer.x) * smoothing + pointer.dx;
        const dy = (pointer.ty - pointer.y) * smoothing + pointer.dy;
        const retention = Math.pow(0.72, step);
        pointer.speed = pointer.speed * retention + Math.hypot(dx, dy) * (1 - retention);
        pointer.dx = pointer.dy = 0;
        if (Math.hypot(dx, dy) < 0.05) continue;
        strokes.push({ x: pointer.x, y: pointer.y, tx: pointer.x + dx, ty: pointer.y + dy, dx, dy, speed: pointer.speed });
        pointer.x += dx;
        pointer.y += dy;
        // Rotate active pointers so the API reservation cannot starve one finger.
        this.pointers.delete(id);
        this.pointers.set(id, pointer);
      }
      const rect = this.rect ??= this.canvas.getBoundingClientRect();
      while (this.queued.length && strokes.length < MAX_STROKES) {
        const [x, y, dx, dy] = this.queued.shift()!;
        strokes.push({ x: x * rect.width, y: y * rect.height, tx: x * rect.width, ty: y * rect.height, dx, dy });
      }
    } else if (!this.enabled || this.reduced || this.interactionPaused) this.resetPointers();
    this.rect = null; // At most one layout read per frame, including transformed containers.
    this.dirty = false;
    this.render({ now, dt, simulate, strokes });
    if (strokes.length) this.remaining = this.idleDuration();
    else if (simulate) this.remaining = Math.max(0, this.remaining - step * 1000 / 60);
    if (this.dirty || (this.enabled && (this.remaining > 0 || this.queued.length > 0 || this.dynamic || !options.autoSleep))) this.schedule();
    else this.last = 0;
  };
}

/** Shared buffer layout: size, dissipation, flow parameters, then 8 (from,to,velocity) records. */
export function packStrokes(frame: FluidFrame, options: ResolvedFluidPrismOptions, dpr: number, width: number, height: number) {
  // Preserve the original fade per rendered step when rendering falls below 60Hz.
  const step = Math.min(1, frame.dt);
  const data = new Float32Array(12 + MAX_STROKES * 12);
  data.set([width, height, 0, 0,
    Math.pow(options.velocityDissipation, step), Math.pow(options.weight1Dissipation, step), Math.pow(options.weight2Dissipation, step), 0,
    options.pushStrength * step, options.curlScale, options.curlStrength * step, step]);
  const scale = dpr * options.paintScale;
  frame.strokes.forEach((stroke, index) => {
    // The original brush radius is already in simulation pixels, not CSS pixels.
    const automatic = options.radius === 'auto' && stroke.speed !== undefined;
    const radius = automatic ? Math.min(100, stroke.speed! * dpr) : (options.radius === 'auto' ? 24 : options.radius) * scale;
    const active = radius > 0 && (!automatic || Math.hypot(stroke.dx, stroke.dy) * dpr > 0.18);
    data.set([stroke.x * scale, height - stroke.y * scale, radius, active ? 1 : 0,
      stroke.tx * scale, height - stroke.ty * scale, radius, active ? 1 : 0,
      stroke.dx * dpr * 0.0032 * options.force * frame.dt, -stroke.dy * dpr * 0.0032 * options.force * frame.dt, 0, 0], 12 + index * 12);
  });
  return data;
}

export function canvasPixelRatio(options: ResolvedFluidPrismOptions, width: number, height: number, maxDimension: number) {
  const bufferScale = Math.max(1, options.paintScale, options.lowScale);
  return Math.min(options.dpr, (window.devicePixelRatio || 1) * (window.visualViewport?.scale || 1),
    maxDimension / (Math.max(width, height) * bufferScale), Math.sqrt(16_777_216 / (width * height)) / bufferScale);
}
