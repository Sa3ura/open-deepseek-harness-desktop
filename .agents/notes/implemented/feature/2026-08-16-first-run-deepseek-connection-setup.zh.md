# Agent Note: 首次启动 DeepSeek 连接配置

Status: implemented

[English](2026-08-16-first-run-deepseek-connection-setup.md) | 中文

## Problem

首次启动的 DeepSeek 步骤只接受 API 密钥，但 Models 页面已经支持替换 `baseURL` 和由部署维护的模型目录。使用兼容网关的用户必须跳过引导、再进入设置寻找入口，并在首次会话前重复配置提供方。

## Decision

首次启动步骤渲染与设置页相同的 DeepSeek `ProviderEditor`，并默认展开 API 地址与模型控件。API 地址和模型目录保持不变时，分别解析为 `https://api.deepseek.com` 和适配器默认值；修改其中任意一项会写入既有 `llm-deepseek` 设置分节，因此下一次提供方请求无需重启应用即可读取新配置。

官方适配器流程仍要求 API 密钥，且密钥只通过 `credentials.set` 传递。API 地址和模型值通过 `settings.mutate` 写入；UI 快照与 `settings.yaml` 均不会收到密钥。引导完成后，Models 页面仍是替换密钥、API 地址或模型目录的入口。

## Alternatives considered

- **保持引导只填写密钥，并链接到设置页：** 否决，因为自定义 API 地址仍要求用户在产品可用前完成两轮配置。
- **为引导创建独立表单：** 否决，因为校验、脱敏、部分写入处理和模型编辑会与 Models 页面产生分叉。
- **把密钥和 API 地址一起存入设置：** 否决，因为凭据服务是既有的只写 secret 所有方，而设置 descriptor 有意保持可检查和脱敏。

## Consequences

DeepSeek 官方 API 用户可以只填写密钥，网关用户则能在同一个首次启动步骤中配置兼容 API 地址和任意模型 ID。更高的弹窗会在较矮视口中滚动，并在首次显示时保持设置折叠区展开。单元测试覆盖默认与自定义提交；无密钥 Web 场景记录展开后的首次启动状态，并证明设置和凭据分别持久化。
