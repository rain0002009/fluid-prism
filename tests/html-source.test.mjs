import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer as createHTTPServer } from 'node:http';
import { chromium } from 'playwright';
import { build, createServer } from 'vite';

let server;
let browser;
let origin;
const modulePath = `/fluid-prism/@fs/${resolve('src/index.ts').replaceAll('\\', '/')}`;

before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    args: ['--enable-unsafe-webgpu'],
  });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function fixture({ disableNative = false } = {}) {
  const page = await browser.newPage();
  if (disableNative) {
    await page.addInitScript(() => {
      Object.defineProperty(HTMLCanvasElement.prototype, 'requestPaint', { value: undefined, configurable: true });
    });
  }
  await page.route('**/test-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><div id="host"><section id="scene"><label>Name <input value="Prism"></label><p>Select this text.</p></section><span id="after">After</span></div>',
  }));
  await page.goto(`${origin}/fluid-prism/test-fixture`);
  return page;
}

test('unsupported native HTML keeps the original interactive DOM available', async () => {
  const page = await fixture({ disableNative: true });
  try {
    const state = await page.evaluate(async modulePath => {
      const { createFluidPrism } = await import(modulePath);
      const source = document.querySelector('#scene');
      const effect = await createFluidPrism({ htmlSource: source, autoStart: false });
      window.effect = effect;
      return {
        status: effect.htmlSourceStatus,
        parent: source.parentElement.id,
        canvasHidden: getComputedStyle(effect.canvas).visibility === 'hidden',
      };
    }, modulePath);
    assert.deepEqual(state, { status: 'fallback', parent: 'host', canvasHidden: true });
    await page.getByRole('textbox', { name: 'Name' }).fill('Still interactive');
    assert.equal(await page.getByRole('textbox').inputValue(), 'Still interactive');
    await page.evaluate(() => window.effect.destroy());
    assert.equal(await page.locator('#host').innerHTML(), '<section id="scene"><label>Name <input value="Prism"></label><p>Select this text.</p></section><span id="after">After</span>');
  } finally {
    await page.close();
  }
});

test('local canvases retain component layout through updates and fullscreen round trips', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(async modulePath => {
      const { webgl, webgpu } = await import(modulePath);
      const results = [];
      for (const factory of [webgl, webgpu]) {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position: absolute; top: 12px; left: 20px; width: 480px; height: 320px; z-index: 7;';
        document.body.append(canvas);
        const effect = factory.createFluidPrism({ canvas, fullscreen: false, htmlSource: document.querySelector('#scene'), autoStart: false });
        await effect.ready;
        const layout = () => [canvas.style.position, canvas.style.top, canvas.style.right, canvas.style.bottom, canvas.style.left, canvas.style.width, canvas.style.height, canvas.style.zIndex];
        const initial = layout();
        effect.update({ amount: 6 });
        const updated = layout();
        effect.update({ fullscreen: true });
        effect.update({ fullscreen: false });
        results.push({ initial, updated, restored: layout() });
        effect.destroy();
        canvas.remove();
      }
      return results;
    }, modulePath);
    const expected = ['absolute', '12px', '', '', '20px', '480px', '320px', '7'];
    assert.deepEqual(result, Array.from({ length: 2 }, () => ({ initial: expected, updated: expected, restored: expected })));
  } finally {
    await page.close();
  }
});

test('clearing a visual option restores its default without replacing the HTML scene', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(async modulePath => {
      const { webgl, webgpu } = await import(modulePath);
      const widths = [];
      const source = document.querySelector('#scene');
      for (const factory of [webgl, webgpu]) {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width: 480px; height: 320px;';
        document.body.append(canvas);
        const effect = factory.createFluidPrism({ canvas, fullscreen: false, htmlSource: source, dpr: 0.5, autoStart: false });
        await effect.ready;
        const initial = canvas.width;
        source.querySelector('input').value = 'Keep my form';
        effect.update({ dpr: undefined });
        widths.push([initial, canvas.width, source.querySelector('input').value]);
        effect.destroy();
        canvas.remove();
      }
      return widths;
    }, modulePath);
    assert.deepEqual(result, [[240, 480, 'Keep my form'], [240, 480, 'Keep my form']]);
  } finally {
    await page.close();
  }
});

