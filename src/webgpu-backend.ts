import {
  applyCanvasStyle,
  createInitialPointer,
  renderSceneToCanvas,
  resolveOptions,
  type FluidPrismBackendController,
  type FluidPrismOptions,
  type PointerState,
  type ResolvedFluidPrismOptions,
} from './shared';

interface PingTexture {
  texture: GPUTexture;
  view: GPUTextureView;
}

const GPU_BUFFER_USAGE_UNIFORM = 0x0040;
const GPU_BUFFER_USAGE_COPY_DST = 0x0008;
const GPU_TEXTURE_USAGE_TEXTURE_BINDING = 0x0004;
const GPU_TEXTURE_USAGE_COPY_DST = 0x0002;
const GPU_TEXTURE_USAGE_RENDER_ATTACHMENT = 0x0010;

const fullscreenVertexWGSL = /* wgsl */ `
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex : u32) -> VertexOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );

  let position = positions[vertexIndex];
  var out : VertexOut;
  out.position = vec4f(position, 0.0, 1.0);
  out.uv = position * 0.5 + vec2f(0.5, 0.5);
  return out;
}
`;

const lowFragmentWGSL = /* wgsl */ `
struct LowUniforms {
  texel : vec4f,
}

@group(0) @binding(0) var sceneSampler : sampler;
@group(0) @binding(1) var sceneTexture : texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms : LowUniforms;

@fragment
fn main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let sampleUv = vec2f(uv.x, 1.0 - uv.y);
  let texel = vec2f(uniforms.texel.x, -uniforms.texel.y);
  var color = vec4f(0.0);
  color += textureSample(sceneTexture, sceneSampler, sampleUv + texel * vec2f(-1.0, -1.0));
  color += textureSample(sceneTexture, sceneSampler, sampleUv + texel * vec2f( 1.0, -1.0));
  color += textureSample(sceneTexture, sceneSampler, sampleUv + texel * vec2f(-1.0,  1.0));
  color += textureSample(sceneTexture, sceneSampler, sampleUv + texel * vec2f( 1.0,  1.0));
  return color * 0.25;
}
`;

const paintFragmentWGSL = /* wgsl */ `
struct PaintUniforms {
  size : vec4f,
  strokeFrom : vec4f,
  strokeTo : vec4f,
  vel : vec4f,
  diss : vec4f,
  params : vec4f,
}

@group(0) @binding(0) var linearSampler : sampler;
@group(0) @binding(1) var lowTexture : texture_2d<f32>;
@group(0) @binding(2) var prevTexture : texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms : PaintUniforms;

fn sdSegment(p : vec2f, a : vec2f, b : vec2f) -> vec2f {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return vec2f(length(pa - ba * h), h);
}

fn hash2(p : vec2f) -> vec2f {
  var p3 = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));
  p3 += vec3f(dot(p3, p3.yzx + vec3f(33.33)));
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

fn noised(p : vec2f) -> vec3f {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  let ga = hash2(i + vec2f(0.0, 0.0));
  let gb = hash2(i + vec2f(1.0, 0.0));
  let gc = hash2(i + vec2f(0.0, 1.0));
  let gd = hash2(i + vec2f(1.0, 1.0));
  let va = dot(ga, f - vec2f(0.0, 0.0));
  let vb = dot(gb, f - vec2f(1.0, 0.0));
  let vc = dot(gc, f - vec2f(0.0, 1.0));
  let vd = dot(gd, f - vec2f(1.0, 1.0));
  let value = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);
  let deriv = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (u.yx * (va - vb - vc + vd) + vec2f(vb, vc) - vec2f(va, va));
  return vec3f(value, deriv.x, deriv.y);
}

@fragment
fn main(@builtin(position) position : vec4f, @location(0) uv : vec2f) -> @location(0) vec4f {
  let sampleUv = vec2f(uv.x, 1.0 - uv.y);
  let p = vec2f(position.x, uniforms.size.y - position.y);
  let seg = sdSegment(p, uniforms.strokeFrom.xy, uniforms.strokeTo.xy);
  let rw = mix(uniforms.strokeFrom.zw, uniforms.strokeTo.zw, vec2f(seg.y));
  let draw = 1.0 - smoothstep(-0.01, rw.x, seg.x);
  let lowData = textureSample(lowTexture, linearSampler, sampleUv);
  var velInv = (vec2f(0.5, 0.5) - lowData.xy) * uniforms.params.x;
  let n3 = noised(p * uniforms.params.y * (vec2f(1.0, 1.0) - lowData.xy));
  let curl = noised(p * uniforms.params.y * (vec2f(2.0, 2.0) - lowData.xy * (0.5 + n3.x) + n3.yz * 0.1)).yz;
  velInv += curl * (lowData.z + lowData.w) * uniforms.params.z;
  var data = textureSample(prevTexture, linearSampler, sampleUv + vec2f(velInv.x / uniforms.size.x, -velInv.y / uniforms.size.y));
  data = vec4f(data.xy - vec2f(0.5, 0.5), data.zw);
  var delta = vec4f(
    data.xy * (uniforms.diss.x - 1.0),
    data.z * (uniforms.diss.y - 1.0),
    data.w * (uniforms.diss.z - 1.0),
  );
  let newVel = uniforms.vel.xy * draw;
  delta += vec4f(newVel, draw * rw.y, draw * rw.y * 0.42);
  delta = vec4f(delta.xy, sign(delta.zw) * max(vec2f(0.004, 0.004), abs(delta.zw)));
  data += delta;
  data = vec4f(data.xy + vec2f(0.5, 0.5), data.zw);
  return clamp(data, vec4f(0.0), vec4f(1.0));
}
`;

