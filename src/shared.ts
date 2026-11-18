export type FluidPrismBackendKind = 'webgl' | 'webgpu';

export interface FluidPrismOptions {
  /** Rendering backend. Defaults to webgl. */
  backend?: FluidPrismBackendKind;
  /** Root element that receives the fixed canvas. Defaults to document.body. */
  container?: HTMLElement;
  /** Optional canvas. If omitted, a canvas is created automatically. */
  canvas?: HTMLCanvasElement;
  /** Element or image/canvas/video used as source texture. */
  source?: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
  /** Live HTML scene. Uses native HTML-in-Canvas, or leaves ordinary DOM visible. */
  htmlSource?: HTMLElement;
  /** Draw your own scene into an internal 2D canvas before every texture upload. */
  contentRenderer?: (ctx: CanvasRenderingContext2D, size: { width: number; height: number; dpr: number; time: number }) => void;
  /** Whether the managed canvas should be fixed fullscreen. Defaults to true. */
  fullscreen?: boolean;
  /** Max device pixel ratio. Defaults to 1.5. */
  dpr?: number;
  /** Paint buffer scale. Larger = sharper and more expensive. Defaults to 0.25. */
  paintScale?: number;
  /** Low feedback buffer scale. Defaults to 0.125. */
  lowScale?: number;
  /** Pointer/splat radius in CSS pixels. Defaults to 24. */
  radius?: number;
  /** Pointer and API impulse multiplier. Defaults to 1. */
  force?: number;
  /** Sleep after ripples settle. Dynamic canvas/video/renderers keep updating. */
  autoSleep?: boolean;
  /** Respect the system reduced-motion preference. Defaults to true. */
  respectReducedMotion?: boolean;
  /** Brand tint as sRGB components in [0, 1]. */
  color?: [number, number, number];
  /** Use the original iridescent colors instead of the fixed tint. Defaults to true. */
  rainbow?: boolean;
  /** Tint/overlay opacity multiplier in [0, 1]. Defaults to 0.15. */
  blend?: number;
  /** Render a transparent fluid overlay; HTML stays in its original DOM. */
  overlay?: boolean;
  /** Distortion amount. Defaults to 3. */
  amount?: number;
  /** RGB phase shift. Defaults to 0.5. */
  rgbShift?: number;
  /** Distortion multiplier. Defaults to 5. */
  multiplier?: number;
  /** Color interference multiplier. Defaults to 10. */
  colorMultiplier?: number;
  /** Overall shade. Defaults to 1.25. */
  shade?: number;
  /** Velocity feedback strength. Defaults to 25. */
  pushStrength?: number;
  /** Velocity dissipation. Defaults to 0.975. */
  velocityDissipation?: number;
  /** Fresh paint dissipation. Defaults to 0.955. */
  weight1Dissipation?: number;
  /** Long trail dissipation. Defaults to 0.86. */
  weight2Dissipation?: number;
  /** Curl noise scale. Defaults to 0.02. */
  curlScale?: number;
  /** Curl noise strength. Defaults to 3. */
  curlStrength?: number;
  /** Optional pastel film enhancement for light backgrounds. Defaults to true. */
  pastelFilm?: boolean;
  /** CSS background used when no source/contentRenderer is provided. Defaults to #f4f1ec. */
  backgroundColor?: string;
  /** Auto start render loop. Defaults to true. */
  autoStart?: boolean;
  /** Hide system cursor over canvas. Defaults to false. */
  hideCursor?: boolean;
  /** Canvas z-index when fullscreen. Defaults to 0. */
  zIndex?: number | string;
}

type OptionalOptions = 'container' | 'canvas' | 'source' | 'htmlSource' | 'contentRenderer';
export type ResolvedFluidPrismOptions = Required<Omit<FluidPrismOptions, OptionalOptions>> & Pick<FluidPrismOptions, OptionalOptions>;

export interface FluidPrismBackendController {
  readonly htmlSourceStatus: import('./html-source').HTMLSourceStatus;
  /** Resolves when the backend has initialized, or the HTML scene has fallen back. */
  readonly ready: Promise<void>;
  readonly backend: FluidPrismBackendKind;
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext | null;
  readonly device: GPUDevice | null;
  start(): void;
  stop(): void;
  /** Inject at normalized top-left coordinates [0,1]; dx/dy are CSS-pixel impulses. */
  splat(x: number, y: number, dx: number, dy: number): void;
  destroy(): void;
  /** Merge options; undefined restores defaults or clears an optional input. */
  update(options: Partial<FluidPrismOptions>): void;
  resize(): void;
}

