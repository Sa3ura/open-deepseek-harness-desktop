# DeepSeek Harness Desktop

[English](README.md) | 中文

`@deepseek-ai/dsh-desktop` 是现有 DeepSeek Harness Web GUI 的原生应用宿主。它启动一个本地 Harness 进程，等待规范的就绪输出，再用经过加固的 Electron 窗口加载该回环地址。桌面应用不会把会话、Provider、插件或 Skill 状态复制到应用专用格式中。

## 从当前仓库运行

当前里程碑是在 macOS 上从源码运行。使用 Node `^22.19.0 || >=24.0.0`，先构建仓库，再启动桌面应用：

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

应用提供与 `dsh web` 相同的引导和设置界面。用户无需维护第二份配置，即可配置 DeepSeek 或其他兼容 API Provider、选择模型、查看已安装插件、编辑受支持的插件设置、调用 Skill、选择工作区并管理会话。

## 进程生命周期

Electron 主进程不经过 shell，直接启动 `node apps/cli/lib/bin.js web --host 127.0.0.1 --port 0`。它只把 `dsh web: http://127.0.0.1:<port>` 识别为就绪信号，将 stdout 和 stderr 追加到 Electron 的平台日志目录；进程意外退出后按有上限的指数延迟重启；应用退出时先发送 `SIGTERM`，超过固定期限后再发送 `SIGKILL`。

可通过 `DSH_DESKTOP_DSH_BIN` 测试其他已构建的 `dsh` 启动文件。若 Electron 继承的环境无法找到 `node`，可设置 `DSH_DESKTOP_NODE_BIN`。

## 官方源码更新

桌面源码运行模式会在「通用设置」中显示 **DeepSeek Harness 底层更新**。它从固定官方仓库 `https://github.com/deepseek-ai/deepseek-harness.git` 检查 `master`，展示当前提交和已拉取提交；仅当本地提交是官方提交的祖先且工作树干净时才启用升级。已经包含该官方提交的分叉视为最新；发生分叉的历史必须人工合并。

用户确认后，升级器快进工作树，通过桌面 Harness 所选的 Node 可执行文件运行 `pnpm install --frozen-lockfile`，再执行完整仓库构建。依赖安装与构建子进程不会继承名称包含凭据特征的环境变量。准备失败时，升级器把工作树重置到原提交并重新准备该版本；如果恢复失败，结果会明确报告回退不完整，而不会把旧构建显示为健康状态。升级成功后需重启应用，设置卡片会提供该操作。

只有在测试另一个可信工作树时才设置 `DSH_DESKTOP_SOURCE_ROOT`。没有 Git 工作树的安装包不会运行该升级器；安装包自动更新仍以签名发布元数据和可用回退为前提。

## 安全性

渲染进程使用 `nodeIntegration: false`、`contextIsolation: true` 和 `sandbox: true`。导航仅允许 Harness 进程对应的精确回环来源。新开的 HTTPS 窗口交给系统浏览器，其余新窗口全部拒绝。渲染进程的权限请求全部拒绝。Web 代码无法访问任何高权限 Electron API。

API 密钥仍由 Harness credentials 服务持有；桌面宿主不会读取或复制密钥。沙箱 preload 只暴露更新检查、确认升级和应用重启调用，不暴露通用命令或文件系统方法。

## 跨平台发布计划

源码宿主只使用 macOS、Windows 和 Linux 共用的 Electron 与 Node 进程 API。要发布可安装版本，仍需完成以下平台工作：

1. 打包经过审查的 Node 运行时和已发布 Harness 依赖闭包，使安装包不依赖用户的 `PATH`。
2. 构建并公证 arm64、x64 macOS 产物；构建已签名的 Windows x64、arm64 安装包；在原生 CI runner 上构建 Linux AppImage 与 deb 产物。
3. 在每个平台验证退出、子进程清理、原生目录选择、文件打开、PTY 和沙盒行为，再将其加入支持矩阵。
4. 只有在发布签名和回滚流程可用后，才添加已签名的更新元数据。

不得通过把整个工作区源码复制进 Electron 来打包仓库。发布产物必须只包含已发布的运行时闭包、生成的第三方声明，且不得包含开发凭证。

## 扩展方向

桌面专属行为保持在 agent loop 之外。插件与 Skill 管理继续使用 Harness 服务和现有设置界面。远程控制应通过 transport 插件接入：它把经过身份验证的 IM 会话映射为持久化 Harness 会话输入，并通过 interaction 服务回传审批或问题答复。微信、Discord 和 Slack 适配器应作为建立在公共 transport 服务之上的独立 Provider 插件，并明确实现身份映射、授权、审计事件、限流和撤销。

后续桌面里程碑依次为自包含打包、审批请求的原生通知、托盘状态、深层链接和经过身份验证的本地控制端点。内置浏览器、Git 面板、终端和插件市场只应作为由 Harness 服务支撑的 client 插件加入，不能依赖 Electron 专属状态。

## 限制

- 当前源码运行需要已构建的仓库和兼容的 Node 可执行文件。
- 安装包生成、签名、公证、安装包自动更新、托盘、原生通知和 IM 控制尚未实现。源码升级器只接受来自官方 `master` 的干净快进更新；本地分叉仍需人工处理。
- macOS 是首个本地验证平台；源码兼容不等于已经支持发布 Windows 或 Linux 版本。
