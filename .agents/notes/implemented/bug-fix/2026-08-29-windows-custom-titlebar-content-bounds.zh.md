# Agent Note：将 Windows Web 内容约束在自定义标题栏下方

Status: implemented

[English](2026-08-29-windows-custom-titlebar-content-bounds.md) | 中文

## 问题

Windows 和 Linux 桌面窗口使用无系统边框的 BrowserWindow，并由 preload 提供标题栏。通过根文档内边距为标题栏留位，并不会为 Web 应用建立独立的包含矩形。在部分 Windows 配置中，Chromium 会按完整视口解析根节点的百分比高度，使全高 Shell 布局进入标题栏所在的行。

## 决策

preload 保持文档根节点与原生视口同高，并把 body 固定在 36 px 标题栏下缘与视口底部之间。Web 根节点继续使用 `height: 100%`，但该百分比会在缩小后的 body 矩形内解析。标题栏继续固定在原生视口上，并位于所有 Web 图层之上。

URL inset 继续提供给需要获知桌面 chrome 尺寸的固定定位或视口相对插件。文档边界与插件元数据分别处理不同的布局场景，因此共同使用同一个高度常量。

## 后果

会话标题和操作按钮不会渲染到最小化、最大化或关闭按钮下方。全高 Web 布局获得准确的剩余内容高度，不再依赖平台相关的内边距计算；macOS 继续使用原生边框，不受影响。