export const DEFAULTS = {
  backend: 'webgl',
  fullscreen: true,
  dpr: 1.5,
  paintScale: 0.25,
  lowScale: 0.125,
  radius: 24,
  force: 1,
  autoSleep: true,
  respectReducedMotion: true,
  color: [0.145, 0.239, 0.867] as [number, number, number],
  rainbow: true,
  blend: 0.15,
  overlay: false,
  amount: 3,
  rgbShift: 0.5,
  multiplier: 5,
  colorMultiplier: 10,
  shade: 1.25,
  pushStrength: 25,
  velocityDissipation: 0.975,
  weight1Dissipation: 0.955,
  weight2Dissipation: 0.86,
  curlScale: 0.02,
  curlStrength: 3,
  pastelFilm: true,
  backgroundColor: '#f4f1ec',
  autoStart: true,
  hideCursor: false,
  zIndex: 0,
} satisfies Required<Omit<FluidPrismOptions, OptionalOptions>>;

export function resolveOptions(options: FluidPrismOptions = {}): ResolvedFluidPrismOptions {
  if (options.htmlSource && (options.source || options.contentRenderer)) {
    throw new Error('htmlSource cannot be combined with source or contentRenderer.');
  }
  if (options.htmlSource) {
    const containsCanvas = options.canvas && options.htmlSource.contains(options.canvas);
    const containsMount = !options.canvas && options.htmlSource.contains(options.container ?? document.body);
    if (containsCanvas || containsMount) throw new Error('htmlSource must not contain the effect canvas or its mount container.');
    if (options.htmlSource.querySelector('[drawable]')) throw new Error('htmlSource must be a single drawable subtree; nested drawable elements are not supported.');
  }
  // Framework props can disappear between renders. Explicit undefined resets them.
  const definedOptions = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
  const resolved = { ...DEFAULTS, ...definedOptions };
  for (const key of ['dpr', 'paintScale', 'lowScale'] as const) {
    if (!Number.isFinite(resolved[key]) || resolved[key] <= 0) throw new RangeError(key + ' must be a positive finite number.');
  }
  for (const key of ['radius', 'force', 'blend'] as const) {
    if (!Number.isFinite(resolved[key]) || resolved[key] < 0) throw new RangeError(key + ' must be a non-negative finite number.');
  }
  for (const key of ['velocityDissipation', 'weight1Dissipation', 'weight2Dissipation'] as const) {
    if (!Number.isFinite(resolved[key]) || resolved[key] < 0 || resolved[key] > 1) throw new RangeError(key + ' must be in [0, 1].');
  }
  if (resolved.blend > 1 || resolved.color.length !== 3 || resolved.color.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError('blend and color components must be in [0, 1].');
  }
  return { ...resolved, color: [...resolved.color] };
}

const fullscreenProperties = ['position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'z-index', 'pointer-events'] as const;
const localCanvasStyles = new WeakMap<HTMLCanvasElement, [string, string, string][]>();

export function applyCanvasStyle(canvas: HTMLCanvasElement, options: ResolvedFluidPrismOptions) {
  if (options.fullscreen) {
    if (!localCanvasStyles.has(canvas)) {
      localCanvasStyles.set(canvas, fullscreenProperties.map(name => [name, canvas.style.getPropertyValue(name), canvas.style.getPropertyPriority(name)]));
    }
    Object.assign(canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      display: 'block',
      pointerEvents: 'none',
      zIndex: String(options.zIndex),
      cursor: options.hideCursor ? 'none' : '',
    });
    return;
  }

  const localStyles = localCanvasStyles.get(canvas);
  if (localStyles) {
    for (const [name, value, priority] of localStyles) {
      if (value) canvas.style.setProperty(name, value, priority);
      else canvas.style.removeProperty(name);
    }
    localCanvasStyles.delete(canvas);
  }
  Object.assign(canvas.style, {
    display: 'block',
    cursor: options.hideCursor ? 'none' : '',
  });
}

export function renderSceneToCanvas(
  sceneCanvas: HTMLCanvasElement,
  sceneCtx: CanvasRenderingContext2D | null,
  options: ResolvedFluidPrismOptions,
  size: { width: number; height: number; dpr: number },
  now: number,
) {
  if (!sceneCtx) return;

  sceneCanvas.width = size.width;
  sceneCanvas.height = size.height;

  if (options.source) {
    sceneCtx.clearRect(0, 0, size.width, size.height);
    sceneCtx.drawImage(options.source, 0, 0, size.width, size.height);
    return;
  }

  if (options.contentRenderer) {
    options.contentRenderer(sceneCtx, { width: size.width, height: size.height, dpr: size.dpr, time: now });
    return;
  }

  sceneCtx.fillStyle = options.backgroundColor;
  sceneCtx.fillRect(0, 0, size.width, size.height);
}
