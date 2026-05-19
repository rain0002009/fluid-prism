export interface FluidPrismOptions {
  /** Root element that receives the fixed canvas. Defaults to document.body. */
  container?: HTMLElement;
  /** Optional canvas. If omitted, a canvas is created automatically. */
  canvas?: HTMLCanvasElement;
  /** Element or image/canvas/video used as source texture. Defaults to document.body snapshot fallback is not used; use backgroundColor/contentRenderer for procedural content. */
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

interface FBO {
  texture: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

const DEFAULTS = {
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

const quadVS = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){ v_uv = a_pos * .5 + .5; gl_Position = vec4(a_pos, 0., 1.); }
`;

const lowFS = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
void main(){
  vec4 c = vec4(0.);
  c += texture2D(u_tex, v_uv + u_texel * vec2(-1., -1.));
  c += texture2D(u_tex, v_uv + u_texel * vec2( 1., -1.));
  c += texture2D(u_tex, v_uv + u_texel * vec2(-1.,  1.));
  c += texture2D(u_tex, v_uv + u_texel * vec2( 1.,  1.));
  gl_FragColor = c * .25;
}
`;

const paintFS = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_low;
uniform sampler2D u_prev;
uniform vec2 u_size;
uniform vec4 u_from;
uniform vec4 u_to;
uniform vec2 u_vel;
uniform vec3 u_diss;
uniform float u_push;
uniform float u_curlScale;
uniform float u_curlStrength;
vec2 sdSegment(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), .0001), 0., 1.);
  return vec2(length(pa - ba * h), h);
}
vec2 hash2(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031,.1030,.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}
vec3 noised(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 du = 30.0*f*f*(f*(f-2.0)+1.0);
  vec2 ga = hash2(i + vec2(0.,0.));
  vec2 gb = hash2(i + vec2(1.,0.));
  vec2 gc = hash2(i + vec2(0.,1.));
  vec2 gd = hash2(i + vec2(1.,1.));
  float va = dot(ga, f - vec2(0.,0.));
  float vb = dot(gb, f - vec2(1.,0.));
  float vc = dot(gc, f - vec2(0.,1.));
  float vd = dot(gd, f - vec2(1.,1.));
  return vec3(
    va + u.x*(vb-va) + u.y*(vc-va) + u.x*u.y*(va-vb-vc+vd),
    ga + u.x*(gb-ga) + u.y*(gc-ga) + u.x*u.y*(ga-gb-gc+gd) + du*(u.yx*(va-vb-vc+vd)+vec2(vb,vc)-va)
  );
}
void main(){
  vec2 p = gl_FragCoord.xy;
  vec2 seg = sdSegment(p, u_from.xy, u_to.xy);
  vec2 rw = mix(u_from.zw, u_to.zw, seg.y);
  float draw = 1.0 - smoothstep(-0.01, rw.x, seg.x);
  vec4 lowData = texture2D(u_low, v_uv);
  vec2 velInv = (.5 - lowData.xy) * u_push;
  vec3 n3 = noised(p * u_curlScale * (1.0 - lowData.xy));
  vec2 curl = noised(p * u_curlScale * (2.0 - lowData.xy * (0.5 + n3.x) + n3.yz * 0.1)).yz;
  velInv += curl * (lowData.z + lowData.w) * u_curlStrength;
  vec4 data = texture2D(u_prev, v_uv + velInv / u_size);
  data.xy -= .5;
  vec4 delta = vec4(data.xy * (u_diss.x - 1.0), data.z * (u_diss.y - 1.0), data.w * (u_diss.z - 1.0));
  vec2 newVel = u_vel * draw;
  delta += vec4(newVel, draw * rw.y, draw * rw.y * .42);
  delta.zw = sign(delta.zw) * max(vec2(.004), abs(delta.zw));
  data += delta;
  data.xy += .5;
  gl_FragColor = clamp(data, vec4(0.), vec4(1.));
}
`;

const finalFS = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_paint;
uniform vec2 u_paintTexel;
uniform float u_time;
uniform float u_amount;
uniform float u_rgbShift;
uniform float u_multiplier;
uniform float u_colorMultiplier;
uniform float u_shade;
uniform float u_pastelFilm;
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.7, 289.3))) * 45758.5453); }
vec4 sampleScene(vec2 uv){ return texture2D(u_scene, clamp(uv, vec2(.001), vec2(.999))); }
void main(){
  vec4 data = texture2D(u_paint, v_uv);
  float weight = (data.z + data.w) * .5;
  vec2 vel = (.5 - data.xy - .001) * 2. * weight;
  vec2 velocity = vel * u_amount / 4.0 * u_paintTexel * u_multiplier;
  vec2 bnoise = vec2(hash(gl_FragCoord.xy + vec2(17., 29.) + u_time), hash(gl_FragCoord.yx + vec2(29., 17.) - u_time));
  vec2 uv = v_uv + bnoise * velocity;
  vec4 color = vec4(0.);
  for (int i = 0; i < 9; i++) { color += sampleScene(uv); uv += velocity; }
  color /= 9.;
  float oilMask = smoothstep(0.4, -0.9, weight) * max(abs(vel.x), abs(vel.y));
  vec3 oil = sin(vec3(vel.x + vel.y) * 40.0 + vec3(0.0, 2.0, 4.0) * u_rgbShift) * oilMask * u_shade * u_colorMultiplier;
  color.rgb += oil;
  float film = smoothstep(.015, .42, weight) * (1.0 - smoothstep(.78, 1.0, weight)) * u_pastelFilm;
  vec3 pastel = vec3(sin((vel.x - vel.y) * 26.0 + 0.2), sin((vel.x + vel.y) * 31.0 + 2.3), sin((vel.y - vel.x) * 29.0 + 4.1)) * .5 + .5;
  pastel = mix(vec3(.98), pastel, .20);
  color.rgb = mix(color.rgb, color.rgb * pastel + vec3(.018, .025, .030) * film, film * .28);
  color.rgb += (hash(gl_FragCoord.xy + u_time * 11.) - .5) * .006;
  gl_FragColor = vec4(color.rgb, 1.);
}
`;

