# Agent Note：桌面端独立数据目录与官方数据导入

Status: implemented

[English](2026-08-25-independent-desktop-data-home.md) | 中文

## Problem

源码 Electron、已安装桌面版与官方 `dsh` CLI 在没有设置 `DSH_HOME` 时都继承同一个 `~/.dsh` 回退。安装包内 Node 和 Harness 运行时虽然独立，会话、凭据、Profile、插件、seed marker 与隔离状态却实时共享。因此，同时运行源码、安装版或官方客户端可能改动另一端的依赖图，也会让安装版看起来与开发环境完全相同。

## 决策

**桌面端数据放在以仓库命名的平台目录中，并隔离源码与安装模式。** 安装版使用 Electron `appData` 下的 `open-deepseek-harness-desktop/dsh-home`，源码版使用 `open-deepseek-harness-desktop/development/dsh-home`。Electron `userData`、浏览器 `sessionData`、日志、解压运行时与 Harness `DSH_HOME` 采用同一套安装版／开发版边界。显式且非空的 `DSH_HOME` 仍具有最高优先级。

**只有用户在首次启动明确选择后，才使用现有官方 `~/.dsh`。** Harness 启动前由原生对话框提供安全复制到独立 home、直接复用官方 home 或全新开始。复制模式使用白名单处理设置、不透明凭据文档、会话、工作区元数据、Agent 预设、Skill 与连接状态；拒绝符号链接，并以 staging 目录原子改名完成。直接复用则有意恢复原先共享配置和插件状态的行为。持久选择记录位于 Harness home 之外，因此可以在 Harness 启动前读取。

**插件执行状态依据可迁移且由用户选择的恢复清单重新建立。** Profile、`node_modules`、锁文件、预装 seed marker、依赖健康与隔离记录、匿名用户 id 均排除。导入会把官方 Web Profile 的有序 bundle 与直接依赖取交集，只把包身份、原始说明符、分类、默认选择和有界诊断保存到 `imported-plugin-restore.v1.json`。registry 范围、npm alias 与不含凭据的 Git 来源可供选择；本地来源和带凭据 URL 会显示原因但不能执行。渲染层只提交不透明恢复 id，Electron 解析持久清单中的说明符并串行调用现有插件 CLI。打包预置插件先完成核对，同名恢复项显示为“客户端已提供”，不会重复安装。失败项保留在独立的“插件恢复”设置页面重试，不阻止 Harness 启动。

**导入的构建策略经过收窄后合并。** 导入只读取官方 Web Profile `allowBuilds` 映射中的布尔项。独立 Profile 保留注释与其他 pnpm 配置；任一侧明确设置的 `false` 优先，同时绝不导入 `dangerouslyAllowAllBuilds` 等全局降级策略。官方 Profile 元数据损坏时只记录有界来源问题，不取消用户数据导入。

**复用核对会拓宽策略，但不重复安装依赖。** 已有顶层包无论保存的是哪个版本或来源都会被接管，同时识别 npm alias 与相同 GitHub 仓库；不同的 monorepo `path:` 子包仍保持独立。经过审核的生命周期依赖会加入已有 `allowBuilds` 映射，其他许可与注释均保留，用户明确设置的 `false` 仍具有最终效力。只要依赖仍存在，即使已经有有效 seed marker，也会再次核对所需许可。

**外部产品连接保持为用户明确触发的联网安装。** Codex 与 Claude Code 不进入任何平台安装包，也不属于仓库的预装插件清单。“外部工具”页面只有在用户点击后才安装其精确官方 npm 包。源码开发版使用仓库固定的 pnpm，安装版使用内置 pnpm，既避免环境中包管理器与 store 版本冲突，也不会把两个连接变成桌面 payload。

## Alternatives considered

- **继续共享 `~/.dsh`：** 否决，因为安装产品、源码 checkout 和官方 CLI 会继续改动同一依赖图与平台原生插件目录。
- **自动复制整个官方 home：** 否决，因为这会在未经同意时移动凭据，并导入陈旧 Profile、原生模块、链接、锁文件、隔离状态与桌面 seed tombstone。
- **经同意后复制完整 Profile：** 否决，因为 Harness 启动前重放其 package manifest 需要包管理器和供应链决策，单纯文件复制无法证明安全。窄范围恢复清单既保留用户选择，也不会让可执行状态跨过隔离边界。
- **把官方数据转换成桌面专属 schema：** 否决，因为 Harness 已拥有稳定的设置、凭据、会话与存储格式；白名单内按字节复制可避免维护第二套持久化实现。

## 影响

- 开发版、安装版和官方 CLI 默认不再互相修改会话与插件状态。
- 现有用户可以保留受支持的配置与历史数据，而不必继续实时共享依赖树。
- 选择直接复用的用户会有意与官方 dsh 共享设置、凭据、会话、Profile、插件及其后续修改。
- 用户从恢复清单选择的第三方插件会在独立 home 中重新安装；由于不导入锁文件，声明版本范围可能解析到更新的兼容版本。
- 安装 Codex 或 Claude Code 时需要联网；应用重启或升级不会擅自恢复这两个连接。
- 完成设置后若只删除独立 home，下次会创建全新 home 而不再询问；只有同时删除独立的设置记录，才会重新出现首次导入选择。

测试直接覆盖路径与导入边界：

- 纯路径测试固定安装版／开发版目录与显式 `DSH_HOME` 优先级。
- 导入测试覆盖受支持数据、有序插件提取、alias 与 Git 来源、不安全来源拒绝、`allowBuilds` 合并优先级、排除的执行状态、符号链接拒绝、非空目标拒绝和原子设置记录。
- Desktop 类型检查与一次开发版 Electron 启动验证选定的 `DSH_HOME` 能抵达 Harness ready，并使用以仓库命名的日志路径。
