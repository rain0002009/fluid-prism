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

## React / Vue 封装约定

2026-11-17 根据组件接入反馈补充：

- npm 包继续提供框架无关的核心；README 提供可复制到使用方项目的 React `children` 和 Vue slot 封装及页面示例，不增加框架组件导出或 shadcn registry。
- 封装支持容器样式、动态显示参数和后端切换；降级和切换后保留同一棵内容子树及表单值。
- 核心在局部模式保留 canvas 的定位和尺寸；退出全屏恢复进入前的局部布局。显式传入 `undefined` 恢复配置默认值或清除可选输入。
- 封装仅在客户端初始化，同步取得实例以注册清理；后端变化时更换 canvas。覆盖 SSR、React StrictMode、卸载及 WebGPU 初始化期间的卸载。
- 直接提取 README 示例，以真实 React / Vue 和浏览器验证动态内容、输入、键盘、选区、参数更新、DOM 降级与销毁。

设计取舍见 [ADR-0001](./adr/0001-native-html-in-canvas.md)，术语见 [CONTEXT.md](../CONTEXT.md)。