export class FluidPrism {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext;

  private options: Required<Omit<FluidPrismOptions, 'container' | 'canvas' | 'source' | 'contentRenderer'>> & Pick<FluidPrismOptions, 'container' | 'source' | 'contentRenderer'>;
  private ownsCanvas: boolean;
  private running = false;
  private raf = 0;
  private sceneCanvas = document.createElement('canvas');
  private sceneCtx = this.sceneCanvas.getContext('2d');
  private sceneTexture: WebGLTexture | null = null;
  private paintA!: FBO;
  private paintB!: FBO;
  private lowPaint!: FBO;
  private w = 1;
  private h = 1;
  private pw = 1;
  private ph = 1;
  private lw = 1;
  private lh = 1;
  private dpr = 1;
  private last = performance.now();
  private pointer = { x: 0, y: 0, px: 0, py: 0, tx: 0, ty: 0, speed: 0, hasInput: false };
  private paintProg: WebGLProgram;
  private lowProg: WebGLProgram;
  private finalProg: WebGLProgram;
  private quad: WebGLBuffer;

  constructor(options: FluidPrismOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.canvas = options.canvas ?? document.createElement('canvas');
    this.ownsCanvas = !options.canvas;
    const gl = this.canvas.getContext('webgl', { antialias: false, alpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('FluidPrism requires WebGL support.');
    this.gl = gl;
    this.paintProg = this.program(paintFS);
    this.lowProg = this.program(lowFS);
    this.finalProg = this.program(finalFS);
    const quad = gl.createBuffer();
    if (!quad) throw new Error('Failed to create WebGL buffer.');
    this.quad = quad;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    this.mount();
    this.resize();
    this.bindEvents();
    if (this.options.autoStart) this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.render);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerdown', this.move);
    if (this.ownsCanvas) this.canvas.remove();
  }

  update(options: Partial<FluidPrismOptions>) {
    this.options = { ...this.options, ...options };
    this.applyCanvasStyle();
    this.uploadScene(performance.now());
  }

  resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const viewportW = this.options.fullscreen ? window.innerWidth : rect.width || this.canvas.clientWidth || 1;
    const viewportH = this.options.fullscreen ? window.innerHeight : rect.height || this.canvas.clientHeight || 1;
    this.dpr = Math.min(this.options.dpr, window.devicePixelRatio || 1);
    this.w = Math.max(2, Math.floor(viewportW * this.dpr));
    this.h = Math.max(2, Math.floor(viewportH * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.pw = Math.max(2, Math.floor(this.w * this.options.paintScale));
    this.ph = Math.max(2, Math.floor(this.h * this.options.paintScale));
    this.lw = Math.max(2, Math.floor(this.w * this.options.lowScale));
    this.lh = Math.max(2, Math.floor(this.h * this.options.lowScale));
    this.paintA = this.fbo(this.pw, this.ph);
    this.paintB = this.fbo(this.pw, this.ph);
    this.lowPaint = this.fbo(this.lw, this.lh);
    this.clearPaint(this.paintA);
    this.clearPaint(this.paintB);
    this.clearPaint(this.lowPaint);
    this.pointer.x = this.pointer.px = this.pointer.tx = viewportW * 0.5;
    this.pointer.y = this.pointer.py = this.pointer.ty = viewportH * 0.5;
    this.uploadScene(performance.now());
  };

  private mount() {
    if (this.ownsCanvas) (this.options.container ?? document.body).appendChild(this.canvas);
    this.applyCanvasStyle();
  }

  private applyCanvasStyle() {
    if (this.options.fullscreen) {
      Object.assign(this.canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        display: 'block',
        pointerEvents: 'none',
        zIndex: String(this.options.zIndex),
        cursor: this.options.hideCursor ? 'none' : '',
      });
    }
  }

  private bindEvents() {
    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.move, { passive: true });
    window.addEventListener('pointerdown', this.move, { passive: true });
  }