const finalFragmentWGSL = /* wgsl */ `
struct FinalUniforms {
  frameA : vec4f,
  frameB : vec4f,
  frameC : vec4f,
}

@group(0) @binding(0) var linearSampler : sampler;
@group(0) @binding(1) var sceneTexture : texture_2d<f32>;
@group(0) @binding(2) var paintTexture : texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms : FinalUniforms;

fn hash(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(41.7, 289.3))) * 45758.5453);
}

fn sampleScene(uv : vec2f) -> vec4f {
  return textureSample(sceneTexture, linearSampler, clamp(uv, vec2f(0.001), vec2f(0.999)));
}

@fragment
fn main(@builtin(position) position : vec4f, @location(0) uvIn : vec2f) -> @location(0) vec4f {
  let paintUv = vec2f(uvIn.x, 1.0 - uvIn.y);
  let sceneUv = vec2f(uvIn.x, 1.0 - uvIn.y);
  let data = textureSample(paintTexture, linearSampler, paintUv);
  let weight = (data.z + data.w) * 0.5;
  let vel = (vec2f(0.5, 0.5) - data.xy - vec2f(0.001, 0.001)) * 2.0 * weight;
  let velocity = vel * uniforms.frameA.w / 4.0 * uniforms.frameA.xy * uniforms.frameB.y;
  let time = uniforms.frameA.z;
  let pixelPos = vec2f(position.x, position.y);
  let noise = vec2f(
    hash(pixelPos + vec2f(17.0, 29.0) + vec2f(time, time)),
    hash(pixelPos.yx + vec2f(29.0, 17.0) - vec2f(time, time)),
  );
  var uv = sceneUv + vec2f(noise.x * velocity.x, noise.y * velocity.y);
  var color = vec4f(0.0);
  for (var i = 0; i < 9; i++) {
    color += sampleScene(uv);
    uv += velocity;
  }
  color /= 9.0;
  let oilMask = smoothstep(0.4, -0.9, weight) * max(abs(vel.x), abs(vel.y));
  let oil = sin(vec3f(vel.x + vel.y) * 40.0 + vec3f(0.0, 2.0, 4.0) * uniforms.frameB.x) * oilMask * uniforms.frameB.w * uniforms.frameB.z;
  color = vec4f(color.rgb + oil, color.a);
  let film = smoothstep(0.015, 0.42, weight) * (1.0 - smoothstep(0.78, 1.0, weight)) * uniforms.frameC.x;
  var pastel = vec3f(
    sin((vel.x - vel.y) * 26.0 + 0.2),
    sin((vel.x + vel.y) * 31.0 + 2.3),
    sin((vel.y - vel.x) * 29.0 + 4.1),
  ) * 0.5 + vec3f(0.5);
  pastel = mix(vec3f(0.98), pastel, vec3f(0.20));
  let mixedColor = mix(color.rgb, color.rgb * pastel + vec3f(0.018, 0.025, 0.030) * film, vec3f(film * 0.28));
  let grain = (hash(pixelPos + vec2f(time * 11.0, time * 11.0)) - 0.5) * 0.006;
  color = vec4f(mixedColor + vec3f(grain), color.a);
  return vec4f(color.rgb, 1.0);
}
`;