test('native WebGL HTML paints live content and preserves input, keyboard and selection', async () => {
  const page = await fixture();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const state = await page.evaluate(async modulePath => {
      const { webgl } = await import(modulePath);
      const source = document.querySelector('#scene');
      source.style.background = 'rgb(240, 100, 80)';
      source.insertAdjacentHTML('beforeend', '<button>Next control</button>');
      window.effect = webgl.createFluidPrism({ htmlSource: source, autoStart: false });
      return { status: window.effect.htmlSourceStatus, insideCanvas: source.parentElement === window.effect.canvas };
    }, modulePath);
    assert.deepEqual(state, { status: 'native', insideCanvas: true });
    const pixel = await page.evaluate(() => new Promise(resolve => {
      const { canvas, gl } = window.effect;
      canvas.addEventListener('paint', () => {
        const pixel = new Uint8Array(4);
        gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        resolve([...pixel]);
      }, { once: true });
      canvas.requestPaint();
    }));
    assert.ok(pixel[0] > 230 && pixel[1] > 90 && pixel[1] < 110 && pixel[2] > 70 && pixel[2] < 90, `Expected the HTML background, received ${pixel}`);
    const changedPixel = await page.evaluate(() => new Promise(resolve => {
      const { canvas, gl } = window.effect;
      canvas.addEventListener('paint', () => {
        const pixel = new Uint8Array(4);
        gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        resolve([...pixel]);
      }, { once: true });
      document.querySelector('#scene').style.background = 'rgb(40, 180, 120)';
    }));
    assert.ok(changedPixel[0] < 50 && changedPixel[1] > 170 && changedPixel[2] > 110, `DOM changes must repaint: ${changedPixel}`);
    await page.getByRole('textbox', { name: 'Name' }).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Native input');
    assert.equal(await page.getByRole('textbox').inputValue(), 'Native input');
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Next control' }).evaluate(el => el === document.activeElement), true);
    await page.locator('#scene p').selectText();
    assert.equal(await page.evaluate(() => getSelection().toString()), 'Select this text.');
    await page.evaluate(() => window.effect.destroy());
    assert.equal(await page.locator('#scene').evaluate(el => el.parentElement.id), 'host');
    assert.equal(await page.locator('#scene').getAttribute('drawable'), null);
    assert.equal(await page.locator('#scene').getAttribute('style'), 'background: rgb(40, 180, 120);');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('native WebGPU HTML supports live form interaction and restores DOM on destroy', async () => {
  const page = await fixture();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.evaluate(async modulePath => {
      const { createFluidPrism } = await import(modulePath);
      window.effect = await createFluidPrism({ backend: 'webgpu', htmlSource: document.querySelector('#scene') });
    }, modulePath);
    await page.waitForFunction(() => window.effect.htmlSourceStatus === 'native', null, { timeout: 10000 });
    await page.getByRole('textbox', { name: 'Name' }).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('WebGPU input');
    assert.equal(await page.getByRole('textbox').inputValue(), 'WebGPU input');
    await page.evaluate(() => window.effect.destroy());
    assert.equal(await page.locator('#scene').evaluate(el => el.parentElement.id), 'host');
    assert.equal(await page.locator('#scene').getAttribute('drawable'), null);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('hovering HTML controls lets existing ripples decay and does not emit new ones', async () => {
  for (const backend of ['webgl', 'webgpu']) {
    const page = await fixture();
    try {
      await page.evaluate(async ({ modulePath, backend }) => {
        const { createFluidPrism } = await import(modulePath);
        const source = document.querySelector('#scene');
        source.style.cssText = 'background: repeating-linear-gradient(90deg, #111 0 8px, #eee 8px 16px); position: relative;';
        source.innerHTML = '<button style="position:absolute;left:50px;top:450px;width:1100px;height:150px;appearance:none;border:0;background:#ccc;outline:none">Control</button>';
        window.effect = await createFluidPrism({ backend, htmlSource: source, amount: 10, colorMultiplier: 0, pastelFilm: false, pushStrength: 0, curlStrength: 0 });
        await window.effect.ready;
        const output = document.createElement('canvas');
        output.width = window.effect.canvas.width;
        output.height = 400;
        const ctx = output.getContext('2d', { willReadFrequently: true });
        let baseline;
        window.ripplePixels = () => new Promise(resolve => {
          const canvas = window.effect.canvas;
          canvas.addEventListener('paint', () => {
            ctx.drawImage(canvas, 0, 0);
            const pixels = ctx.getImageData(0, 0, output.width, output.height).data;
            if (!baseline) baseline = pixels.slice();
            let changed = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              if (Math.max(Math.abs(pixels[i] - baseline[i]), Math.abs(pixels[i + 1] - baseline[i + 1]), Math.abs(pixels[i + 2] - baseline[i + 2])) > 12) changed++;
            }
            resolve(changed);
          }, { once: true });
          canvas.requestPaint();
        });
      }, { modulePath, backend });
      assert.equal(await page.evaluate(() => window.ripplePixels()), 0);
      for (let x = 100; x <= 850; x += 75) {
        await page.mouse.move(x, 250);
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      const moving = await page.evaluate(() => window.ripplePixels());
      assert.ok(moving > 200, `${backend}: pointer movement must produce visible ripples (${moving} pixels)`);
      await page.getByRole('button', { name: 'Control' }).hover();
      const hovering = await page.evaluate(() => window.ripplePixels());
      assert.ok(hovering > 100, `${backend}: existing ripples must remain when hovering a control (${hovering} pixels)`);
      await page.waitForTimeout(2500);
      const settled = await page.evaluate(() => window.ripplePixels());
      assert.ok(settled < hovering / 2, `${backend}: existing ripples must decay naturally (${hovering} -> ${settled})`);
      for (let x = 100; x <= 1000; x += 100) {
        await page.mouse.move(x, 460);
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      const suppressed = await page.evaluate(() => window.ripplePixels());
      assert.ok(suppressed < 100, `${backend}: moving within a control must not emit new ripples (${suppressed} pixels)`);
      for (let x = 850; x >= 100; x -= 75) {
        await page.mouse.move(x, 250);
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      assert.ok(await page.evaluate(() => window.ripplePixels()) > 200, `${backend}: leaving a control must resume new ripples`);
    } finally {
      await page.close();
    }
  }
});

test('HTML sources can be replaced and cleared, restoring placement and custom canvas attributes', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(async modulePath => {
      const { webgl } = await import(modulePath);
      const first = document.querySelector('#scene');
      const second = document.createElement('section');
      second.textContent = 'Second scene';
      second.style.cssText = 'min-width: 900px; min-height: 100vh;';
      const canvas = document.createElement('canvas');
      canvas.setAttribute('content', 'fallback');
      canvas.style.cssText = 'width: 480px; height: 320px; cursor: crosshair;';
      document.body.append(canvas);
      const effect = webgl.createFluidPrism({ canvas, fullscreen: false, htmlSource: first, autoStart: false });
      effect.update({ htmlSource: second });
      const firstRestored = first.parentElement.id === 'host' && first.nextElementSibling.id === 'after';
      const secondMounted = second.parentElement === canvas;
      canvas.style.width = '600px';
      effect.resize();
      const size = [second.offsetWidth, second.offsetHeight];
      effect.update({ htmlSource: undefined });
      const disabled = effect.htmlSourceStatus;
      const detachedRestored = second.parentNode === null;
      effect.destroy();
      effect.destroy();
      return { firstRestored, secondMounted, size, disabled, detachedRestored, content: canvas.getAttribute('content'), minHeight: second.style.minHeight };
    }, modulePath);
    assert.deepEqual(result, {
      firstRestored: true, secondMounted: true, size: [600, 320], disabled: 'disabled', detachedRestored: true, content: 'fallback', minHeight: '100vh',
    });
  } finally {
    await page.close();
  }
});

test('HTML falls back when WebGL is unavailable or its context is lost', async () => {
  const unavailable = await fixture();
  try {
    await unavailable.evaluate(async modulePath => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind === 'webgl' ? null : getContext.call(this, kind, ...args);
      };
      const { webgl } = await import(modulePath);
      window.effect = webgl.createFluidPrism({ htmlSource: document.querySelector('#scene') });
    }, modulePath);
    assert.equal(await unavailable.evaluate(() => window.effect.htmlSourceStatus), 'fallback');
    await unavailable.getByRole('textbox').fill('Without GPU');
    await unavailable.evaluate(() => window.effect.destroy());
  } finally {
    await unavailable.close();
  }

  const lost = await fixture();
  try {
    await lost.evaluate(async modulePath => {
      const { webgl } = await import(modulePath);
      window.effect = webgl.createFluidPrism({ htmlSource: document.querySelector('#scene') });
      window.effect.gl.getExtension('WEBGL_lose_context').loseContext();
    }, modulePath);
    await lost.waitForFunction(() => window.effect.htmlSourceStatus === 'fallback');
    await lost.getByRole('textbox').fill('After context loss');
    assert.equal(await lost.locator('#scene').evaluate(el => el.parentElement.id), 'host');
    const replacementStatus = await lost.evaluate(() => {
      const replacement = document.createElement('section');
      replacement.textContent = 'Replacement after loss';
      window.effect.update({ htmlSource: replacement });
      return { status: window.effect.htmlSourceStatus, visible: replacement.isConnected && replacement.parentElement !== window.effect.canvas };
    });
    assert.deepEqual(replacementStatus, { status: 'fallback', visible: true });
    await lost.evaluate(() => window.effect.destroy());
  } finally {
    await lost.close();
  }
});

test('raw playground served with a TypeScript MIME type explains how to start the demo', async () => {
  const page = await browser.newPage();
  try {
    const html = await readFile(new URL('../playground/index.html', import.meta.url), 'utf8');
    await page.route('**/raw-demo/', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.route('**/raw-demo/main.ts', route => route.fulfill({ contentType: 'video/mp2t', body: 'export {};' }));
    await page.goto(`${origin}/raw-demo/`);
    await page.locator('#startup-error').waitFor({ state: 'visible', timeout: 3000 });
    assert.match(await page.locator('#startup-error').textContent(), /pnpm dev/);
    assert.match(await page.locator('#startup-error').textContent(), /dist-playground/);
  } finally {
    await page.close();
  }
});

test('built playground runs on a plain static server at root and nested paths', async () => {
  await build({ logLevel: 'silent' });
  const staticServer = createHTTPServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const relative = pathname.replace(/^\/nested-demo\//, '/').slice(1) || 'index.html';
    if (relative.includes('..')) { res.writeHead(400).end(); return; }
    try {
      const contents = await readFile(resolve('dist-playground', relative));
      res.setHeader('Content-Type', relative.endsWith('.js') ? 'application/javascript' : 'text/html');
      res.end(contents);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const path of ['/', '/nested-demo/']) {
      await page.goto(`http://127.0.0.1:${staticServer.address().port}${path}`);
      await page.locator('#backend-status').waitFor({ timeout: 5000 });
      await page.getByText('WEBGL · Native HTML', { exact: false }).waitFor({ timeout: 5000 });
      assert.equal(await page.locator('#startup-error').isVisible(), false);
      await page.getByRole('textbox', { name: 'Your name' }).fill('Static server');
      assert.equal(await page.locator('#greeting').textContent(), 'Hello, Static server.');
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await new Promise(resolve => staticServer.close(resolve));
  }
});

test('demo visual controls update live, persist across scenes and reset on desktop and mobile', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${origin}/fluid-prism/`);
    await page.getByText('WEBGL · Native HTML', { exact: false }).waitFor();
    const panel = page.locator('#visual-settings');
    const amount = panel.getByRole('slider', { name: /折射强度/ });
    const dpr = panel.getByRole('slider', { name: /像素比上限/ });
    const film = panel.getByRole('switch', { name: /粉彩油膜/ });
    await page.getByRole('textbox', { name: 'Your name' }).fill('Keep my content');
    await page.evaluate(() => { window.originalDemoCanvas = document.querySelector('canvas'); });
    await amount.focus();
    await page.keyboard.press('End');
    assert.equal(await amount.inputValue(), '10');
    assert.equal(await amount.locator('..').locator('output').textContent(), '10');
    await film.uncheck();
    assert.equal(await film.isChecked(), false);
    await dpr.focus();
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('canvas').width === innerWidth * 0.5);
    assert.equal(await page.evaluate(() => document.querySelector('canvas') === window.originalDemoCanvas), true);
    assert.equal(await page.getByRole('textbox').inputValue(), 'Keep my content');
    await panel.evaluate(el => { el.scrollTop = 0; });
    await mkdir('.scratch/validation', { recursive: true });
    await page.locator('#backend-select').selectOption('webgpu');
    await page.getByText('WEBGPU · Native HTML', { exact: false }).waitFor();
    assert.equal(await amount.inputValue(), '10');
    assert.equal(await film.isChecked(), false);
    assert.equal(await page.locator('canvas').evaluate(el => el.width), 640);
    await page.locator('#scene-select').selectOption('canvas');
    await page.getByText('WEBGPU · 2D canvas', { exact: false }).waitFor();
    assert.equal(await amount.inputValue(), '10');
    assert.equal(await page.locator('canvas').evaluate(el => el.width), 640);
    await panel.getByRole('button', { name: '恢复默认' }).click();
    assert.equal(await amount.inputValue(), '3');
    assert.equal(await film.isChecked(), true);
    assert.equal(await dpr.inputValue(), '1.5');
    await page.waitForFunction(() => document.querySelector('canvas').width === innerWidth);
    await page.locator('#scene-select').selectOption('html');
    await page.getByText('WEBGPU · Native HTML', { exact: false }).waitFor();
    await panel.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: '.scratch/validation/settings-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.querySelector('#visual-settings').open);
    await panel.locator('summary').click();
    await amount.focus();
    await page.keyboard.press('End');
    assert.equal(await amount.inputValue(), '10');
    await panel.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: '.scratch/validation/settings-mobile.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('demo supports HTML input, selection, DOM updates and renderer switching', async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${origin}/fluid-prism/`);
    await page.getByText('Native HTML in Canvas.', { exact: false }).waitFor();
    await mkdir('.scratch/validation', { recursive: true });
    await page.screenshot({ path: '.scratch/validation/html-demo-desktop.png' });
    await page.getByRole('textbox', { name: 'Your name' }).fill('Ada');
    assert.equal(await page.locator('#greeting').textContent(), 'Hello, Ada.');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#greeting').textContent(), 'Saved: Ada.');
    await page.getByRole('button', { name: 'Add one' }).click();
    assert.equal(await page.locator('#counter').textContent(), '1');
    await page.locator('#selectable').selectText();
    assert.match(await page.evaluate(() => getSelection().toString()), /selectable HTML text/);
    await page.getByRole('button', { name: 'Update HTML title' }).click();
    assert.equal(await page.locator('[data-title]').textContent(), 'Live content. Same DOM.');
    await page.locator('#backend-select').selectOption('webgpu');
    await page.getByText('WEBGPU · Native HTML', { exact: false }).waitFor();
    await page.getByRole('textbox', { name: 'Your name' }).fill('Grace');
    assert.equal(await page.locator('#greeting').textContent(), 'Hello, Grace.');
    await page.getByRole('combobox', { name: 'Scene', exact: true }).selectOption('canvas');
    assert.equal(await page.locator('#html-scene').isVisible(), false);
    await page.getByRole('combobox', { name: 'Scene', exact: true }).selectOption('html');
    await page.getByText('WEBGPU · Native HTML', { exact: false }).waitFor();
    assert.equal(await page.getByRole('textbox').inputValue(), 'Grace');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox', { name: 'Your name' }).fill('Mobile');
    await page.getByRole('button', { name: 'Add one' }).click();
    assert.equal(await page.locator('#counter').textContent(), '2');
    await page.evaluate(() => { document.activeElement?.blur(); getSelection().removeAllRanges(); document.querySelector('#html-scene').scrollTop = 0; });
    await page.screenshot({ path: '.scratch/validation/html-demo-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
