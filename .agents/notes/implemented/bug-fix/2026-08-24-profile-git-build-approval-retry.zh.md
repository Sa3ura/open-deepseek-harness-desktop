# Agent Note: Profile 构建许可重试

Status: implemented

[English](2026-08-24-profile-git-build-approval-retry.md) | 中文

## Problem

pnpm 要求依赖运行生命周期脚本前必须存在 `allowBuilds` 规则。Git 托管插件需要与解析来源绑定的精确依赖路径键，已审核的 registry 依赖则使用包名。用户即使已经在插件市场或 CLI 中明确安装并确认信任，操作仍会失败，并要求手动修改 YAML。较大的 pnpm 诊断还会把精确 Git 键放在长堆栈之前，而 dsh 只保留最后 64 KiB，导致插件市场导出的日志可能缺失操作提示所要求的值。安装包内的 Better Sidebar 还依赖 `node-pty`，因此其延后安装会在应用已经 ready 后失败。

## Decision

对于明确执行的 profile `add`，dsh 在截断诊断前从 pnpm 的结构化 Git prepare 提示中保留精确依赖路径键，将这条有界信息追加到保留诊断中，再以原子写方式只把该精确键以 `true` 写入 profile 的 `pnpm-workspace.yaml`，随后重试同一操作一次。

桌面预置插件清单可以另行通过 `approvedBuilds` 指定已审核的 registry 依赖。在安装该精确预置条目前，宿主和 Windows 安装包运行时冒烟测试都会调用 `dsh plugin --profile <name> approve-build <package-name>`。CLI 会校验无版本 npm 包名，并且只写入该键。Better Sidebar 只声明 `node-pty`；普通插件市场和 CLI 安装不会获得隐式 registry 许可。

两种 YAML 更新都会保留注释及无关设置。已有的 `false` 规则仍然优先。缺失、格式异常、重复或无关的许可不会修改 profile，dsh 也不会放行所有构建脚本。Git 重试仍失败时，诊断同时包含原始失败和重试失败。

## Alternatives considered

**要求每位用户手动编辑 profile YAML。** 这保留了单独的批准步骤，但插件市场已经要求用户明确确认信任，安装包用户不应再从 pnpm 输出中恢复内部依赖路径键。诊断被截断时，该操作甚至无法完成。

**允许所有依赖构建脚本。** 这能避免后续 Git prepare 失败，却会丢失 pnpm 对无关包和传递依赖默认拒绝的保护。

**使用人类可读错误中的 manifest 名称与版本。** pnpm 按特定解析来源的依赖路径授权 Git prepare，而不是按展示版本授权。范围更宽或重建出来的键可能无法匹配，也可能在源码 revision 变化后继续意外生效。

**对预置插件关闭严格依赖构建检查。** 这会允许任意传递依赖执行生命周期脚本。清单白名单只记录已审核包名，其余脚本仍然保持阻止状态。

## Consequences

安装已审阅的 Git 源码插件时，第一次被拦截后可以执行其声明的准备脚本，并且精确源码解析来源会保留在 profile 配置中。Git 解析来源变化后会获得独立规则。安装包插件只能运行经过完整性校验的预置清单中列出的 registry 生命周期依赖；显式拒绝仍然优先，无关 registry 压缩包、本地 checkout 以及非 `add` 的包管理操作保持原有行为。

聚焦测试覆盖 pnpm 的真实本地 Git prepare 路径、超大诊断中的键保留、registry 包名校验、YAML 注释保留和显式拒绝行为。Windows 安装包冒烟测试会通过内置 Node 与 pnpm 安装延后的 Better Sidebar，因此缺少 `node-pty` 许可时必然失败。
