import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

let server, browser, origin;
const path = name => '/fluid-prism/@fs/' + resolve('src', name).replaceAll('\\', '/');

before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
});
after(async () => { await browser?.close(); await server?.close(); });

async function fixture() {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.route('**/runtime-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0}#canvas{width:400px;height:300px}</style><div id="scene"><button>Usable</button></div><canvas id="canvas"></canvas>' }));
  await page.goto(origin + '/fluid-prism/runtime-fixture');
  return page;
}

async function harness(page, overrides = {}) {
  await page.evaluate(async ({ runtimePath, sharedPath, overrides }) => {
    const { FluidRuntime, packStrokes, canvasPixelRatio } = await import(runtimePath);
    const { resolveOptions } = await import(sharedPath);
    const callbacks = new Map();
    let id = 0, now = 100, observer;
    window.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
    window.cancelAnimationFrame = key => callbacks.delete(key);
    window.IntersectionObserver = class {
      constructor(callback) { observer = callback; }
      observe() {} disconnect() {}
    };
    const motion = new EventTarget();
    motion.matches = false;
    window.matchMedia = () => motion;
    const frames = [];
    window.h = {
      options: resolveOptions(overrides), frames, ready: true, interacting: false,
      packStrokes, canvasPixelRatio, resolveOptions,
      pending: () => callbacks.size,
      step(ms = 1000 / 60) {
        now += ms;
        const work = [...callbacks.values()]; callbacks.clear();
        work.forEach(callback => callback(now));
      },
      visible(value) { observer([{ isIntersecting: value }]); },
      hidden(value) { Object.defineProperty(document, 'hidden', { value, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); },
      reduced(value) { motion.matches = value; motion.dispatchEvent(new Event('change')); },
      pointer(type, x, y, pointerId = 1) { window.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId })); },
    };
    h.runtime = new FluidRuntime(document.querySelector('#canvas'), () => h.options, () => h.interacting, frame => frames.push(frame), () => h.ready);
  }, { runtimePath: path('runtime.ts'), sharedPath: path('shared.ts'), overrides });
}

test('static scenes sleep, wake on input, pause when hidden/offscreen, and honor manual stop', async () => {
  const page = await fixture();
  try {
    await harness(page, { velocityDissipation: 0.1, weight1Dissipation: 0.1, weight2Dissipation: 0.1 });
    const result = await page.evaluate(() => {
      h.step(); const initial = [h.frames.length, h.pending()];
      h.runtime.splat(.5, .5, 20, 0); h.visible(false); h.step();
      const suspended = h.frames.length;
      h.visible(true); h.step(); const injected = h.frames.at(-1).strokes.length;
      for (let i = 0; i < 20; i++) h.step();
      const slept = h.pending();
      h.runtime.splat(.4, .4, 10, 0); h.hidden(true); h.step();
      const hiddenPending = h.pending(); h.hidden(false); h.step();
      const resumed = h.frames.at(-1).strokes.length;
      h.runtime.stop(); h.visible(false); h.visible(true); h.step();
      const stopped = [h.frames.at(-1).simulate, h.pending()];
      h.runtime.start(); h.step(); const restarted = h.frames.at(-1).simulate;
      h.runtime.destroy(); h.runtime.splat(.5, .5, 1, 1); h.pointer('pointerdown', 100, 100);
      return { initial, suspended, injected, slept, hiddenPending, resumed, stopped, restarted, destroyed: h.pending() };
    });
    assert.deepEqual(result, { initial: [1, 0], suspended: 1, injected: 1, slept: 0, hiddenPending: 0, resumed: 1, stopped: [false, 0], restarted: true, destroyed: 0 });
  } finally { await page.close(); }
});

test('initialization retains bounded splats and drains at most eight per frame', async () => {
  const page = await fixture();
  try {
    await harness(page);
    const result = await page.evaluate(() => {
      h.ready = false;
      for (let i = 0; i < 100; i++) h.runtime.splat(.5, .5, i, 0);
      h.step(); const waiting = [h.frames.length, h.pending()];
      h.ready = true; h.runtime.invalidate();
      for (let i = 0; i < 8; i++) h.step();
      return { waiting, sizes: h.frames.map(f => f.strokes.length), impulses: h.frames.flatMap(f => f.strokes.map(s => s.dx)) };
    });
    assert.deepEqual(result.waiting, [0, 0]);
    assert.deepEqual(result.sizes, Array(8).fill(8));
    assert.deepEqual(result.impulses, Array.from({ length: 64 }, (_, i) => i + 36));
  } finally { await page.close(); }
});