export class WebGPUFluidPrismBackend implements FluidPrismBackendController {
  readonly backend = 'webgpu' as const;
  readonly canvas: HTMLCanvasElement;
  readonly gl = null;

  private options: ResolvedFluidPrismOptions;
  private ownsCanvas: boolean;
  private running = false;
  private destroyed = false;
  private raf = 0;
  private sceneCanvas = document.createElement('canvas');
  private sceneCtx = this.sceneCanvas.getContext('2d');
  private w = 1;
  private h = 1;
  private pw = 1;
  private ph = 1;
  private lw = 1;
  private lh = 1;
  private dpr = 1;
  private last = performance.now();
  private pointer: PointerState = createInitialPointer(1, 1);

  private context: GPUCanvasContext | null = null;
  private gpuDevice: GPUDevice | null = null;
  private surfaceFormat: GPUTextureFormat | null = null;
  private sampler: GPUSampler | null = null;
  private sceneTexture: GPUTexture | null = null;
  private sceneView: GPUTextureView | null = null;
  private paintA: PingTexture | null = null;
  private paintB: PingTexture | null = null;
  private lowPaint: PingTexture | null = null;
  private lowPipeline: GPURenderPipeline | null = null;
  private paintPipeline: GPURenderPipeline | null = null;
  private finalPipeline: GPURenderPipeline | null = null;
  private lowUniformBuffer: GPUBuffer | null = null;
  private paintUniformBuffer: GPUBuffer | null = null;
  private finalUniformBuffer: GPUBuffer | null = null;
  private ready = false;
  private initError: Error | null = null;
  private initPromise: Promise<void>;

  constructor(options: FluidPrismOptions = {}) {
    if (!navigator.gpu) {
      throw new Error('FluidPrism WebGPU backend requires WebGPU support.');
    }
    this.options = resolveOptions({ ...options, backend: 'webgpu' });
    this.canvas = options.canvas ?? document.createElement('canvas');
    this.ownsCanvas = !options.canvas;
    this.mount();
    this.resize();
    this.bindEvents();
    this.initPromise = this.init();
    if (this.options.autoStart) this.start();
  }

  get device() {
    return this.gpuDevice;
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
    this.destroyed = true;
    this.stop();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerdown', this.move);
    if (this.ownsCanvas) this.canvas.remove();
  }

  update(options: Partial<FluidPrismOptions>) {
    this.options = resolveOptions({ ...this.options, ...options, backend: 'webgpu' });
    applyCanvasStyle(this.canvas, this.options);
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
    this.pointer = createInitialPointer(viewportW, viewportH);
    if (this.ready) this.recreateResources();
  };

  private mount() {
    if (this.ownsCanvas) (this.options.container ?? document.body).appendChild(this.canvas);
    applyCanvasStyle(this.canvas, this.options);
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

  private async init() {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('WebGPU adapter unavailable.');
      const device = await adapter.requestDevice();
      if (this.destroyed) return;
      this.gpuDevice = device;
      const context = this.canvas.getContext('webgpu') as GPUCanvasContext | null;
      if (!context) throw new Error('Failed to create WebGPU canvas context.');
      this.context = context;
      this.surfaceFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format: this.surfaceFormat,
        alphaMode: 'premultiplied',
      });

