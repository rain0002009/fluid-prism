import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createElement } from 'react';
import { renderToString as renderReact } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { compileScript, parse } from '@vue/compiler-sfc';
import { createServer } from 'vite';

const root = resolve('.scratch/validation/framework-docs');
let server;
let browser;
let origin;

before(async () => {
  const readme = await readFile('README.md', 'utf8');
  const snippets = section => [...readme.slice(readme.indexOf(section)).split('\n## ')[0].matchAll(/```(?:tsx|vue)\r?\n([\s\S]*?)```/g)].map(match => match[1]);
  const [reactWrapper, reactUsage] = snippets('## React 用法');
  const [vueWrapper, vueUsage] = snippets('## Vue 用法');
  const compileVue = (source, filename) => {
    const { descriptor, errors } = parse(source, { filename });
    assert.deepEqual(errors, []);
    return compileScript(descriptor, { id: filename, inlineTemplate: true }).content;
  };
  await mkdir(`${root}/components`, { recursive: true });
  await Promise.all([
    writeFile(`${root}/components/FluidPrism.tsx`, reactWrapper),
    writeFile(`${root}/ReactHero.tsx`, reactUsage),
    writeFile(`${root}/components/FluidPrism.vue.ts`, compileVue(vueWrapper, 'FluidPrism.vue')),
    writeFile(`${root}/VueHero.ts`, compileVue(vueUsage, 'Hero.vue').replace('./components/FluidPrism.vue', './components/FluidPrism.vue.ts')),
    writeFile(`${root}/react.html`, '<div id="app"></div><script type="module" src="/react.tsx"></script>'),
    writeFile(`${root}/vue.html`, '<div id="app"></div><script type="module" src="/vue.ts"></script>'),
    writeFile(`${root}/react.tsx`, `
      import { StrictMode, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { FluidPrismView } from './components/FluidPrism';
      import { Hero } from './ReactHero';
      function App() {
        const [backend, setBackend] = useState(location.search.includes('webgpu') ? 'webgpu' : 'webgl');
        const [options, setOptions] = useState({ dpr: 0.5 });
        const [visible, setVisible] = useState(true);
        const [name, setName] = useState('Prism');
        return <>
          <button onClick={() => setBackend('webgpu')}>Switch backend</button>
          <button onClick={() => setOptions({})}>Reset precision</button>
          <button onClick={() => setVisible(false)}>Unmount</button>
          {visible && <FluidPrismView backend={backend} options={options} style={{ width: 480, height: 320, background: 'rgb(240, 100, 80)' }}>
            <h1>Hello, {name}</h1>
            <label>Name <input value={name} onChange={e => setName(e.target.value)} /></label>
            {name !== 'Prism' && <button onClick={() => setName('Prism')}>Reset name</button>}
            <p>Select this text.</p>
          </FluidPrismView>}
        </>;
      }
      createRoot(document.getElementById('app')).render(<StrictMode>{location.search.includes('usage') ? <Hero /> : <App />}</StrictMode>);
    `),
    writeFile(`${root}/vue.ts`, `
      import { createApp, h, ref } from 'vue';
      import FluidPrism from './components/FluidPrism.vue.ts';
      import Hero from './VueHero';
      const App = { setup() {
        const backend = ref(location.search.includes('webgpu') ? 'webgpu' : 'webgl');
        const options = ref({ dpr: 0.5 });
        const visible = ref(true);
        const name = ref('Prism');
        return () => [
          h('button', { onClick: () => backend.value = 'webgpu' }, 'Switch backend'),
          h('button', { onClick: () => options.value = {} }, 'Reset precision'),
          h('button', { onClick: () => visible.value = false }, 'Unmount'),
          visible.value && h(FluidPrism, { backend: backend.value, options: options.value, style: { width: '480px', height: '320px', background: 'rgb(240, 100, 80)' } }, {
            default: () => [
              h('h1', 'Hello, ' + name.value),
              h('label', ['Name ', h('input', { value: name.value, onInput: e => name.value = e.target.value })]),
              name.value !== 'Prism' && h('button', { onClick: () => name.value = 'Prism' }, 'Reset name'),
              h('p', 'Select this text.'),
            ],
          }),
        ];
      }};
      createApp(location.search.includes('usage') ? Hero : App).mount('#app');
    `),
  ]);
  server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { 'fluid-prism': resolve('src/index.ts') } },
    esbuild: { jsx: 'automatic' },
    define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, args: ['--enable-unsafe-webgpu'] });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