  private move = (event: PointerEvent) => {
    this.pointer.tx = event.clientX;
    this.pointer.ty = event.clientY;
    this.pointer.hasInput = true;
  };

  private render = (now: number) => {
    if (!this.running) return;
    const gl = this.gl;
    const dt = Math.min(32, now - this.last) / 16.666;
    this.last = now;
    this.uploadScene(now);

    const p = this.pointer;
    p.x += (p.tx - p.x) * 0.55;
    p.y += (p.ty - p.y) * 0.55;
    const dx = (p.x - p.px) * this.dpr;
    const dy = (p.y - p.py) * this.dpr;
    const dist = Math.hypot(dx, dy);
    p.speed = p.speed * 0.72 + dist * 0.28;
    const radius = p.hasInput && dist > 0.18 ? Math.min(100, p.speed) : 0;
    const sourceH = this.options.fullscreen ? window.innerHeight : (this.canvas.getBoundingClientRect().height || this.canvas.clientHeight || 1);
    const fx = (p.px * this.dpr) * this.options.paintScale;
    const fy = ((sourceH - p.py) * this.dpr) * this.options.paintScale;
    const tx = (p.x * this.dpr) * this.options.paintScale;
    const ty = ((sourceH - p.y) * this.dpr) * this.options.paintScale;
    const velScale = 0.0032 * dt;

    gl.useProgram(this.lowProg); this.bindQuad(this.lowProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lowPaint.fb);
    gl.viewport(0, 0, this.lw, this.lh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.paintA.texture);
    this.uniform1i(this.lowProg, 'u_tex', 0);
    this.uniform2f(this.lowProg, 'u_texel', 1 / this.pw, 1 / this.ph);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.useProgram(this.paintProg); this.bindQuad(this.paintProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.paintB.fb);
    gl.viewport(0, 0, this.pw, this.ph);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.lowPaint.texture);
    this.uniform1i(this.paintProg, 'u_low', 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.paintA.texture);
    this.uniform1i(this.paintProg, 'u_prev', 1);
    this.uniform2f(this.paintProg, 'u_size', this.pw, this.ph);
    this.uniform4f(this.paintProg, 'u_from', fx, fy, radius, radius > 0 ? 1 : 0);
    this.uniform4f(this.paintProg, 'u_to', tx, ty, radius, radius > 0 ? 1 : 0);
    this.uniform2f(this.paintProg, 'u_vel', radius > 0 ? dx * velScale : 0, radius > 0 ? -dy * velScale : 0);
    this.uniform3f(this.paintProg, 'u_diss', this.options.velocityDissipation, this.options.weight1Dissipation, this.options.weight2Dissipation);
    this.uniform1f(this.paintProg, 'u_push', this.options.pushStrength);
    this.uniform1f(this.paintProg, 'u_curlScale', this.options.curlScale);
    this.uniform1f(this.paintProg, 'u_curlStrength', this.options.curlStrength);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    [this.paintA, this.paintB] = [this.paintB, this.paintA];

