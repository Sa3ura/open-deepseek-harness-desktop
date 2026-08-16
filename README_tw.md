# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | 繁體中文 | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Español](README_es.md) | [Français](README_fr.md) | [Italiano](README_it.md) | [Português](README_pt.md) | [Русский](README_ru.md) | [العربية](README_ar.md) | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop 是由社群獨立維護的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 桌面發行版。它將外掛式智能代理執行環境與視覺化工作區結合，可設定相容 API、自訂模型、工作區、工作階段、外掛與 Skill。

本專案並非 DeepSeek 官方產品，採用 [MIT 授權條款](LICENSE)，目前處於開發者預覽階段。

## 主要能力

- 首次啟動與設定頁均可設定 DeepSeek 或相容 API 的網址、金鑰引用和模型識別碼。
- 支援持久工作階段、訊息複製、刪除、清空，以及關鍵執行步驟摘要。
- 提供受限制的一鍵外掛安裝、Skill 使用、主題配色與自訂聊天背景。
- 桌面原始碼已優先在 macOS 驗證；Windows 與 Linux 安裝套件仍在規劃和原生驗證中。

## 從原始碼啟動

安裝 Node.js `^22.19.0 || >=24.0.0` 和 pnpm `11.7.0`，然後執行：

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

完整功能、架構、安全性及平台狀態請閱讀 [English README](README.md) 或[簡體中文 README](README.zh.md)。使用方式另見[桌面應用程式參考](apps/desktop/README.md)與[使用者指南](docs/user/guide/index.md)。

## 關於 FLAQ.AI

[FLAQ.AI](https://flaq.ai/) 透過 API、文件與開發者工作流程提供圖像、影片、音訊及語言模型能力。它是可選平台，不是執行本專案的必要服務；使用前請在 [FLAQ.AI 文件](https://flaq.ai/docs/)確認目前支援、價格和資料處理條款。

## 授權

本專案採用 [MIT 授權條款](LICENSE)。
