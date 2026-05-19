# fluid-prism

一个面向现代 Web 应用的轻量级 WebGL 鼠标驱动流体折射效果。

它会渲染一个全屏 canvas，将鼠标光标速度存入 ping-pong 绘制缓冲区，再经过低分辨率反馈纹理处理，最后对场景纹理施加细微的位移与色散干涉效果。

## 特性

- 基于 WebGL 1，无运行时依赖
- 内置 TypeScript 类型定义
- 平滑的鼠标驱动液体 / 波纹扭曲效果
- 带有色散感的油膜风格折射
- 可用于原生 JavaScript、React、Vue 及其他框架
- 支持图片 / canvas / 视频作为输入源，也支持自定义 2D canvas 渲染器

## 安装

```bash
npm install fluid-prism
```

## 基础用法

```ts
import { createFluidPrism } from 'fluid-prism';

const effect = createFluidPrism({
  backgroundColor: '#f4f1ec',
});

// later
// effect.destroy();
```

默认情况下，它会创建一个固定定位的全屏 canvas，并将其挂载到 `document.body`。

## 使用自定义场景渲染器

`fluid-prism` 的本质是对一张纹理进行扭曲。想获得更清晰、更稳定的效果，最可靠的方式是把你的视觉内容绘制到内部的 2D canvas 上：

```ts
import { createFluidPrism } from 'fluid-prism';

createFluidPrism({
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
```

## 使用图片、canvas 或视频作为输入源

```ts
import { createFluidPrism } from 'fluid-prism';

const image = new Image();
image.crossOrigin = 'anonymous';
image.src = '/hero-texture.png';

image.onload = () => {
  createFluidPrism({
    source: image,
    amount: 3,
    multiplier: 5,
  });
};
```

## React 用法

```tsx
import { useEffect, useRef } from 'react';
import { createFluidPrism, type FluidPrism } from 'fluid-prism';

export function Hero() {
  const hostRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<FluidPrism | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    effectRef.current = createFluidPrism({
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
    });

    return () => effectRef.current?.destroy();
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
    const effect = createFluidPrism({
      canvas: canvasRef.current,
      fullscreen: false,
      backgroundColor: '#f4f1ec',
    });
    return () => effect.destroy();
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

  effect = createFluidPrism({
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
  effect = createFluidPrism({
    canvas: canvasRef.value,
    fullscreen: false,
    backgroundColor: '#f4f1ec',
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
| `source` | `HTMLImageElement \| HTMLCanvasElement \| HTMLVideoElement` | - | 用于扭曲的纹理源。 |
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
const effect = createFluidPrism(options);

effect.start();
effect.stop();
effect.update({ amount: 2.4 });
effect.resize();
effect.destroy();
```

## 发布

```bash
npm install
npm run build
npm publish --access public
```

如果该包名在 npm 上已被占用，请先修改 `package.json` 中的 `name` 再发布。

## 说明

- 这个效果主要面向 hero 区域和视觉型落地页设计。
- 项目有意不包含完整 DOM 截图能力。若想获得最佳效果，请传入 `source` 或 `contentRenderer`。
- 纹理中建议保留高对比文字或图形，这样折射效果会更明显。
