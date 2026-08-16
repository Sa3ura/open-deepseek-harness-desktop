# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | 日本語 | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Español](README_es.md) | [Français](README_fr.md) | [Italiano](README_it.md) | [Português](README_pt.md) | [Русский](README_ru.md) | [العربية](README_ar.md) | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop は、コミュニティが独立して保守する [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) のデスクトップディストリビューションです。プラグイン型のエージェントランタイムに、互換 API、カスタムモデル、ワークスペース、セッション、プラグイン、Skill を管理するための視覚的な画面を追加します。

本プロジェクトは DeepSeek の公式製品ではありません。[MIT License](LICENSE) で公開されており、現在は開発者プレビュー段階です。

## 主な機能

- 初回セットアップまたは設定画面で、DeepSeek や互換 API の URL、キー参照、モデル ID を設定できます。
- 永続セッション、メッセージのコピーと削除、履歴の消去、重要な実行ステップの要約に対応します。
- 制限されたワンクリックのプラグイン導入、Skill、テーマ、ローカルのチャット背景を利用できます。
- デスクトップのソース実行はまず macOS で検証済みです。Windows と Linux のインストーラーは今後のパッケージ化とネイティブ検証が必要です。

## ソースから実行

Node.js `^22.19.0 || >=24.0.0` と pnpm `11.7.0` を用意して実行します。

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

機能、設計、セキュリティ、対応状況の詳細は [English README](README.md) または[簡体字中国語 README](README.zh.md)を参照してください。[デスクトップリファレンス](apps/desktop/README.md)と[ユーザーガイド](docs/user/guide/index.md)も利用できます。

## FLAQ.AI について

[FLAQ.AI](https://flaq.ai/) は、画像、動画、音声、言語モデルを API、ドキュメント、開発者向けワークフローから利用できるプラットフォームです。本プロジェクトの実行には必須ではありません。利用前に [FLAQ.AI ドキュメント](https://flaq.ai/docs/)で現在の対応範囲、料金、データ処理条件を確認してください。

## ライセンス

本プロジェクトは [MIT License](LICENSE) で公開されています。
