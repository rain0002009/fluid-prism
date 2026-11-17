# fluid-prism

[![npm version](https://img.shields.io/npm/v/fluid-prism.svg)](https://www.npmjs.com/package/fluid-prism)
[![npm downloads](https://img.shields.io/npm/dm/fluid-prism.svg)](https://www.npmjs.com/package/fluid-prism)
[![npm package size](https://img.shields.io/bundlephobia/minzip/fluid-prism)](https://bundlephobia.com/package/fluid-prism)
[![jsDelivr hits](https://img.shields.io/jsdelivr/npm/hm/fluid-prism)](https://www.jsdelivr.com/package/npm/fluid-prism)
[![TypeScript](https://img.shields.io/badge/TypeScript-included-3178C6?logo=typescript&logoColor=white)](https://www.npmjs.com/package/fluid-prism)
[![GitHub Pages](https://img.shields.io/badge/demo-live-0a7ea4)](https://rain0002009.github.io/fluid-prism/)
[![renderers](https://img.shields.io/badge/renderers-WebGL%20%7C%20WebGPU-111111)](https://rain0002009.github.io/fluid-prism/)
[![license](https://img.shields.io/npm/l/fluid-prism.svg)](./LICENSE)

一个面向现代 Web 应用的轻量级鼠标驱动流体折射效果，支持 WebGL，并提供可选的 WebGPU 后端。

它会渲染一个全屏 canvas，将鼠标光标速度存入 ping-pong 绘制缓冲区，再经过低分辨率反馈纹理处理，最后对场景纹理施加细微的位移与色散干涉效果。默认使用 WebGL；如果你显式选择 WebGPU，并且当前浏览器支持，也可以切换到 WebGPU 后端。

## 特性

- 默认基于 WebGL 1，无运行时依赖，并支持可选 WebGPU 后端
- 内置 TypeScript 类型定义
- 平滑的鼠标驱动液体 / 波纹扭曲效果
- 带有色散感的油膜风格折射
- 可用于原生 JavaScript、React、Vue 及其他框架
- 支持图片 / canvas / 视频作为输入源，也支持自定义 2D canvas 渲染器
- 支持原生 HTML-in-Canvas，保留表单输入、文字选择与键盘操作；能力不足时显示普通 HTML
- 支持由用户自由选择 WebGL 或 WebGPU 渲染后端

## 安装

```bash
pnpm add fluid-prism
```

## 基础用法

```ts
import { createFluidPrism } from 'fluid-prism';

async function main() {
  const effect = await createFluidPrism({
    backgroundColor: '#f4f1ec',
    backend: 'webgl',
  });

  // later
  // effect.destroy();
}

main();
```

默认情况下，它会创建一个固定定位的全屏 canvas，并将其挂载到 `document.body`。

如果你想显式启用 WebGPU，可以这样写：

```ts
async function main() {
  await createFluidPrism({
    backend: 'webgpu',
    backgroundColor: '#f4f1ec',
  });
}

main();
```

> 注意：`backend: 'webgpu'` 不会自动回退到 WebGL。如果当前环境不支持 WebGPU，会抛出明确错误，便于你自行决定回退策略。

## 按后端显式导入

如果你希望在应用代码里明确只使用某一个后端，并让打包器更容易只保留对应代码，可以直接从根入口导入命名导出：

```ts
import { webgl, webgpu } from 'fluid-prism';

const glEffect = webgl.createFluidPrism({
  backgroundColor: '#f4f1ec',
});

const gpuEffect = webgpu.createFluidPrism({
  backgroundColor: '#f4f1ec',
});
```

也可以使用对应的类或专用创建函数：

```ts
import {
  WebGLFluidPrism,
  WebGPUFluidPrism,
  createWebGLFluidPrism,
  createWebGPUFluidPrism,
} from 'fluid-prism';
```

这样做的好处是你的业务代码可以明确选择某个后端，而不是依赖运行时 `backend` 分支。

> Tree-shaking 说明：如果你使用 `webgl.createFluidPrism(...)` 或 `webgpu.createFluidPrism(...)` 这类显式导出，主入口不会为了运行时分支去静态绑定另一个后端，打包器更容易只保留你真正使用的那一侧代码。相对地，通用 `createFluidPrism(...)` 现在是一个异步入口，用于在运行时根据 `backend` 动态加载对应后端。

### 体积优化最佳实践

如果你明确知道项目里只会使用一个后端，推荐优先使用根入口的显式命名导出，而不是通用异步入口：

```ts
import { webgl } from 'fluid-prism';

const effect = webgl.createFluidPrism({
  backgroundColor: '#f4f1ec',
});
```

或：

```ts
import { webgpu } from 'fluid-prism';

const effect = webgpu.createFluidPrism({
  backgroundColor: '#f4f1ec',
});
```

这种写法的好处是：你的应用代码会明确依赖某一个后端模块，打包器更容易在最终产物里只保留那一侧代码。

如果你使用的是：

```ts
await createFluidPrism({ backend: 'webgl' });
```

那么它更偏向“运行时按后端动态加载”的模型。这样做依然可以避免同步主入口一次性把两个后端都初始化进来，但在静态 tree-shaking 的确定性上，不如显式 `webgl` / `webgpu` 导入直接。

## 使用自定义场景渲染器

`fluid-prism` 的本质是对一张纹理进行扭曲。想获得更清晰、更稳定的效果，最可靠的方式是把你的视觉内容绘制到内部的 2D canvas 上：

```ts
import { createFluidPrism } from 'fluid-prism';

async function main() {
  await createFluidPrism({
    contentRenderer(ctx, { width, height }) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#f3f4fb');
      gradient.addColorStop(1, '#f6f0f0');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#050505';
      ctx.font = `900 ${Math.max(96, width * 0.15)}px Inter, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('Fluid prism', width * 0.08, height * 0.5);
    },
  });
}

main();
```

## 使用图片、canvas 或视频作为输入源

```ts
import { createFluidPrism } from 'fluid-prism';

const image = new Image();
image.crossOrigin = 'anonymous';
image.src = '/hero-texture.png';

image.onload = async () => {
  await createFluidPrism({
    source: image,
    amount: 3,
    multiplier: 5,
  });
};
```

## 使用真实 HTML 场景

传入已有元素的 `htmlSource`，让浏览器直接把 HTML 和 CSS 绘制到场景纹理中。它使用原生 HTML-in-Canvas，无截图依赖；WebGL 和 WebGPU 都支持。

```html
<section id="hero" style="background: #f4f1ec; padding: 48px; overflow: auto;">
  <h1>Real HTML. Liquid light.</h1>
  <label for="name">Your name</label>
  <input id="name" value="Prism" />
  <p>这段文字仍然可以选择、复制。</p>
</section>
```

```ts
import { createFluidPrism } from 'fluid-prism';

const hero = document.querySelector<HTMLElement>('#hero')!;
const effect = await createFluidPrism({
  htmlSource: hero,
  backend: 'webgl', // 也可选择 'webgpu'
});
await effect.ready;

console.log(effect.htmlSourceStatus); // 'native' | 'fallback' | 'disabled'
hero.querySelector('h1')!.textContent = 'Live content'; // 自动重绘

// 可替换、清除 HTML 输入；切换前清除其他输入选项。
// effect.update({ htmlSource: anotherElement });
// effect.update({ htmlSource: undefined });
// effect.destroy(); // 恢复元素原来的位置、drawable 属性及受管理的布局样式
```

`htmlSource` 与 `source`、`contentRenderer` 互斥。场景根元素会临时移入输出 canvas，宽高按 canvas 的 CSS 尺寸设置，GPU 纹理按 DPR 绘制；给根元素设置背景色，以及适合容器的响应式样式。非全屏场景请使用已有且有明确 CSS 宽高的 canvas，并设置 `fullscreen: false`。容器变化会通过 ResizeObserver 自动同步。

### 交互与降级

- 表单、链接、Tab 导航和选区沿用真实 DOM。悬停交互控件、按下指针、元素获得焦点或场景内存在文字选区时，只停止产生新波纹；已有波纹继续运动并自然消散，画面不会突然切回原图。离开控件、焦点和选区都结束后恢复新波纹。可用 `[tabindex]` 或 `[role="button"]` 标记自定义交互控件。
- 浏览器的 `updateElementGeometry()` 描述几何矩阵，无法逐像素表示流体 shader 的局部扭曲。交互命中沿用未扭曲的 DOM 位置，残留波纹消散前可能与视觉位置存在差异；拖选从指针按下时停止产生新波纹。
- 原生能力已在 Chrome 157 发布，其他浏览器及不同 GPU 后端可能尚不支持。本库按所选后端的方法和 canvas 能力检测；不支持或 HTML 上传失败时，隐藏效果 canvas，保留普通 HTML 的输入与选择。`htmlSourceStatus` 可用于展示状态。原生模式下根节点必须是单一 drawable 子树，不支持额外的嵌套 `[drawable]`。
- `stop()` 停止连续流体动画；原生 DOM 变化仍会通过 `paint` 重绘，保证输入内容可见。`start()` 恢复动画。`autoStart: false` 同样会绘制初始 HTML 和后续 DOM 更新。
- 不保证跨域图片、iframe、受保护媒体等内容进入纹理；这不是完整页面截图功能。原生模式会改变 DOM 父级，依赖父选择器、继承样式或表单祖先关系的场景，应将所需样式和表单一起放进 `htmlSource`。React/Vue 中建议提供由组件持有的独立场景根节点，并在组件卸载前 `destroy()`。

显式后端创建函数也接受 `htmlSource`；WebGPU 初始化是异步的，使用 `await effect.ready` 等待后端初始化及能力判断。通用 `createFluidPrism()` 的返回 Promise 表示实例已创建，`ready` 表示后端已完成初始化。

本地运行 `pnpm dev` 打开 demo，选择 **HTML in Canvas**，体验输入、保存、计数、选择文字、动态标题及两个后端切换。浏览器无原生能力时会显示降级提示。

官方资料：[HTML-in-Canvas 概览](https://developer.chrome.com/blog/html-in-canvas)、[几何与兼容策略](https://developer.chrome.com/docs/web-platform/html-in-canvas/concepts)。

## React 用法

```tsx
import { useEffect, useRef } from 'react';
import { createFluidPrism, type FluidPrism } from 'fluid-prism';

export function Hero() {
  const hostRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<FluidPrism | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    let disposed = false;

    void createFluidPrism({
      container: hostRef.current,
      fullscreen: true,
      zIndex: 0,
      contentRenderer(ctx, { width, height }) {
        ctx.fillStyle = '#f4f1ec';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#050505';
        ctx.font = `900 ${Math.max(88, width * 0.14)}px Inter, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText('Fluid prism', width * 0.08, height * 0.5);
      },
    }).then((effect) => {
      if (disposed) {
        effect.destroy();
        return;
      }
      effectRef.current = effect;
    });

    return () => {
      disposed = true;
      effectRef.current?.destroy();
    };
  }, []);

  return (
    <section ref={hostRef} style={{ position: 'relative', minHeight: '100vh' }}>
      {/* 如有需要，可将普通 DOM 内容放在 canvas 上层。 */}
      <div style={{ position: 'relative', zIndex: 2, pointerEvents: 'none' }}>
        <h1>Fluid prism</h1>
      </div>
    </section>
  );
}
```

### React 中使用你自己的 canvas

```tsx
import { useEffect, useRef } from 'react';
import { createFluidPrism } from 'fluid-prism';

export function CanvasEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let disposed = false;
    let effect: Awaited<ReturnType<typeof createFluidPrism>> | null = null;

    void createFluidPrism({
      canvas: canvasRef.current,
      fullscreen: false,
      backgroundColor: '#f4f1ec',
    }).then((instance) => {
      if (disposed) {
        instance.destroy();
        return;
      }
      effect = instance;
    });

    return () => {
      disposed = true;
      effect?.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: 800, height: 500 }} />;
}
```

## Vue 用法

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { createFluidPrism, type FluidPrism } from 'fluid-prism';

const hostRef = ref<HTMLElement | null>(null);
let effect: FluidPrism | null = null;

onMounted(() => {
  if (!hostRef.value) return;

  void createFluidPrism({
    container: hostRef.value,
    fullscreen: true,
    zIndex: 0,
    contentRenderer(ctx, { width, height }) {
      ctx.fillStyle = '#f4f1ec';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#050505';
      ctx.font = `900 ${Math.max(88, width * 0.14)}px Inter, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('Fluid prism', width * 0.08, height * 0.5);
    },
  }).then((instance) => {
    effect = instance;
  });
});

onBeforeUnmount(() => {
  effect?.destroy();
  effect = null;
});
</script>

<template>
  <section ref="hostRef" class="hero">
    <div class="content">
      <h1>Fluid prism</h1>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: 100vh;
}
.content {
  position: relative;
  z-index: 2;
  pointer-events: none;
}
</style>
```

### Vue 中使用你自己的 canvas

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { createFluidPrism, type FluidPrism } from 'fluid-prism';

const canvasRef = ref<HTMLCanvasElement | null>(null);
let effect: FluidPrism | null = null;

onMounted(() => {
  if (!canvasRef.value) return;
  void createFluidPrism({
    canvas: canvasRef.value,
    fullscreen: false,
    backgroundColor: '#f4f1ec',
  }).then((instance) => {
    effect = instance;
  });
});

onBeforeUnmount(() => effect?.destroy());
</script>

<template>
  <canvas ref="canvasRef" class="effect" />
</template>

<style scoped>
.effect {
  width: 800px;
  height: 500px;
}
</style>
```

## 配置项

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `container` | `HTMLElement` | `document.body` | 自动创建的 canvas 的父容器。 |
| `canvas` | `HTMLCanvasElement` | 自动创建 | 使用你自己的 canvas。 |
| `backend` | `'webgl' \| 'webgpu'` | `'webgl'` | 选择渲染后端。`webgpu` 需要浏览器支持 WebGPU。 |
| `source` | `HTMLImageElement \| HTMLCanvasElement \| HTMLVideoElement` | - | 用于扭曲的纹理源。 |
| `htmlSource` | `HTMLElement` | - | 真实 HTML 场景；与 `source`、`contentRenderer` 互斥，能力不足时保留普通 DOM。 |
| `contentRenderer` | function | - | 将场景绘制到内部 2D canvas 的函数。 |
| `fullscreen` | `boolean` | `true` | 让 canvas 以固定定位全屏显示。 |
| `dpr` | `number` | `1.5` | 最大设备像素比。 |
| `paintScale` | `number` | `0.25` | 绘制缓冲区缩放比例。 |
| `lowScale` | `number` | `0.125` | 低分辨率反馈缓冲区缩放比例。 |
| `amount` | `number` | `3` | 位移强度。 |
| `rgbShift` | `number` | `0.5` | RGB 干涉相位。 |
| `multiplier` | `number` | `5` | 位移乘数。 |
| `colorMultiplier` | `number` | `10` | 油膜色彩强度。 |
| `shade` | `number` | `1.25` | 整体颜色明暗系数。 |
| `pushStrength` | `number` | `25` | 反馈推动强度。 |
| `velocityDissipation` | `number` | `0.975` | 速度衰减。 |
| `weight1Dissipation` | `number` | `0.955` | 新鲜波纹衰减。 |
| `weight2Dissipation` | `number` | `0.86` | 长尾拖影衰减。 |
| `curlScale` | `number` | `0.02` | Curl 噪声缩放。 |
| `curlStrength` | `number` | `3` | Curl 噪声强度。 |
| `pastelFilm` | `boolean` | `true` | 在浅色背景上添加轻微粉彩膜效果。 |
| `backgroundColor` | `string` | `#f4f1ec` | 场景兜底背景色。 |
| `autoStart` | `boolean` | `true` | 自动启动渲染循环。 |
| `hideCursor` | `boolean` | `false` | 在 canvas 上将鼠标光标设为 none。 |
| `zIndex` | `number \| string` | `0` | 全屏模式下 canvas 的 z-index。 |

## API

```ts
const effect = await createFluidPrism(options);
await effect.ready;

effect.htmlSourceStatus; // 'disabled' | 'native' | 'fallback'
effect.start();
effect.stop();
effect.update({ amount: 2.4 });
effect.resize();
effect.destroy();
```

## 说明

- 这个效果主要面向 hero 区域和视觉型落地页设计。
- 使用 `htmlSource` 接入真实 HTML；图片、canvas、视频及自定义绘图仍可使用 `source` 或 `contentRenderer`。
- 纹理中建议保留高对比文字或图形，这样折射效果会更明显。
- `webgpu` 后端目前以兼容现有视觉语言为目标，适合作为现代浏览器中的可选渲染路径。

## 开发验证

### 启动 playground

在项目根目录运行 Vite 开发服务器，它会把 TypeScript 编译为浏览器可执行的 JavaScript：

```bash
pnpm install
pnpm dev
```

打开终端显示的地址（默认 `http://localhost:5173/fluid-prism/`）。

使用 `serve` 等普通静态服务器时，先构建，再托管生成的 `dist-playground` 目录：

```bash
pnpm build:playground
serve dist-playground
```

`playground` 是包含 TypeScript 的源码目录。直接运行 `serve playground` 会原样返回 `main.ts`，可能以 `video/mp2t` 响应，导致浏览器拒绝执行模块。构建产物使用相对资源路径，可部署到站点根目录或子目录。

### 检查与测试

```bash
pnpm install
pnpm exec playwright install chromium
pnpm typecheck
pnpm test
pnpm build
pnpm build:playground
```

原生交互测试需要支持 HTML-in-Canvas 的浏览器。使用已安装的 Chrome 157+ 时，设置 `PLAYWRIGHT_CHANNEL=chrome` 再运行测试（PowerShell：`$env:PLAYWRIGHT_CHANNEL='chrome'; pnpm test`）。测试覆盖公共创建接口、原生绘制和动态更新、输入/选区/键盘、销毁恢复、DOM 降级及 demo 切换。
