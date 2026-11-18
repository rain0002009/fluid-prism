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

快速入口：[HTML in Canvas 用法](#html-in-canvas) · [React](#react-用法) · [Vue](#vue-用法) · [配置项](#配置项) · [运行 playground](#启动-playground)

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

<a id="html-in-canvas"></a>

## HTML in Canvas 用法

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

## React 用法

参考 [canvas-ui 的 Liquid.tsx](https://github.com/DavidHDev/canvas-ui/blob/main/src/lib/Liquid/Liquid.tsx) 的组件接口：通过 `children` 组合内容，效果参数直接作为 props，`className` / `style` 控制容器。将下面的 `FluidPrism.tsx` 复制到项目，从本地路径导入；npm 包提供框架无关的核心。

canvas 由 React 声明，effect 负责创建、更新和销毁实例。容器需要明确高度；初始化在客户端执行，服务端输出普通 HTML 内容。

```tsx
'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createFluidPrism, type FluidPrism as FluidPrismInstance, type FluidPrismOptions } from 'fluid-prism';

type EffectProps = Omit<FluidPrismOptions,
  'container' | 'canvas' | 'htmlSource' | 'source' | 'contentRenderer' |
  'fullscreen' | 'autoStart' | 'zIndex' | 'hideCursor' | 'backgroundColor'>;

export interface FluidPrismProps extends EffectProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function FluidPrism({ children, className, style, backend = 'webgl', ...options }: FluidPrismProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<FluidPrismInstance | null>(null);
  const optionsRef = useRef<EffectProps>({});
  const pendingRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const canvas = canvasRef.current;
    const content = contentRef.current;
    if (!canvas || !content) return;

    let disposed = false;
    // 串行创建，确保旧异步任务清理后再接管同一棵内容 DOM。
    pendingRef.current = pendingRef.current.then(async () => {
      if (disposed) return;
      const instance = await createFluidPrism({ backend, canvas, htmlSource: content, fullscreen: false });
      if (disposed) {
        instance.destroy();
        return;
      }
      instance.update(optionsRef.current);
      instanceRef.current = instance;
    }).catch(console.error);

    return () => {
      disposed = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [backend]);

  useEffect(() => {
    const reset = Object.fromEntries(Object.keys(optionsRef.current).map(key => [key, undefined]));
    optionsRef.current = { ...reset, ...options };
    instanceRef.current?.update(optionsRef.current);
  });

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <div ref={contentRef} style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', overflow: 'auto', background: 'inherit' }}>
        {children}
      </div>
      <canvas
        key={backend}
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: options.overlay ? 'transparent' : 'inherit', zIndex: options.overlay ? 2 : 0, pointerEvents: 'none' }}
      />
    </div>
  );
}

export default FluidPrism;
```

在页面中使用；可以将原生按钮、输入框替换为项目自己的 shadcn `Button`、`Input`。通过 Portal 渲染到场景根节点之外的弹层不会参与折射。

```tsx
'use client';

import { useState } from 'react';
import FluidPrism from './components/FluidPrism';

export function Hero() {
  const [amount, setAmount] = useState(3);
  const [name, setName] = useState('Prism');

  return (
    <>
      <label>画面扭曲强度 <input type="range" min="0" max="10" step="0.1"
        value={amount} onChange={event => setAmount(Number(event.target.value))} /></label>
      <FluidPrism amount={amount} pastelFilm style={{ height: 480, background: '#f4f1ec' }}>
        <section style={{ padding: 32 }}>
          <h1>Hello, {name}</h1>
          <label>Name <input value={name} onChange={event => setName(event.target.value)} /></label>
          <button onClick={() => setName('Prism')}>Reset name</button>
          <p>这段文字可以选择和复制。</p>
        </section>
      </FluidPrism>
    </>
  );
}
```

## Vue 用法

参考 [canvas-ui 的 Liquid.vue](https://github.com/DavidHDev/canvas-ui/blob/main/src/lib/Liquid/Liquid.vue)，把下面的 `FluidPrism.vue` 复制到项目，通过默认 slot 组合内容，效果参数直接作为 props。`class` / `style` 自动透传到外层容器；template 声明 canvas，生命周期负责管理实例。

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createFluidPrism, type FluidPrism as FluidPrismInstance, type FluidPrismOptions } from 'fluid-prism';

type EffectProps = Omit<FluidPrismOptions,
  'container' | 'canvas' | 'htmlSource' | 'source' | 'contentRenderer' |
  'fullscreen' | 'autoStart' | 'zIndex' | 'hideCursor' | 'backgroundColor'>;

const props = withDefaults(defineProps<EffectProps>(), {
  backend: 'webgl',
  autoSleep: undefined,
  respectReducedMotion: undefined,
  rainbow: undefined,
  pastelFilm: undefined, // 缺省时沿用核心默认值，避免 Vue 将 Boolean prop 转成 false。
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const contentRef = ref<HTMLDivElement | null>(null);
let instance: FluidPrismInstance | null = null;
let pending: Promise<void> = Promise.resolve();
let generation = 0;

function dispose() {
  generation++;
  instance?.destroy();
  instance = null;
}

function mount() {
  dispose();
  const canvas = canvasRef.value;
  const content = contentRef.value;
  const backend = props.backend;
  const current = generation;
  if (!canvas || !content) return;
  pending = pending.then(async () => {
    if (current !== generation) return;
    const next = await createFluidPrism({ backend, canvas, htmlSource: content, fullscreen: false });
    if (current !== generation) {
      next.destroy();
      return;
    }
    next.update({ ...props });
    instance = next;
  }).catch(console.error);
}

onMounted(mount);
onBeforeUnmount(dispose);
watch(() => props.backend, mount, { flush: 'post' });
watch(() => ({ ...props }), options => instance?.update(options), { flush: 'post' });
</script>

<template>
  <div style="position: relative">
    <div ref="contentRef" style="position: relative; z-index: 1; width: 100%; height: 100%; overflow: auto; background: inherit">
      <slot />
    </div>
    <canvas
      :key="props.backend"
      ref="canvasRef"
      :style="{ background: props.overlay ? 'transparent' : 'inherit', zIndex: props.overlay ? 2 : 0 }"
      style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none"
    />
  </div>
</template>
```

页面示例：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import FluidPrism from './components/FluidPrism.vue';

const name = ref('Prism');
const amount = ref(3);
</script>

<template>
  <label>画面扭曲强度 <input v-model.number="amount" type="range" min="0" max="10" step="0.1" /></label>
  <FluidPrism :amount="amount" pastel-film style="height: 480px; background: #f4f1ec">
    <section style="padding: 32px">
      <h1>Hello, {{ name }}</h1>
      <label>Name <input v-model="name" /></label>
      <button @click="name = 'Prism'">Reset name</button>
      <p>这段文字可以选择和复制。</p>
    </section>
  </FluidPrism>
</template>
```

两个封装统一调用 `await createFluidPrism({ backend, ... })`，由核心选择后端。效果 props 支持直接更新或移除，移除时恢复核心默认值；普通参数更新复用实例，`backend` 变化通过 canvas 的 `key` 更换上下文并重建实例。

清理逻辑同步注册，异步创建串行执行：已卸载或已切换后端的任务会销毁迟到的实例，再开始下一次创建，避免争用内容 DOM。实例接管时应用最新 props，支持 React StrictMode、初始化期间参数变化及快速卸载。WebGPU 后端自身的初始化由实例的 `ready` 表示。

这里沿用 Liquid 的组件接口和生命周期组织，渲染结构适配本项目的 `htmlSource` API：核心负责原生能力检测、场景移动和 DOM 降级，使用一个输出 canvas。`children` / slot 保留同一棵 DOM，切换后端保留表单值；焦点与选区可能因 DOM 移动而结束。

请给容器设置不透明背景色；`background: inherit` 将背景传给 canvas 和场景根节点，确保背景进入纹理。原生模式会临时将场景移入 canvas，把继承样式放到外层容器，把依赖表单祖先或父选择器的内容放进场景子树。表单、选区和键盘行为遵循上文的交互策略。

## 输入、休眠与透明叠加

两个后端共用输入和调度逻辑，参考 [LiquidVanilla](https://github.com/DavidHDev/canvas-ui/blob/main/src/lib/Liquid/LiquidVanilla.ts) 的队列、可见性及减少动态效果处理，保留本项目的反馈式折射算法。

- 默认启用 `autoSleep`：静态场景在波纹衰减后停止 RAF，指针、`splat()`、参数更新及原生 HTML 的 `paint` 会唤醒。canvas、视频和 `contentRenderer` 持续更新内容；`autoSleep: false` 保持连续模拟。任一衰减值设为 `1` 时，已产生的波纹不会按超时休眠。
- 页面进入后台或 canvas 离开视口时暂停，恢复可见后继续；暂停时间不计入模拟。`stop()` 保持手动停止状态，`start()` 恢复；停止期间原生 HTML 仍可重绘。
- 默认尊重 `prefers-reduced-motion`，不接受新扰动，已有波纹自然衰减。确有需要时可设置 `respectReducedMotion: false`。
- 支持多指输入，仅接收 canvas 边界内的指针；`radius: 'auto'` 默认沿用原版随速度变化的笔触宽度，数字值则表示固定 CSS 像素半径，`force` 控制冲量。任一设为 `0` 时禁用新扰动。HTML 控件、焦点及选区交互期间忽略新注入，已有波纹继续衰减。
- 衰减参数表示每个模拟步保留的比例；高刷新率下将模拟限制在约 60 次/秒，低于 60fps 时每帧沿用原版的一步衰减，不因帧间隔变长而加速消散。自动休眠等待足够的模拟步完成后才停止。DPR 同时受设备、页面缩放、GPU 纹理尺寸和每张缓冲区约 1600 万像素预算限制。

程序注入波纹：

```ts
const effect = await createFluidPrism({ radius: 32, force: 1.2 });
effect.splat(0.5, 0.5, 60, -30);
```

`x/y` 是 `[0, 1]` 的归一化位置，原点在左上角；`dx/dy` 是 CSS 像素冲量，向右、向下为正。非法坐标或非有限数值会抛出 `RangeError`。队列最多保留最近 64 次注入，每帧最多处理 8 个输入，API 输入预留至少一个名额。初始化、手动停止及不可见期间可以排队，恢复后处理；减少动态效果或 HTML 交互期间忽略新注入。

`radius: 'auto'` 时，指针沿用原版的速度平滑、速度半径和 100 模拟像素上限；程序 `splat()` 使用 24 CSS 像素半径。设置数字半径会显式切换为固定宽度笔触。

固定品牌色与透明叠加：

```ts
const effect = await createFluidPrism({
  htmlSource: document.querySelector<HTMLElement>('#hero')!,
  overlay: true,
  rainbow: false,
  color: [0.145, 0.239, 0.867], // sRGB，分量范围 [0, 1]
  blend: 0.4,
  zIndex: 1,
});
```

`overlay: true` 输出透明流体色层，不采样或扭曲背景，HTML 保留原 DOM 父级，不需要原生 HTML-in-Canvas 能力。canvas 需要叠在内容上方，且背景透明、`pointer-events: none`；上述 React/Vue 封装已处理层级和背景。此模式的 `htmlSourceStatus` 为 `fallback`，表示 HTML 没有进入原生纹理，叠加效果仍然运行。`overlay: false` 保持原来的折射模式；`rainbow: false` 在该模式中使用线性空间混合品牌色。

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
| `radius` | `number` 或 `'auto'` | `'auto'` | 默认随速度变化的原版笔触；数字为固定 CSS 像素半径，`0` 禁用新扰动。 |
| `force` | `number` | `1` | 输入冲量倍数；`0` 禁用新扰动。 |
| `autoSleep` | `boolean` | `true` | 静态场景在波纹衰减后休眠。 |
| `respectReducedMotion` | `boolean` | `true` | 尊重系统减少动态效果偏好。 |
| `color` | `[number, number, number]` | `[0.145, 0.239, 0.867]` | 固定品牌色，sRGB 分量 `[0, 1]`。 |
| `rainbow` | `boolean` | `true` | 随流动变色；关闭后使用固定颜色。 |
| `blend` | `number` | `0.15` | 颜色覆盖强度，范围 `[0, 1]`；越大，固定颜色或叠加颜色越浓。 |
| `overlay` | `boolean` | `false` | 输出透明色层，HTML 保留在原 DOM。 |
| `amount` | `number` | `3` | 画面扭曲强度；越大，背景扭曲越明显。 |
| `rgbShift` | `number` | `0.5` | 流动颜色搭配，改变颜色组合而非浓淡。 |
| `multiplier` | `number` | `5` | 扭曲强度倍率，与 `amount` 相乘。 |
| `colorMultiplier` | `number` | `10` | 流动色彩强度；越大，颜色越明显。 |
| `shade` | `number` | `1.25` | 色彩强度倍率，与 `colorMultiplier` 相乘；不调整背景亮度。 |
| `pushStrength` | `number` | `25` | 流动扩散力度；越大，已有波纹沿流动方向移动得越远。 |
| `velocityDissipation` | `number` | `0.975` | 流动持久度；越大，流动减速越慢。 |
| `weight1Dissipation` | `number` | `0.955` | 波纹持久度；越大，主要波纹消散越慢。 |
| `weight2Dissipation` | `number` | `0.86` | 余波持久度；越大，较淡的余波保留越久。 |
| `curlScale` | `number` | `0.02` | 旋涡密度；越大，旋涡越细密。 |
| `curlStrength` | `number` | `3` | 旋涡力度；越大，流动中的卷曲越明显。 |
| `pastelFilm` | `boolean` | `true` | 淡彩薄膜效果，在浅色背景上增加柔和淡彩；需开启 `rainbow` 并关闭 `overlay`。 |
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
effect.splat(0.5, 0.5, 60, -30); // 左上角原点，归一化位置 + CSS 像素冲量
effect.update({ amount: 2.4 });
effect.update({ amount: undefined }); // 恢复 amount 的默认值
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

playground 的“效果设置”面板支持实时调整画面扭曲、固定颜色、波纹大小和力度、流动持续程度及清晰度，提供“随流动变色”“淡彩薄膜效果”“只叠加颜色”等开关，并可点击按钮在中央产生波纹。每个参数附有作用说明，面板显示当前值并支持恢复默认；切换后端或场景保留设置。移动端默认折叠，点击面板标题展开。

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

测试还会从本 README 提取 React/Vue 封装和页面示例，用真实框架验证 SSR、React StrictMode、动态内容、参数移除、后端切换及异步初始化期间的卸载。框架依赖只用于开发验证，发布的核心没有运行时依赖。