for (const framework of ['react', 'vue']) {
  test(`${framework} README wrapper renders HTML on the server without browser globals`, async () => {
    let html;
    if (framework === 'react') {
      const { FluidPrismView } = await server.ssrLoadModule('/components/FluidPrism.tsx');
      html = renderReact(createElement(FluidPrismView, null, createElement('p', null, 'Server content')));
    } else {
      const { default: FluidPrism } = await server.ssrLoadModule('/components/FluidPrism.vue.ts');
      html = await renderVue(createSSRApp({ render: () => h(FluidPrism, null, { default: () => h('p', 'Server content') }) }));
    }
    assert.match(html, /<p>Server content<\/p>/);
    assert.doesNotMatch(html, /<canvas/);
  });

  for (const native of [true, false]) {
    test(`${framework} README wrapper preserves live content, options and cleanup (${native ? 'native' : 'fallback'})`, async () => {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (!native) await page.addInitScript(() => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'requestPaint', { value: undefined, configurable: true });
      });
      try {
        await page.goto(`${origin}/${framework}.html`);
        const canvas = page.locator('canvas');
        await page.waitForFunction(() => document.querySelector('canvas')?.width === 240);
        if (native) {
          const pixel = await canvas.evaluate(canvas => new Promise(resolve => {
            canvas.addEventListener('paint', () => {
              const gl = canvas.getContext('webgl');
              const pixel = new Uint8Array(4);
              gl.readPixels(canvas.width / 2, canvas.height - 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
              resolve([...pixel]);
            }, { once: true });
            canvas.requestPaint();
          }));
          assert.ok(pixel[0] > 230 && pixel[1] > 90 && pixel[1] < 110 && pixel[2] > 70 && pixel[2] < 90, `Container background must appear in the HTML texture: ${pixel}`);
        } else {
          assert.equal(await page.locator('h1').evaluate(el => getComputedStyle(el.parentElement).backgroundColor), 'rgb(240, 100, 80)');
        }
        await page.evaluate(() => { window.originalInput = document.querySelector('input'); window.originalCanvas = document.querySelector('canvas'); });
        await page.getByRole('textbox', { name: 'Name' }).fill('Ada');
        assert.equal(await page.locator('h1').textContent(), 'Hello, Ada');
        await page.keyboard.press('Tab');
        assert.equal(await page.getByRole('button', { name: 'Reset name' }).evaluate(el => el === document.activeElement), true);
        await page.locator('p').selectText();
        assert.equal(await page.evaluate(() => getSelection().toString()), 'Select this text.');
        await page.getByRole('button', { name: 'Reset precision' }).click();
        await page.waitForFunction(() => document.querySelector('canvas').width === 480);
        assert.equal(await canvas.evaluate(el => el === window.originalCanvas), true);
        assert.equal(await canvas.evaluate(el => getComputedStyle(el).position), 'absolute');
        await page.getByRole('button', { name: 'Switch backend' }).click();
        await page.waitForFunction(() => document.querySelector('canvas') !== window.originalCanvas);
        if (native) await page.waitForFunction(() => document.querySelector('input').closest('canvas')?.getAttribute('content') === 'drawable');
        else assert.equal(await canvas.evaluate(el => getComputedStyle(el).visibility), 'hidden');
        assert.equal(await page.getByRole('textbox').evaluate(el => el === window.originalInput), true);
        assert.equal(await page.getByRole('textbox').inputValue(), 'Ada');
        await page.getByRole('button', { name: 'Reset name' }).click();
        assert.equal(await page.locator('h1').textContent(), 'Hello, Prism');
        assert.equal(await page.getByRole('button', { name: 'Reset name' }).count(), 0);
        await page.getByRole('button', { name: 'Unmount' }).click();
        assert.equal(await canvas.count(), 0);
        assert.equal(await page.getByRole('textbox').count(), 0);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  }

  test(`${framework} README page example updates the HTML scene`, async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${origin}/${framework}.html?usage`);
      await page.getByRole('textbox', { name: 'Name' }).fill('Example');
      assert.equal(await page.locator('h1').textContent(), 'Hello, Example');
      await page.getByRole('button', { name: 'Reset name' }).click();
      assert.equal(await page.locator('h1').textContent(), 'Hello, Prism');
      await page.getByRole('slider').fill('6');
      assert.equal(await page.getByRole('slider').inputValue(), '6');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });

  test(`${framework} README wrapper can unmount while WebGPU is initializing`, async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
      navigator.gpu.requestAdapter = async (...args) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return requestAdapter(...args);
      };
    });
    try {
      await page.goto(`${origin}/${framework}.html?webgpu`);
      await page.locator('canvas').waitFor({ state: 'attached' });
      await page.getByRole('button', { name: 'Unmount' }).click();
      await page.waitForTimeout(800);
      assert.equal(await page.locator('canvas, input').count(), 0);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}
