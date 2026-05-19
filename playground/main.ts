import { webgl, webgpu, type FluidPrismBackendKind } from '../src';

const search = new URLSearchParams(window.location.search);
const initialBackend = (search.get('backend') === 'webgpu' ? 'webgpu' : 'webgl') satisfies FluidPrismBackendKind;

const controls = document.createElement('div');
controls.innerHTML = `
  <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.7);backdrop-filter:blur(16px);box-shadow:0 12px 40px rgba(0,0,0,.08);font:600 13px/1.2 Inter, Arial, sans-serif;color:#111;">
    <span>Renderer</span>
    <select id="backend-select" style="appearance:none;border:0;background:transparent;font:inherit;color:inherit;padding-right:10px;outline:none;cursor:pointer;">
      <option value="webgl">WebGL</option>
      <option value="webgpu">WebGPU</option>
    </select>
  </label>
  <div id="backend-status" style="margin-top:10px;padding:10px 14px;border-radius:16px;background:rgba(17,17,17,.72);color:#fff;font:500 12px/1.45 Inter, Arial, sans-serif;max-width:320px;"></div>
`;

Object.assign(controls.style, {
  position: 'fixed',
  top: '24px',
  left: '24px',
  zIndex: '4',
});

document.body.appendChild(controls);

const select = controls.querySelector<HTMLSelectElement>('#backend-select');
const status = controls.querySelector<HTMLDivElement>('#backend-status');

if (!select || !status) {
  throw new Error('Failed to create playground controls.');
}

select.value = initialBackend;

let effect: { destroy(): void } | null = null;

function updateStatus(message: string) {
  status.textContent = message;
}

function renderContent(ctx: CanvasRenderingContext2D, { width: w, height: h }: { width: number; height: number; dpr: number; time: number }) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#f3f4fb');
  g.addColorStop(0.55, '#eef2fb');
  g.addColorStop(1, '#f6f0f0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#f4ead8';
  ctx.lineWidth = 1;
  const step = Math.max(56, Math.round(w / 28));
  for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#050505';
  ctx.font = `900 ${Math.max(96, w * 0.15)}px Inter, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Fluid prism,', w * 0.05, h * 0.42);
  ctx.fillText('touch the light.', w * 0.05, h * 0.62);

  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.font = `500 ${Math.max(16, w * 0.014)}px Inter, Arial, sans-serif`;
  ctx.fillText('Move your cursor to refract the page texture.', w * 0.055, h * 0.76);
}

function mountEffect(backend: FluidPrismBackendKind) {
  effect?.destroy();
  effect = null;
  try {
    effect = backend === 'webgpu'
      ? webgpu.createFluidPrism({
          zIndex: 1,
          contentRenderer: renderContent,
        })
      : webgl.createFluidPrism({
          zIndex: 1,
          contentRenderer: renderContent,
        });
    const url = new URL(window.location.href);
    url.searchParams.set('backend', backend);
    window.history.replaceState({}, '', url);
    updateStatus(backend === 'webgpu'
      ? 'WebGPU backend active. If your browser/device support it, the effect runs on WebGPU.'
      : 'WebGL backend active. This remains the default renderer and baseline compatibility path.');
  } catch (error) {
    console.error(error);
    updateStatus(error instanceof Error ? error.message : 'Failed to initialize the selected renderer.');
  }
}


select.addEventListener('change', () => {
  mountEffect(select.value === 'webgpu' ? 'webgpu' : 'webgl');
});

mountEffect(initialBackend);
