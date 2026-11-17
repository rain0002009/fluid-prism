import { webgl, webgpu, type FluidPrism, type FluidPrismBackendKind } from '../src';
import { createSettingsPanel } from './settings';

const search = new URLSearchParams(window.location.search);
const initialBackend = (search.get('backend') === 'webgpu' ? 'webgpu' : 'webgl') satisfies FluidPrismBackendKind;
const scene = document.querySelector<HTMLElement>('#html-scene')!;
const originalTitle = scene.querySelector<HTMLElement>('[data-title]')!;
const nameInput = scene.querySelector<HTMLInputElement>('#name')!;
const greeting = scene.querySelector<HTMLOutputElement>('#greeting')!;
const counter = scene.querySelector<HTMLOutputElement>('#counter')!;
let count = 0;
nameInput.addEventListener('input', () => { greeting.textContent = `Hello, ${nameInput.value || 'Prism'}.`; });
scene.querySelector<HTMLFormElement>('form')!.addEventListener('submit', event => {
  event.preventDefault();
  greeting.textContent = `Saved: ${nameInput.value || 'Prism'}.`;
});
scene.querySelector<HTMLButtonElement>('#increment')!.addEventListener('click', () => { counter.value = String(++count); });

const controls = document.createElement('div');
controls.innerHTML = `
  <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.7);backdrop-filter:blur(16px);box-shadow:0 12px 40px rgba(0,0,0,.08);font:600 13px/1.2 Inter, Arial, sans-serif;color:#111;">
    <span>Renderer</span>
    <select id="backend-select" style="appearance:none;border:0;background:transparent;font:inherit;color:inherit;padding-right:10px;outline:none;cursor:pointer;">
      <option value="webgl">WebGL</option>
      <option value="webgpu">WebGPU</option>
    </select>
  </label>
  <label class="scene-control">Scene
    <select id="scene-select" aria-label="Scene">
      <option value="html">HTML in Canvas</option>
      <option value="canvas">2D canvas</option>
    </select>
  </label>
  <button id="change-title" type="button">Update HTML title</button>
  <div id="backend-status" style="margin-top:10px;padding:10px 14px;border-radius:16px;background:rgba(17,17,17,.72);color:#fff;font:500 12px/1.45 Inter, Arial, sans-serif;max-width:320px;"></div>
`;

Object.assign(controls.style, {
  position: 'fixed',
  top: '20px',
  left: '24px',
  zIndex: '4',
});

document.body.appendChild(controls);

const select = controls.querySelector<HTMLSelectElement>('#backend-select');
const status = controls.querySelector<HTMLDivElement>('#backend-status')!;
const sceneSelect = controls.querySelector<HTMLSelectElement>('#scene-select')!;
sceneSelect.value = search.get('scene') === 'canvas' ? 'canvas' : 'html';
scene.hidden = sceneSelect.value !== 'html';
controls.querySelector<HTMLButtonElement>('#change-title')!.addEventListener('click', () => {
  originalTitle.textContent = originalTitle.textContent === 'Real HTML. Liquid light.' ? 'Live content. Same DOM.' : 'Real HTML. Liquid light.';
});

if (!select || !status) {
  throw new Error('Failed to create playground controls.');
}

select.value = initialBackend;

let effect: FluidPrism | null = null;
let mountVersion = 0;
const settingsPanel = createSettingsPanel(options => effect?.update(options));
document.body.appendChild(settingsPanel.element);

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

async function mountEffect(backend: FluidPrismBackendKind) {
  const version = ++mountVersion;
  effect?.destroy();
  effect = null;
  const html = sceneSelect.value === 'html';
  scene.hidden = !html;
  updateStatus('Preparing the selected renderer…');
  try {
    const options = { zIndex: 1, ...settingsPanel.getOptions(), ...(html ? { htmlSource: scene } : { contentRenderer: renderContent }) };
    const instance = backend === 'webgpu' ? webgpu.createFluidPrism(options) : webgl.createFluidPrism(options);
    effect = instance;
    await instance.ready;
    if (version !== mountVersion) return;
    const url = new URL(window.location.href);
    url.searchParams.set('backend', backend);
    url.searchParams.set('scene', html ? 'html' : 'canvas');
    window.history.replaceState({}, '', url);
    const reportStatus = () => {
      if (version !== mountVersion) return;
      updateStatus(html
        ? instance.htmlSourceStatus === 'native'
          ? `${backend.toUpperCase()} · Native HTML in Canvas. Controls pause new ripples; existing trails fade naturally.`
          : '普通 HTML 降级 · 当前浏览器或后端无法绘制 HTML，表单与文字选择仍可使用。'
        : `${backend.toUpperCase()} · 2D canvas scene.`);
    };
    reportStatus();
    if (html) instance.canvas.addEventListener('paint', reportStatus);
  } catch (error) {
    console.error(error);
    updateStatus(error instanceof Error ? error.message : 'Failed to initialize the selected renderer.');
  }
}


select.addEventListener('change', () => {
  mountEffect(select.value === 'webgpu' ? 'webgpu' : 'webgl');
});

sceneSelect.addEventListener('change', () => { void mountEffect(select.value === 'webgpu' ? 'webgpu' : 'webgl'); });
window.addEventListener('pagehide', () => effect?.destroy());
void mountEffect(initialBackend);