      this.sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });

      this.lowUniformBuffer = device.createBuffer({ size: 16, usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST });
      this.paintUniformBuffer = device.createBuffer({ size: 96, usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST });
      this.finalUniformBuffer = device.createBuffer({ size: 48, usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST });
      this.lowPipeline = this.createPipeline(lowFragmentWGSL, 'rgba8unorm');
      this.paintPipeline = this.createPipeline(paintFragmentWGSL, 'rgba8unorm');
      this.finalPipeline = this.createPipeline(finalFragmentWGSL, this.surfaceFormat);

      device.lost.then((info) => {
        if (this.destroyed) return;
        this.initError = new Error(`WebGPU device lost: ${info.message}`);
        this.ready = false;
        this.stop();
      });

      this.ready = true;
      this.recreateResources();
    } catch (error) {
      this.initError = error instanceof Error ? error : new Error(String(error));
      this.stop();
    }
  }

  private createPipeline(fragment: string, format: GPUTextureFormat) {
    const device = this.gpuDevice;
    if (!device) throw new Error('WebGPU device is not ready.');
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: fullscreenVertexWGSL }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: fragment }),
        entryPoint: 'main',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  private recreateResources() {
    if (!this.gpuDevice) return;
    this.sceneTexture?.destroy();
    this.paintA?.texture.destroy();
    this.paintB?.texture.destroy();
    this.lowPaint?.texture.destroy();

    this.sceneTexture = this.gpuDevice.createTexture({
      size: { width: this.w, height: this.h },
      format: 'rgba8unorm',
      usage: GPU_TEXTURE_USAGE_COPY_DST | GPU_TEXTURE_USAGE_TEXTURE_BINDING | GPU_TEXTURE_USAGE_RENDER_ATTACHMENT,
    });
    this.sceneView = this.sceneTexture.createView();
    this.paintA = this.createPingTexture(this.pw, this.ph);
    this.paintB = this.createPingTexture(this.pw, this.ph);
    this.lowPaint = this.createPingTexture(this.lw, this.lh);
    this.clearTexture(this.paintA.texture, { r: 0.5, g: 0.5, b: 0, a: 0 });
    this.clearTexture(this.paintB.texture, { r: 0.5, g: 0.5, b: 0, a: 0 });
    this.clearTexture(this.lowPaint.texture, { r: 0.5, g: 0.5, b: 0, a: 0 });
  }

  private createPingTexture(width: number, height: number): PingTexture {
    if (!this.gpuDevice) throw new Error('WebGPU device is not ready.');
    const texture = this.gpuDevice.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPU_TEXTURE_USAGE_RENDER_ATTACHMENT | GPU_TEXTURE_USAGE_TEXTURE_BINDING,
    });
    return { texture, view: texture.createView() };
  }

  private clearTexture(texture: GPUTexture, clearValue: GPUColor) {
    if (!this.gpuDevice) return;
    const encoder = this.gpuDevice.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: texture.createView(),
        clearValue,
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.end();
    this.gpuDevice.queue.submit([encoder.finish()]);
  }

  private render = (now: number) => {
    if (!this.running) return;
    if (this.initError) {
      console.error(this.initError);
      this.stop();
      return;
    }
    if (!this.ready || !this.gpuDevice || !this.context || !this.surfaceFormat || !this.sampler || !this.sceneTexture || !this.sceneView || !this.paintA || !this.paintB || !this.lowPaint || !this.lowPipeline || !this.paintPipeline || !this.finalPipeline || !this.lowUniformBuffer || !this.paintUniformBuffer || !this.finalUniformBuffer) {
      this.raf = requestAnimationFrame(this.render);
      return;
    }

    const dt = Math.min(32, now - this.last) / 16.666;
    this.last = now;

    renderSceneToCanvas(this.sceneCanvas, this.sceneCtx, this.options, { width: this.w, height: this.h, dpr: this.dpr }, now);
    this.gpuDevice.queue.copyExternalImageToTexture(
      { source: this.sceneCanvas },
      { texture: this.sceneTexture },
      { width: this.w, height: this.h },
    );

    const p = this.pointer;
    p.x += (p.tx - p.x) * 0.55;
    p.y += (p.ty - p.y) * 0.55;
    const dx = (p.x - p.px) * this.dpr;
    const dy = (p.y - p.py) * this.dpr;
    const dist = Math.hypot(dx, dy);
    p.speed = p.speed * 0.72 + dist * 0.28;
    const radius = p.hasInput && dist > 0.18 ? Math.min(100, p.speed) : 0;
    const sourceH = this.options.fullscreen ? window.innerHeight : this.canvas.getBoundingClientRect().height || this.canvas.clientHeight || 1;
    const fx = p.px * this.dpr * this.options.paintScale;
    const fy = (sourceH - p.py) * this.dpr * this.options.paintScale;
    const tx = p.x * this.dpr * this.options.paintScale;
    const ty = (sourceH - p.y) * this.dpr * this.options.paintScale;
    const velScale = 0.0032 * dt;

    this.gpuDevice.queue.writeBuffer(this.lowUniformBuffer, 0, new Float32Array([1 / this.pw, 1 / this.ph, 0, 0]));
    this.gpuDevice.queue.writeBuffer(this.paintUniformBuffer, 0, new Float32Array([
      this.pw, this.ph, 0, 0,
      fx, fy, radius, radius > 0 ? 1 : 0,
      tx, ty, radius, radius > 0 ? 1 : 0,
      radius > 0 ? dx * velScale : 0, radius > 0 ? -dy * velScale : 0, 0, 0,
      this.options.velocityDissipation, this.options.weight1Dissipation, this.options.weight2Dissipation, 0,
      this.options.pushStrength, this.options.curlScale, this.options.curlStrength, 0,
    ]));
    this.gpuDevice.queue.writeBuffer(this.finalUniformBuffer, 0, new Float32Array([
      1 / this.pw, 1 / this.ph, now * 0.001, this.options.amount,
      this.options.rgbShift, this.options.multiplier, this.options.colorMultiplier, this.options.shade,
      this.options.pastelFilm ? 1 : 0, 0, 0, 0,
    ]));

    const encoder = this.gpuDevice.createCommandEncoder();

    const lowBindGroup = this.gpuDevice.createBindGroup({
      layout: this.lowPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.paintA.view },
        { binding: 2, resource: { buffer: this.lowUniformBuffer } },
      ],
    });
    const lowPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.lowPaint.view,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    lowPass.setPipeline(this.lowPipeline);
    lowPass.setBindGroup(0, lowBindGroup);
    lowPass.draw(3);
    lowPass.end();

    const paintBindGroup = this.gpuDevice.createBindGroup({
      layout: this.paintPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.lowPaint.view },
        { binding: 2, resource: this.paintA.view },
        { binding: 3, resource: { buffer: this.paintUniformBuffer } },
      ],
    });
    const paintPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.paintB.view,
        clearValue: { r: 0.5, g: 0.5, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    paintPass.setPipeline(this.paintPipeline);
    paintPass.setBindGroup(0, paintBindGroup);
    paintPass.draw(3);
    paintPass.end();
    [this.paintA, this.paintB] = [this.paintB, this.paintA];

    const finalBindGroup = this.gpuDevice.createBindGroup({
      layout: this.finalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.sceneView },
        { binding: 2, resource: this.paintA.view },
        { binding: 3, resource: { buffer: this.finalUniformBuffer } },
      ],
    });
    const finalPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    finalPass.setPipeline(this.finalPipeline);
    finalPass.setBindGroup(0, finalBindGroup);
    finalPass.draw(3);
    finalPass.end();

    this.gpuDevice.queue.submit([encoder.finish()]);
    p.px = p.x;
    p.py = p.y;
    this.raf = requestAnimationFrame(this.render);
  };
}