    gl.useProgram(this.finalProg); this.bindQuad(this.finalProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    this.uniform1i(this.finalProg, 'u_scene', 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.paintA.texture);
    this.uniform1i(this.finalProg, 'u_paint', 1);
    this.uniform2f(this.finalProg, 'u_paintTexel', 1 / this.pw, 1 / this.ph);
    this.uniform1f(this.finalProg, 'u_time', now * 0.001);
    this.uniform1f(this.finalProg, 'u_amount', this.options.amount);
    this.uniform1f(this.finalProg, 'u_rgbShift', this.options.rgbShift);
    this.uniform1f(this.finalProg, 'u_multiplier', this.options.multiplier);
    this.uniform1f(this.finalProg, 'u_colorMultiplier', this.options.colorMultiplier);
    this.uniform1f(this.finalProg, 'u_shade', this.options.shade);
    this.uniform1f(this.finalProg, 'u_pastelFilm', this.options.pastelFilm ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    p.px = p.x;
    p.py = p.y;
    this.raf = requestAnimationFrame(this.render);
  };

  private uploadScene(now: number) {
    const gl = this.gl;
    if (!this.sceneTexture) this.sceneTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (this.options.source) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.options.source);
      return;
    }

    if (!this.sceneCtx) return;
    this.sceneCanvas.width = this.w;
    this.sceneCanvas.height = this.h;
    if (this.options.contentRenderer) {
      this.options.contentRenderer(this.sceneCtx, { width: this.w, height: this.h, dpr: this.dpr, time: now });
    } else {
      this.sceneCtx.fillStyle = this.options.backgroundColor;
      this.sceneCtx.fillRect(0, 0, this.w, this.h);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sceneCanvas);
  }

  private clearPaint(target: FBO) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.clearColor(0.5, 0.5, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private tex(w: number, h: number, data: ArrayBufferView | null = null) {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error('Failed to create WebGL texture.');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return t;
  }

  private fbo(w: number, h: number): FBO {
    const gl = this.gl;
    const texture = this.tex(w, h);
    const fb = gl.createFramebuffer();
    if (!fb) throw new Error('Failed to create WebGL framebuffer.');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, fb, w, h };
  }

  private shader(type: number, src: string) {
    const gl = this.gl;
    const s = gl.createShader(type);
    if (!s) throw new Error('Failed to create WebGL shader.');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader compile failed.');
    return s;
  }

  private program(fs: string) {
    const gl = this.gl;
    const p = gl.createProgram();
    if (!p) throw new Error('Failed to create WebGL program.');
    gl.attachShader(p, this.shader(gl.VERTEX_SHADER, quadVS));
    gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'Program link failed.');
    return p;
  }

  private bindQuad(program: WebGLProgram) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  private uniform1i(program: WebGLProgram, name: string, x: number) { this.gl.uniform1i(this.gl.getUniformLocation(program, name), x); }
  private uniform1f(program: WebGLProgram, name: string, x: number) { this.gl.uniform1f(this.gl.getUniformLocation(program, name), x); }
  private uniform2f(program: WebGLProgram, name: string, x: number, y: number) { this.gl.uniform2f(this.gl.getUniformLocation(program, name), x, y); }
  private uniform3f(program: WebGLProgram, name: string, x: number, y: number, z: number) { this.gl.uniform3f(this.gl.getUniformLocation(program, name), x, y, z); }
  private uniform4f(program: WebGLProgram, name: string, x: number, y: number, z: number, w: number) { this.gl.uniform4f(this.gl.getUniformLocation(program, name), x, y, z, w); }
}

export function createFluidPrism(options?: FluidPrismOptions) {
  return new FluidPrism(options);
}
