# HTML 场景实现范围

本规格来自 2026-11-17 的设计确认，用于实现和代码审查。

- 使用原生 HTML-in-Canvas，以 `htmlSource: HTMLElement` 显式传入真实 DOM；覆盖 WebGL 和 WebGPU，不增加 DOM 截图库。
- HTML 尺寸跟随效果 canvas 的 CSS 尺寸，DPR 影响纹理精度。文字、CSS 和表单内容变化自动同步。
- 保留输入框、文字选择、复制、链接和键盘操作。悬停交互控件、焦点在场景内、按下指针或选区存在时，只停止产生新波纹；已有波纹继续运动并自然消散，交互结束后恢复新波纹。
- 能力不足或原生 HTML 上传失败时隐藏效果 canvas，显示普通可交互 HTML。
- 替换输入或销毁实例时恢复源节点位置、drawable 属性及受管理的布局样式；清理事件与 GPU 资源。
- demo 提供 HTML 和原有 2D 场景切换、WebGL/WebGPU 切换、输入框、文字选择、Tab 导航、动态标题和内容更新，以及降级提示。
- README 提供用法、原生浏览器支持、降级、交互限制和开发验证命令。
- 验证公共创建与生命周期接口，以及真实浏览器 demo；运行类型检查、库构建和 demo 构建。未能验证的环境明确说明。

设计取舍见 [ADR-0001](./adr/0001-native-html-in-canvas.md)，术语见 [CONTEXT.md](../CONTEXT.md)。