test('multiple pointers stay in bounds, fast clicks survive pointerup, and API input cannot starve', async () => {
  const page = await fixture();
  try {
    await harness(page);
    const result = await page.evaluate(() => {
      h.step(); h.pointer('pointerdown', 100, 100); h.pointer('pointerup', 100, 100); h.step();
      const click = h.frames.at(-1).strokes.length;
      for (let i = 0; i < 8; i++) { h.pointer('pointermove', 100, 100, i); h.pointer('pointermove', 150, 150, i); }
      h.runtime.splat(.5, .5, 123, 0); h.step();
      const batch = h.frames.at(-1).strokes;
      for (let i = 0; i < 8; i++) h.pointer('pointercancel', 150, 150, i);
      h.pointer('pointermove', -20, 100); h.pointer('pointermove', 300, 100); h.step();
      const reentry = h.frames.at(-1).strokes.length;
      h.pointer('pointermove', 330, 100); h.step();
      return { click, batch: batch.length, api: batch.some(s => s.dx === 123), reentry, inside: h.frames.at(-1).strokes.length };
    });
    assert.deepEqual(result, { click: 1, batch: 8, api: true, reentry: 0, inside: 1 });
  } finally { await page.close(); }
});

test('reduced motion and HTML interaction block injections while content can still repaint', async () => {
  const page = await fixture();
  try {
    await harness(page);
    const result = await page.evaluate(() => {
      h.reduced(true); h.runtime.splat(.5, .5, 20, 0); h.pointer('pointerdown', 100, 100); h.step();
      const reduced = h.frames.at(-1).strokes.length;
      h.options.respectReducedMotion = false; h.runtime.update(); h.runtime.splat(.5, .5, 20, 0); h.step();
      const optedOut = h.frames.at(-1).strokes.length;
      h.interacting = true; h.runtime.splat(.5, .5, 20, 0); h.step();
      const interactive = h.frames.at(-1).strokes.length;
      h.runtime.stop(); h.runtime.invalidate(); h.step();
      return { reduced, optedOut, interactive, repaint: h.frames.at(-1).simulate, pending: h.pending() };
    });
    assert.deepEqual(result, { reduced: 0, optedOut: 1, interactive: 0, repaint: false, pending: 0 });
  } finally { await page.close(); }
});

test('decay uses elapsed time, packing uses top-left coordinates, and resolution respects budgets', async () => {
  const page = await fixture();
  try {
    await harness(page);
    const result = await page.evaluate(() => {
      const frame = { now: 0, dt: .5, simulate: true, strokes: [{ x: 40, y: 30, tx: 40, ty: 30, dx: 10, dy: 20 }] };
      const half = h.packStrokes(frame, h.options, 2, 200, 150);
      const whole = h.packStrokes({ ...frame, dt: 1 }, h.options, 2, 200, 150);
      const ratio = h.canvasPixelRatio({ ...h.options, dpr: 100 }, 100000, 100000, 1024);
      let invalid = 0;
      for (const args of [[-1, 0, 0, 0], [.5, .5, Infinity, 0]]) { try { h.runtime.splat(...args); } catch { invalid++; } }
      h.options.autoSleep = false; h.step(); h.frames.length = 0;
      for (let i = 0; i < 240; i++) h.step(1000 / 240);
      const simulationSteps = h.frames.filter(frame => frame.simulate);
      return { decay: Math.abs(half[4] ** 2 - whole[4]), dt: half[11], position: [...half.slice(12, 16)], velocity: [...half.slice(20, 22)], dimension: 100000 * ratio, pixels: (100000 * ratio) ** 2, invalid, highRefresh: [simulationSteps.length, Math.min(...simulationSteps.map(frame => frame.dt))] };
    });
    assert.ok(result.decay < 1e-6);
    assert.equal(result.dt, .5);
    assert.deepEqual(result.position, [20, 135, 12, 1]);
    assert.ok(Math.abs(result.velocity[0] - .064) < 1e-6 && Math.abs(result.velocity[1] + .128) < 1e-6);
    assert.ok(result.dimension <= 1024 && result.pixels <= 16_777_216);
    assert.equal(result.invalid, 2);
    assert.equal(result.highRefresh[0], 60);
    assert.ok(result.highRefresh[1] > .999);
  } finally { await page.close(); }
});

test('the last queued splat settles before sleep, zero inputs disable injection, and dynamic scenes keep repainting', async () => {
  const page = await fixture();
  try {
    await harness(page, { velocityDissipation: 0, weight1Dissipation: 0, weight2Dissipation: 0 });
    const result = await page.evaluate(() => {
      for (let i = 0; i < 9; i++) h.runtime.splat(.5, .5, 1, 0);
      h.step(); h.step(); const last = h.frames.at(-1).strokes.length;
      h.step(); const decay = h.frames.at(-1).simulate;
      for (let i = 0; i < 4; i++) h.step();
      const slept = h.pending();
      h.options.radius = 0; h.runtime.update(); h.runtime.splat(.5, .5, 1, 0); h.step();
      const disabled = h.frames.at(-1).strokes.length;
      h.options.contentRenderer = () => {}; h.runtime.update(); h.step();
      const dynamic = [h.frames.at(-1).simulate, h.pending()];
      h.runtime.stop();
      h.options = h.resolveOptions({ radius: undefined, rainbow: undefined, autoSleep: undefined });
      const defaults = [h.options.radius, h.options.rainbow, h.options.autoSleep, h.options.respectReducedMotion];
      return { last, decay, slept, disabled, dynamic, defaults };
    });
    assert.deepEqual(result, { last: 1, decay: true, slept: 0, disabled: 0, dynamic: [false, 1], defaults: [24, true, true, true] });
  } finally { await page.close(); }
});

