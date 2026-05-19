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

export type ResolvedFluidPrismOptions = Required<Omit<FluidPrismOptions, 'container' | 'canvas' | 'source' | 'contentRenderer'>> & Pick<FluidPrismOptions, 'container' | 'canvas' | 'source' | 'contentRenderer'>;

export interface PointerState {
  x: number;
  y: number;
  px: number;
  py: number;
  tx: number;
  ty: number;
  speed: number;
  hasInput: boolean;
}

export interface FluidPrismBackendController {
  readonly backend: FluidPrismBackendKind;
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext | null;
  readonly device: GPUDevice | null;
  start(): void;
  stop(): void;
  destroy(): void;
  update(options: Partial<FluidPrismOptions>): void;
  resize(): void;
}

export const DEFAULTS = {
  backend: 'webgl',
  fullscreen: true,
  dpr: 1.5,
  paintScale: 0.25,
  lowScale: 0.125,
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
} satisfies Required<Omit<FluidPrismOptions, 'container' | 'canvas' | 'source' | 'contentRenderer'>>;

export function resolveOptions(options: FluidPrismOptions = {}): ResolvedFluidPrismOptions {
  return { ...DEFAULTS, ...options };
}

export function applyCanvasStyle(canvas: HTMLCanvasElement, options: ResolvedFluidPrismOptions) {
  if (options.fullscreen) {
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

  Object.assign(canvas.style, {
    position: '',
    inset: '',
    width: '',
    height: '',
    display: 'block',
    pointerEvents: '',
    zIndex: '',
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

export function createInitialPointer(width: number, height: number): PointerState {
  return {
    x: width * 0.5,
    y: height * 0.5,
    px: width * 0.5,
    py: height * 0.5,
    tx: width * 0.5,
    ty: height * 0.5,
    speed: 0,
    hasInput: false,
  };
}
