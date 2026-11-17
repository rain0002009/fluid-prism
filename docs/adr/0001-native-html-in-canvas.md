# 原生 HTML 场景采用交互优先策略

Fluid Prism 使用浏览器原生 HTML-in-Canvas 能力，让真实 HTML 场景参与 WebGL 和 WebGPU 流体折射，并保留表单、文字选择和键盘操作。选择原生能力是为了沿用浏览器的布局和交互语义；不引入 DOM 截图库。

浏览器通过元素几何变换处理交互，而流体 shader 的局部非线性位移不能用一个 DOMMatrix 精确描述。因此控件悬停、聚焦、按下指针或选择文字期间停止产生新波纹；已有波纹继续运动并自然消散，交互结束后恢复新波纹。命中位置沿用未扭曲的 DOM 几何，残留波纹消散前可能与视觉位置存在差异。不支持所需原生能力时显示可正常交互的普通 HTML。

2026-11-17 调整：根据交互体验反馈，以停止注入新扰动替代清空波纹和立即显示原图，避免经过控件时画面突变。

依据：[Chrome 发布说明](https://developer.chrome.com/blog/html-in-canvas)、[元素几何与降级规则](https://developer.chrome.com/docs/web-platform/html-in-canvas/concepts)。