for (const backend of ['webgl', 'webgpu']) {
  test(backend + ' compiles shaders, renders a transparent brand splat, and keeps DOM interactive', async t => {
    const page = await fixture();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      const result = await page.evaluate(async ({ modulePath, backend }) => {
        const { createFluidPrism } = await import(modulePath);
        const source = document.querySelector('#scene'), canvas = document.querySelector('#canvas');
        const effect = await createFluidPrism({ backend, canvas, htmlSource: source, fullscreen: false, overlay: true, rainbow: false, color: [1, 0, 0], blend: 1, radius: 40 });
        // Queue input immediately, before asynchronous GPU initialization finishes.
        effect.splat(.25, .25, 20, 0);
        await effect.ready;
        if (backend === 'webgpu' && !effect.device) { effect.destroy(); return null; }
        const gpuErrors = [];
        effect.device?.addEventListener('uncapturederror', event => gpuErrors.push(event.error.message));
        const sample = () => new Promise(resolve => requestAnimationFrame(() => {
          const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
          const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
          const rgba = (x, y) => [...ctx.getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1).data];
          resolve({ center: rgba(.25, .25), outside: rgba(.9, .9) });
        }));
        const pixels = await sample();
        let opaque = null;
        if (backend === 'webgl') {
          effect.stop();
          effect.update({ overlay: false, htmlSource: undefined, backgroundColor: '#ffffff' });
          opaque = await sample();
          effect.update({ overlay: true, htmlSource: source });
          await sample();
        }
        const glError = effect.gl?.getError() ?? 0;
        const parent = source.parentElement.tagName;
        const status = effect.htmlSourceStatus;
        effect.stop(); effect.destroy();
        return { pixels, opaque, glError, gpuErrors, parent, status };
      }, { modulePath: path('index.ts'), backend });
      if (!result) { t.skip('No WebGPU adapter on this machine'); return; }
      assert.deepEqual(errors, []);
      assert.deepEqual(result.gpuErrors, []);
      assert.equal(result.glError, 0);
      assert.equal(result.parent, 'BODY');
      assert.equal(result.status, 'fallback');
      assert.ok(result.pixels.center[0] > 200 && result.pixels.center[1] < 10 && result.pixels.center[3] > 20, JSON.stringify(result));
      assert.equal(result.pixels.outside[3], 0);
      if (result.opaque) {
        assert.equal(result.opaque.outside[3], 255);
        assert.ok(result.opaque.center[0] > result.opaque.center[1] + 30, JSON.stringify(result.opaque));
      }
      await page.getByRole('button', { name: 'Usable' }).click();
    } finally { await page.close(); }
  });
}

test('playground exposes the new controls and preserves ordinary HTML through overlay switches', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + '/fluid-prism/');
    await page.waitForFunction(() => !document.querySelector('#backend-status').textContent.includes('Preparing'));
    const overlay = page.locator('#setting-overlay');
    await overlay.check();
    await page.getByText('透明叠加，原 HTML', { exact: false }).waitFor();
    await page.locator('#setting-rainbow').uncheck();
    await page.locator('#setting-color').fill('#ff0000');
    await page.getByRole('textbox', { name: 'Your name' }).fill('Overlay input');
    assert.equal(await page.locator('#greeting').textContent(), 'Hello, Overlay input.');
    assert.equal(await page.locator('#html-scene').evaluate(el => el.parentElement.tagName), 'BODY');
    await page.getByRole('button', { name: '注入中心波纹' }).click();
    await page.locator('#visual-settings').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: '.scratch/validation/runtime-settings-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.querySelector('#visual-settings').open);
    await page.locator('#visual-settings summary').click();
    await page.screenshot({ path: '.scratch/validation/runtime-settings-mobile.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: '恢复默认' }).click();
    assert.equal(await overlay.isChecked(), false);
    assert.equal(await page.locator('#setting-rainbow').isChecked(), true);
    assert.equal(await page.locator('#setting-radius').inputValue(), '24');
    assert.equal(await page.getByRole('textbox', { name: 'Your name' }).inputValue(), 'Overlay input');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
