# Agent Note: Web Chat 消息流虚拟化

Status: implemented

[English](2026-09-03-web-chat-virtualization.md) | 中文

## 问题

Chat transcript 为每个已加载的 Conversation node 挂载一行 React 组件，挂载行数、DOM 节点与布局工作量随已加载历史窗口线性增长。长工具密集会话会让数千个「隐藏但仍挂载」的行持续存活（折叠的 Turn process 仍以 `hidden="until-found"` 把成员行留在 DOM 中），滚动与流式渲染随 transcript 增长而劣化。Session 分页已经限制了进入客户端窗口的内容；却没有任何机制限制该窗口中有多大比例保持挂载。

## 决策

`ui-chat` 使用仓库现有的 `@tanstack/react-virtual` 依赖对已加载 Chat 消息流做窗口化。低于 `CHAT_VIRTUALIZATION_THRESHOLD` 行（100，与 trajectory ledger 惯例一致）时走原样的普通全量渲染路径；超过后 `ChatNodeList` 只渲染虚拟izer 的「视口 + overscan」条目，上下各配一个高度 spacer，挂载 seat 数由此近似被视口约束，不再随已加载历史线性扩张。

所有权分离是设计的核心：

- **TanStack Virtual 负责**可见范围、逐行测量、条目偏移与按偏移定位的计算。`getItemKey` 返回稳定的 Conversation Context key（`conversationContextKey(kind, id)`），因此 TanStack 的尺寸缓存以逻辑身份为键，可在前插后存活；`measureElement` 读取每个 seat 的边框盒，虚拟化路径把兄弟行间距移入行内作为顶部内边距（`ChatView.module.css` 以 `data-chat-flow-virtual` 区分两种间距模型），使测量尺寸自带间距、偏移不会按 rowCount × gap 漂移。TanStack 自身的滚动写入——默认会经 `scrollToFn` 执行的折叠线上方测量补偿（首次测量与完全位于视口上方的重测）——被 `shouldAdjustScrollPositionOnItemSizeChange: () => false` 显式关闭：普通 Chat 路径从不做尺寸变化补偿，关闭它既保留虚拟化前的读者语义，又保持 ChatView 是唯一的 `scrollTop` 写入方，并防止该补偿与前插校正叠加。`scrollMargin` 发布为 row 0 的真实内容偏移（flow 列在滚动内容中的原点加上前导块高度），使虚拟izer 偏移与 `scrollTop` 共用同一坐标系。
- **`ChatView` 仍是唯一滚动权威。**贴底跟随（`atBottomRef` + column `ResizeObserver` + flow-tip 签名）、读者/程序化滚动判别（`observedTopRef` 旁的投递时刻账本）、前插锚点（`PagingAnchor`）、load-through 跳转状态机、会话滚动恢复（`chatScroll`）与回到底部全部未动。流式行的增长以普通行尺寸变化的形式到达虚拟izer，其重测只调整偏移；视口是否移动仍由 ChatView 决定，与普通路径完全一致。

语义滚动校正仍留在 `ChatView`，虚拟izer 只提供偏移数值。TanStack 的自动前插补偿绑定在 `anchorTo: 'end'` 上，默认 start 锚定下不生效；测量补偿又被显式禁用，因此除 ChatView 外没有任何 `scrollTop` 写入方。锚定前插分支先写入锚点的*绝对*新偏移（`offsetOfKey(anchorKey) − anchorTop`）；锚点上方从未挂载的行携带估算尺寸，因此随后由一个有界的 settle 循环按锚点行的实时矩形逐帧重写，直至收敛——会话恢复与 rail/跳转落点因同样原因共用这一收敛。`±2px` 契约测试观察到的正是虚拟化路径收敛后的几何。读者移动会中止追赶；归属判别读取滚动*投递*而非延迟采样，使贴底落点（原生 End、回到底部）下方的测量增长不再被误判为读者移动。跳转导航在目标行未挂载时按 `order.indexOf → offsetOfKey` 解析；未加载 Turn 仍走既有 `loadThrough()` 状态机分页。

虚拟化会卸载视口外的 seat，必须跨卸载存活的 renderer 本地展开状态因此迁入会话作用域 store——`ui-chat` 一个 `createChatNodeStore()`（以节点限定 key 覆盖系统提示词、上下文注入、命令卡与逐块推理行），`ui-tool` 一个 `createToolDisclosureStore()`（按 call id），两者沿用既有的 store-at-register 模式（`createChatStore`、turn-process 条目）；条目持布尔值，仅 `true` 表示展开。`ModelRetryItem` 的原生 `<details>` 与文本选区作为已记录的损失写入包 README。

## 已考虑的替代方案

**用 `anchorTo: 'end'` + `followOnAppend` + `scrollToEnd()` 让 TanStack 接管贴底跟随。**Phase 1 否决：ChatView 的 follow 模型已经区分读者滚动与程序化写入、以 24px 阈值钉住流式输出、且不被惯性滚动中途吸底；第二个滚动写入方会在每次测量变化时与之竞争，并推翻 `chat-scroll-contract.e2e.ts` 覆盖的滚动契约行为。trajectory ledger 能用 end-anchoring 是因为它拥有自己的滚动窗格且行高固定；Chat 行高无上界。

**照搬 trajectory 模式的常量 `estimateSize`、不做 DOM 测量。**否决：trajectory 行是单行表格行（30/20/9px 常量）；Chat 行从单行到数千像素的 Markdown 不等，没有 `measureElement` 的估算会让第一高行之后的每一行都错位。

**引入面向 chat 的虚拟化库（react-virtuoso，自带 follow）。**否决：它会在仓库已确立的 TanStack 用法旁引入第二个列表引擎，只为换取 ChatView 已拥有的 follow 能力，且 client module-graph/打包规则会让每个新增外部行都变成 shared-module 决策。

**跨 Session 持久化逐行高度缓存。**Phase 1 否决：会话在重挂载时重新测量；重连 replace 后跨会话缓存有陈旧高度风险，且没有测量证据支持。

## 后果

消息流超过 100 行后，挂载的 Chat seat 数被「视口 + overscan」约束；`apps/web/tests/chat-virtualization.e2e.ts` 钉住这一界限（1000+ 逻辑行时 ≤80 seat）、前插锚点漂移（±2px）、贴底流式、scroll-away 归属、工具展开状态跨卸载/重挂的持久化、会话 A→B→A 与 resize；`complex-history.perf.ts` 在 500-turn 场景中连同 DOM/heap 一并报告逻辑行对挂载行。视口外的行真实地不在 DOM 中：原生 Ctrl+F 与文本选区只覆盖已挂载窗口（已写入 `ui-chat` 的 Known Limitations，不静默回退），`hidden="until-found"` 的可发现性现在限于已挂载窗口。必须跨卸载存活的行状态存放在两个新的会话作用域 store 中；条目随 Session 作用域消亡，且只随读者交互增长。
