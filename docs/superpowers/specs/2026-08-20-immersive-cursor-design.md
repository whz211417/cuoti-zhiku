# 沉浸式指针设计

## 目标

让错题智库在深色与浅色模式下都拥有清晰、克制的鼠标聚光效果，并在应用内容区以内用自定义指针替代系统箭头，不损害文字输入、窗口控制或降低动效偏好。

## 交互

- 光晕是固定定位、不可交互的单一全局层；它根据系统主题使用不同的冷蓝和暖白配色。
- 精确鼠标进入应用内容区后，系统箭头隐藏；自定义指针以 rAF 更新 CSS 变量，包含 8px 核心与低透明扩散光。
- 指向按钮、链接、选项等可点击控件时变为紧凑圆角指针；按下时只做一次 120ms 的缩放回馈，不保留拖尾或循环特效。
- 指向 input、textarea、select、contenteditable 区域时立即恢复原生文本光标；离开应用窗口也恢复系统光标。
- `prefers-reduced-motion`、`prefers-reduced-transparency`、粗指针或无 hover 环境不渲染自定义层，也不隐藏系统光标。

## 技术边界

- 新建 `ImmersiveCursor` React 组件，只维护 DOM style，不通过 React state 逐帧渲染。
- 组件由 `App` 一次挂载；既有 `DynamicControlSurface` 保留局部玻璃高光，但将其深色样式调为可见的主题变量。
- 仅使用 `transform`、`opacity` 和 CSS variables；不安装新依赖。
- 组件保持 `pointer-events: none`、`aria-hidden`，不影响焦点与辅助技术。

## 验收

- 深、浅模式的光晕都可见且不遮挡文本。
- 文本输入、选择和窗口标题栏不隐藏原生鼠标。
- 降低动效/透明度时只有原生鼠标，不出现动态指针或荧光。
- 连续 pointermove 每帧最多写一次 DOM 样式；现有局部材质测试不回归。
