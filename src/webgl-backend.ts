import { HTMLScene, type HTMLWebGLContext } from './html-source';
import { FluidRuntime, canvasPixelRatio, packStrokes, type FluidFrame } from './runtime';
import {
  applyCanvasStyle,
  renderSceneToCanvas,
  resolveOptions,
  type FluidPrismBackendController,
  type FluidPrismOptions,
  type ResolvedFluidPrismOptions,
} from './shared';

interface FBO {
  texture: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

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
uniform vec4 u_from[8];
uniform vec4 u_to[8];
uniform vec2 u_vel[8];
uniform vec3 u_diss;
uniform float u_push;
uniform float u_curlScale;
uniform float u_curlStrength;
uniform float u_dt;
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
  vec4 lowData = texture2D(u_low, v_uv);
  vec2 velInv = (.5 - lowData.xy) * u_push;
  vec3 n3 = noised(p * u_curlScale * (1.0 - lowData.xy));
  vec2 curl = noised(p * u_curlScale * (2.0 - lowData.xy * (0.5 + n3.x) + n3.yz * 0.1)).yz;
  velInv += curl * (lowData.z + lowData.w) * u_curlStrength;
  vec4 data = texture2D(u_prev, v_uv + velInv / u_size);
  data.xy -= .5;
  vec4 delta = vec4(data.xy * (u_diss.x - 1.0), data.z * (u_diss.y - 1.0), data.w * (u_diss.z - 1.0));
  for (int i = 0; i < 8; i++) {
    vec2 seg = sdSegment(p, u_from[i].xy, u_to[i].xy);
    vec2 rw = mix(u_from[i].zw, u_to[i].zw, seg.y);
    float draw = (1.0 - smoothstep(-0.01, rw.x, seg.x)) * rw.y;
    delta += vec4(u_vel[i] * draw, draw, draw * .42);
  }
  delta.zw = sign(delta.zw) * max(vec2(.004 * u_dt), abs(delta.zw));
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
uniform vec3 u_color;
uniform float u_rainbow;
uniform float u_blend;
uniform float u_overlay;
vec3 toLinear(vec3 c){ return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(vec3(.04045), c)); }
vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.)), vec3(1. / 2.4)) - .055, step(vec3(.0031308), c)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.7, 289.3))) * 45758.5453); }
vec4 sampleScene(vec2 uv){ return texture2D(u_scene, clamp(uv, vec2(.001), vec2(.999))); }
void main(){
  vec4 data = texture2D(u_paint, v_uv);
  float weight = (data.z + data.w) * .5;
  vec2 vel = (.5 - data.xy - .001) * 2. * weight;
  vec3 tint = u_rainbow > .5 ? sin(vec3(vel.x + vel.y) * 40. + vec3(0., 2., 4.)) * .5 + .5 : u_color;
  if (u_overlay > .5) {
    float alpha = clamp(weight * u_blend, 0., .85);
    gl_FragColor = vec4(tint * alpha, alpha);
    return;
  }
  vec2 velocity = vel * u_amount / 4.0 * u_paintTexel * u_multiplier;
  vec2 bnoise = vec2(hash(gl_FragCoord.xy + vec2(17., 29.) + u_time), hash(gl_FragCoord.yx + vec2(29., 17.) - u_time));
  vec2 uv = v_uv + bnoise * velocity;
  vec4 color = vec4(0.);
  for (int i = 0; i < 9; i++) { color += sampleScene(uv); uv += velocity; }
  color /= 9.;
  float oilMask = smoothstep(0.4, -0.9, weight) * max(abs(vel.x), abs(vel.y));
  vec3 oil = sin(vec3(vel.x + vel.y) * 40.0 + vec3(0.0, 2.0, 4.0) * u_rgbShift) * oilMask * u_shade * u_colorMultiplier;
  color.rgb += oil * u_rainbow;
  if (u_rainbow < .5) color.rgb = toSrgb(mix(toLinear(clamp(color.rgb, 0., 1.)), toLinear(u_color), clamp(weight * u_blend, 0., 1.)));
  float film = smoothstep(.015, .42, weight) * (1.0 - smoothstep(.78, 1.0, weight)) * u_pastelFilm * u_rainbow;
  vec3 pastel = vec3(sin((vel.x - vel.y) * 26.0 + 0.2), sin((vel.x + vel.y) * 31.0 + 2.3), sin((vel.y - vel.x) * 29.0 + 4.1)) * .5 + .5;
  pastel = mix(vec3(.98), pastel, .20);
  color.rgb = mix(color.rgb, color.rgb * pastel + vec3(.018, .025, .030) * film, film * .28);
  color.rgb += (hash(gl_FragCoord.xy + u_time * 11.) - .5) * .006;
  gl_FragColor = vec4(color.rgb, 1.);
}
`;

export class WebGLFluidPrismBackend implements FluidPrismBackendController {
  readonly ready = Promise.resolve();
  readonly backend = 'webgl' as const;
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext | null;
  readonly device = null;

  private options: ResolvedFluidPrismOptions;
  private htmlScene: HTMLScene | null = null;
  private ownsCanvas: boolean;
  private runtime: FluidRuntime | null = null;
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
  private paintProg!: WebGLProgram;
  private lowProg!: WebGLProgram;
  private finalProg!: WebGLProgram;
  private quad!: WebGLBuffer;
  private sceneWidth = 0;
  private sceneHeight = 0;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private contextUnavailable = false;

  constructor(options: FluidPrismOptions = {}) {
    this.options = resolveOptions({ ...options, backend: 'webgl' });
    this.canvas = options.canvas ?? document.createElement('canvas');
    this.ownsCanvas = !options.canvas;
    const gl = this.canvas.getContext('webgl', { antialias: false, alpha: true, powerPreference: 'high-performance' });
    this.gl = gl;
    if (!gl) {
      if (!this.options.htmlSource) throw new Error('FluidPrism requires WebGL support.');
      this.mount();
      this.configureHTMLSource();
      return;
    }
    this.paintProg = this.program(paintFS);
    this.lowProg = this.program(lowFS);
    this.finalProg = this.program(finalFS);
    const quad = gl.createBuffer();
    if (!quad) throw new Error('Failed to create WebGL buffer.');
    this.quad = quad;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.mount();
    this.configureHTMLSource();
    this.resize();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.runtime = new FluidRuntime(this.canvas, () => this.options, () => this.htmlScene?.interacting ?? false, this.render, this.canRender);
  }

  start() {
    if (this.destroyed || this.contextUnavailable || !this.gl || this.gl.isContextLost()) return;
    this.runtime?.start();
  }

  get htmlSourceStatus() { return this.htmlScene?.status ?? 'disabled'; }

  stop() {
    this.runtime?.stop();
  }

  splat(x: number, y: number, dx: number, dy: number) { this.runtime?.splat(x, y, dx, dy); }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.runtime?.destroy();
    this.htmlScene?.destroy();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.deletePaint();
    if (this.gl) {
      this.gl.deleteTexture(this.sceneTexture);
      this.gl.deleteBuffer(this.quad);
      for (const program of [this.paintProg, this.lowProg, this.finalProg]) this.gl.deleteProgram(program);
    }
    if (this.ownsCanvas) this.canvas.remove();
  }

  update(options: Partial<FluidPrismOptions>) {
    if (this.destroyed) return;
    const previousSource = this.options.htmlSource;
    const previousOverlay = this.options.overlay;
    this.options = resolveOptions({ ...this.options, ...options, backend: 'webgl' });
    if (this.options.htmlSource !== previousSource || this.options.overlay !== previousOverlay) this.configureHTMLSource();
    applyCanvasStyle(this.canvas, this.options);
    this.htmlScene?.refreshStyle();
    this.resize();
    if (!this.htmlScene && this.gl) this.uploadScene(performance.now());
    this.runtime?.update();
  }

  resize = () => {
    if (this.destroyed || this.contextUnavailable || !this.gl) return;
    const rect = this.canvas.getBoundingClientRect();
    const viewportW = this.options.fullscreen ? window.innerWidth : rect.width || this.canvas.clientWidth || 1;
    const viewportH = this.options.fullscreen ? window.innerHeight : rect.height || this.canvas.clientHeight || 1;
    this.dpr = canvasPixelRatio(this.options, viewportW, viewportH, Math.min(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE), this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE)));
    this.w = Math.max(2, Math.floor(viewportW * this.dpr));
    this.h = Math.max(2, Math.floor(viewportH * this.dpr));
    if (this.canvas.width === this.w && this.canvas.height === this.h &&
        this.paintA?.w === Math.max(2, Math.floor(this.w * this.options.paintScale)) &&
        this.lowPaint?.w === Math.max(2, Math.floor(this.w * this.options.lowScale))) {
      this.htmlScene?.resize();
      return;
    }
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.pw = Math.max(2, Math.floor(this.w * this.options.paintScale));
    this.ph = Math.max(2, Math.floor(this.h * this.options.paintScale));
    this.lw = Math.max(2, Math.floor(this.w * this.options.lowScale));
    this.lh = Math.max(2, Math.floor(this.h * this.options.lowScale));
    this.deletePaint();
    this.paintA = this.fbo(this.pw, this.ph);
    this.paintB = this.fbo(this.pw, this.ph);
    this.lowPaint = this.fbo(this.lw, this.lh);
    this.clearPaint(this.paintA);
    this.clearPaint(this.paintB);
    this.clearPaint(this.lowPaint);
    this.runtime?.resize();
    this.htmlScene?.resize();
    if (!this.htmlScene) this.uploadScene(performance.now());
  };

  private configureHTMLSource() {
    this.htmlScene?.destroy();
    this.htmlScene = null;
    applyCanvasStyle(this.canvas, this.options);
    if (this.options.htmlSource) {
      this.htmlScene = new HTMLScene(this.canvas, this.options.htmlSource, () => this.runtime?.invalidate(), this.options.overlay);
      this.htmlScene.activate(!this.contextUnavailable && Boolean(this.gl && !this.gl.isContextLost()) &&
        typeof (this.gl as Partial<HTMLWebGLContext> | null)?.texElementSubImage2D === 'function');
    }
    this.sceneWidth = this.sceneHeight = 0;
    this.runtime?.invalidate();
  }

  private mount() {
    if (this.ownsCanvas) (this.options.container ?? document.body).appendChild(this.canvas);
    applyCanvasStyle(this.canvas, this.options);
  }

  private bindEvents() {
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize, { passive: true });
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
  }

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.contextUnavailable = true;
    this.stop();
    this.htmlScene?.fallback();
  };

  private get context() {
    if (!this.gl) throw new Error('FluidPrism requires WebGL support.');
    return this.gl;
  }

  private render = (frame: FluidFrame) => {
    if (this.destroyed || this.contextUnavailable) return;
    if (this.htmlScene && !this.options.overlay && (this.htmlScene.status !== 'native' || !this.htmlScene.snapshotReady)) { this.htmlScene.requestPaint(); return; }
    const gl = this.context;
    const { now } = frame;
    try { this.uploadScene(now); }
    catch (error) {
      if (!this.htmlScene) throw error;
      this.htmlScene.fallback();
      return;
    }

    if (frame.simulate) {
      const packed = packStrokes(frame, this.options, this.dpr, this.pw, this.ph);
      const from = new Float32Array(32), to = new Float32Array(32), velocity = new Float32Array(16);
      for (let i = 0; i < 8; i++) {
        from.set(packed.subarray(12 + i * 12, 16 + i * 12), i * 4);
        to.set(packed.subarray(16 + i * 12, 20 + i * 12), i * 4);
        velocity.set(packed.subarray(20 + i * 12, 22 + i * 12), i * 2);
      }
      gl.useProgram(this.lowProg);
      this.bindQuad(this.lowProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lowPaint.fb);
      gl.viewport(0, 0, this.lw, this.lh);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.paintA.texture);
      this.uniform1i(this.lowProg, 'u_tex', 0);
      this.uniform2f(this.lowProg, 'u_texel', 1 / this.pw, 1 / this.ph);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.useProgram(this.paintProg);
      this.bindQuad(this.paintProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.paintB.fb);
      gl.viewport(0, 0, this.pw, this.ph);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.lowPaint.texture);
      this.uniform1i(this.paintProg, 'u_low', 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.paintA.texture);
      this.uniform1i(this.paintProg, 'u_prev', 1);
      this.uniform2f(this.paintProg, 'u_size', this.pw, this.ph);
      gl.uniform4fv(gl.getUniformLocation(this.paintProg, 'u_from[0]'), from);
      gl.uniform4fv(gl.getUniformLocation(this.paintProg, 'u_to[0]'), to);
      gl.uniform2fv(gl.getUniformLocation(this.paintProg, 'u_vel[0]'), velocity);
      this.uniform3f(this.paintProg, 'u_diss', packed[4], packed[5], packed[6]);
      this.uniform1f(this.paintProg, 'u_push', packed[8]);
      this.uniform1f(this.paintProg, 'u_curlScale', this.options.curlScale);
      this.uniform1f(this.paintProg, 'u_curlStrength', packed[10]);
      this.uniform1f(this.paintProg, 'u_dt', frame.dt);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      [this.paintA, this.paintB] = [this.paintB, this.paintA];
    }

    gl.useProgram(this.finalProg);
    this.bindQuad(this.finalProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    this.uniform1i(this.finalProg, 'u_scene', 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paintA.texture);
    this.uniform1i(this.finalProg, 'u_paint', 1);
    this.uniform2f(this.finalProg, 'u_paintTexel', 1 / this.pw, 1 / this.ph);
    this.uniform1f(this.finalProg, 'u_time', now * 0.001);
    this.uniform1f(this.finalProg, 'u_amount', this.options.amount);
    this.uniform1f(this.finalProg, 'u_rgbShift', this.options.rgbShift);
    this.uniform1f(this.finalProg, 'u_multiplier', this.options.multiplier);
    this.uniform1f(this.finalProg, 'u_colorMultiplier', this.options.colorMultiplier);
    this.uniform1f(this.finalProg, 'u_shade', this.options.shade);
    this.uniform1f(this.finalProg, 'u_pastelFilm', this.options.pastelFilm ? 1 : 0);
    this.uniform3f(this.finalProg, 'u_color', ...this.options.color);
    this.uniform1f(this.finalProg, 'u_rainbow', this.options.rainbow ? 1 : 0);
    this.uniform1f(this.finalProg, 'u_blend', this.options.blend);
    this.uniform1f(this.finalProg, 'u_overlay', this.options.overlay ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (frame.simulate) this.htmlScene?.requestPaint();
  };

  private canRender = () => {
    if (this.destroyed || this.contextUnavailable) return false;
    if (this.htmlScene && !this.options.overlay) {
      if (this.htmlScene.status !== 'native') return false;
      if (!this.htmlScene.snapshotReady) { this.htmlScene.requestPaint(); return false; }
    }
    return true;
  };

  private uploadScene(now: number) {
    if (this.options.overlay) {
      // Active WebGL samplers need a complete texture even in the overlay branch.
      if (!this.sceneTexture) this.sceneTexture = this.tex(1, 1, new Uint8Array(4));
      return;
    }
    if (this.htmlScene && (!this.htmlScene.snapshotReady || !this.htmlScene.needsUpload)) return;
    const gl = this.context;
    if (!this.sceneTexture) this.sceneTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.htmlScene) {
      if (this.sceneWidth !== this.w || this.sceneHeight !== this.h) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.sceneWidth = this.w; this.sceneHeight = this.h;
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      try {
        (gl as HTMLWebGLContext).texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.htmlScene.source, { width: this.w, height: this.h });
        this.htmlScene.needsUpload = false;
      } finally { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0); }
      return;
    }
    renderSceneToCanvas(this.sceneCanvas, this.sceneCtx, this.options, { width: this.w, height: this.h, dpr: this.dpr }, now);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sceneCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  }

  private clearPaint(target: FBO) {
    const gl = this.context;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.clearColor(0.5, 0.5, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private deletePaint() {
    for (const target of [this.paintA, this.paintB, this.lowPaint]) {
      if (target) { this.context.deleteTexture(target.texture); this.context.deleteFramebuffer(target.fb); }
    }
  }

  private tex(w: number, h: number, data: ArrayBufferView | null = null) {
    const gl = this.context;
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
    const gl = this.context;
    const texture = this.tex(w, h);
    const fb = gl.createFramebuffer();
    if (!fb) throw new Error('Failed to create WebGL framebuffer.');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, fb, w, h };
  }

  private shader(type: number, src: string) {
    const gl = this.context;
    const s = gl.createShader(type);
    if (!s) throw new Error('Failed to create WebGL shader.');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader compile failed.');
    return s;
  }

  private program(fs: string) {
    const gl = this.context;
    const p = gl.createProgram();
    if (!p) throw new Error('Failed to create WebGL program.');
    gl.attachShader(p, this.shader(gl.VERTEX_SHADER, quadVS));
    gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'Program link failed.');
    return p;
  }

  private bindQuad(program: WebGLProgram) {
    const gl = this.context;
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  private uniform1i(program: WebGLProgram, name: string, x: number) { this.context.uniform1i(this.context.getUniformLocation(program, name), x); }
  private uniform1f(program: WebGLProgram, name: string, x: number) { this.context.uniform1f(this.context.getUniformLocation(program, name), x); }
  private uniform2f(program: WebGLProgram, name: string, x: number, y: number) { this.context.uniform2f(this.context.getUniformLocation(program, name), x, y); }
  private uniform3f(program: WebGLProgram, name: string, x: number, y: number, z: number) { this.context.uniform3f(this.context.getUniformLocation(program, name), x, y, z); }
}
