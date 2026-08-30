# Agent Note: 限定社区桌面版 Release 发现等待时间

Status: implemented

[English](2026-08-30-bounded-community-release-discovery.md) | 中文

## Problem

桌面版 Release 检查器把上游风格的 `dsh-v` 前缀和单一预发布标签当作完整的版本身份，因此无法识别社区版 `odsh-v` 标签，已安装的候选版也无法发现更高的 alpha 版本。GitHub 请求挂起时，设置操作还会一直停留在检查状态，缺少恢复节点。

## Decision

桌面版 Release 发现会先接受社区 `odsh-v` 前缀、旧版 `dsh-v` 前缀和普通 `v` 前缀，再解析语义版本。稳定客户端拒绝所有语义预发布版本，包括被 GitHub 错误标记为正式版的 Release。任意预发布客户端都接受更高的语义预发布版本，不要求标签名称相同，同时也接受更高的稳定版。

Release 元数据请求设有十五秒期限，超时后会中止底层 HTTP 操作。带状态的检查器会把该故障转换成已有的可见错误状态，并允许用户稍后重试。

桌面打包工作流使用 `odsh-v*` 发布新的社区标签，并继续接受旧版 `dsh-v*` 标签。工作流根据语义版本判断预发布状态，在创建或更新 GitHub Release 时统一设置标题和状态。

## Alternatives considered

**把已发布的社区 Release 改名为 `dsh-v*`。** 这可以让旧客户端发现单个 Release，但会继续混淆社区与上游标签身份，也不能解决请求挂起或未来预发布通道切换问题。

**要求预发布标签名称完全相同。** 隔离 rc、alpha 和 beta 通道会导致上一产品基线的客户端无法发现下一版预览。语义版本优先级已经能够判断候选版本是否更新，稳定客户端仍保留更严格的排除规则。

**只信任 GitHub 的 prerelease 标记。** 手动创建的 Release 可能使用 alpha 语义版本，但被 GitHub 标记为正式版。解析标签可以在托管元数据不一致时继续保护稳定客户端。

## Consequences

打包的 rc.2 客户端可以发现社区 alpha.1 Release，alpha.1 客户端会正确识别自身为最新版，未来 `odsh-v*` Release 在发现和 CI 发布流程中使用同一版本身份。GitHub 故障或受阻连接会在十五秒后成为可重试错误，不再无限转圈。过渡期间仍可发现和发布旧版桌面标签。
