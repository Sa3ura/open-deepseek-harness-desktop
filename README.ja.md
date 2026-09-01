<p align="center">
  <img src="./apps/desktop/src/icon.png" width="112" alt="Open DeepSeek Harness Desktop アイコン">
</p>

# Open DeepSeek Harness Desktop

<p align="center">
  <strong>すぐに使えて、依存関係の安全性を強化した DeepSeek Harness コミュニティデスクトップ版</strong>
</p>

言語：[简体中文](README.md) · [English](README.en.md) · 日本語 · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

> [!IMPORTANT]
>
> **[v0.1.2-alpha.1.1 を公開しました。v0.1.2-alpha.1 の修正強化版です。ぜひダウンロードしてお試しください](https://github.com/flaqai/open-deepseek-harness-desktop/releases/tag/odsh-v0.1.2-alpha.1.1)。** 本版は引き続き DeepSeek Harness 0.1.2-alpha.1 を上流の基盤とし、デスクトップ環境の管理、プラグイン復旧、クロスプラットフォームの安定性を強化しています。
>
> **主な追加機能と改善：**
>
> - 初回設定と一般設定で、デスクトップ専用ディレクトリ、公式 DSH ディレクトリ、その他の対応ディレクトリ、空のディレクトリを安全に選択または切り替えられます。切り替え時に元のデータをコピー、統合、上書き、削除することはありません。
> - 初回ガイドにスマートフォン接続の手順を追加し、ローカルネットワークからのスマートフォンアクセスと IM 接続を続けて設定できます。
> - プラグインが隔離された場合、対象プラグイン、隔離理由、復旧操作を表示します。診断機能は無効な隔離解除状態を消去し、復旧に失敗した場合は安全に停止した状態を維持します。
> - `odsh-v*`、従来の `dsh-v*`、通常の `v*` タグからコミュニティ版を検出します。Windows と macOS では対応するインストーラーをダウンロードして検証し、失敗時には具体的な情報を表示します。
> - Windows/Linux ではタイトルバーと Harness のプラグイン内容を別々のネイティブビューに配置し、全画面プラグインが最小化、最大化、閉じるボタンを覆わないようにしました。
>
> **主な修正：**
>
> - Windows でプラグインのインストールまたは更新中に、ウイルス対策ソフト、インデクサー、残留プロセスがディレクトリを一時的に占有して発生する pnpm の `EPERM`/rename エラーを修正しました。
> - 問題のあるプラグインをアンインストールした後も隔離記録が残り、再起動後にクライアントへ入れない、または再インストールできない問題を修正しました。
> - 空のツール呼び出しに `tool source` がない古い会話を読み込めない問題を修正しました。
> - コミュニティ版の Release チェックが最新版を認識できない、確認中のまま停止する、または誤ったプレリリースを選ぶ問題を修正しました。
> - クライアントモジュールの欠落、依存関係の競合、読み込み失敗に対する診断を強化し、再インストール、再試行、アンインストールの具体的な案内を追加しました。
> - 同梱のプラグインマーケット、IM、Better Sidebar、Pocket などを更新し、固定バージョンと SHA-512 完全性検証を維持しました。ユーザーが明示的に削除したプラグインは自動的に復元されません。
>
> これは Alpha プレリリースです。アップグレード前に重要な設定をバックアップし、問題を報告する際はログまたは診断レポートを添付してください。

Open DeepSeek Harness Desktop は、[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) を基盤とする、コミュニティ運営の独立したデスクトップ配布版です。Node.js、pnpm、Harness ランタイムをインストーラーに同梱し、モデル設定、コーディングセッション、実行履歴、プラグイン、Skill、外部コーディングツール、IM ボットを一つのアプリで扱えます。

> [!NOTE]
>
> 本リポジトリは DeepSeek の公式製品ではありません。現在もプレビュー段階であり、データ形式、互換性ポリシー、インストール方法は今後変更される可能性があります。

## このリリースの主な内容

- 公式設定を独立環境へコピー、既存ディレクトリを直接共有、または新規作成。
- インポートしたプラグインのオンライン確認と、ソースディレクトリ／.tgz からの安全な復元。
- pnpm、Cordis、多重 Host インスタンス、Loader 残留を起動前に診断・修復・隔離。
- 選択テキストのコピー、新しい会話での質問、現在の下書きへの追加。
- トレイ、クイック再起動、通知、ログ、アプリ内更新、dsh コマンド登録。
- Windows x64、macOS arm64/x64、Linux DEB/RPM パッケージ。

## 初回起動と独立データ環境

初回起動時に既定の公式 DSH ディレクトリ ~/.dsh を確認します。見つからない場合や未対応の場合も、別の対応ディレクトリを手動で選択するか、空のデスクトップ専用環境を作成できます。

### 独立環境へインポート

設定、資格情報、セッション、ワークスペース情報、Agent プリセット、Skill、接続状態をデスクトップ専用ディレクトリへコピーし、元のディレクトリは変更しません。Profile、node_modules、ロックファイル、プラグイン実体、隔離記録、匿名識別子はコピーしません。プラグインはデスクトップ側で再インストールされ、その後の変更は公式 CLI/Web 環境と共有されません。

<p align="center">
  <img src="./assets/readme/data-home-import-en.png" width="900" alt="公式 DSH 設定を独立したデスクトップ環境へインポート">
  <br><sub>独立環境へインポート：対応データのみをコピーし、元の環境を維持</sub>
</p>

### この設定を直接使用

公式 ~/.dsh または手動で選択した対応ディレクトリをそのまま使用します。設定、資格情報、セッション、Agent プリセット、Skill、Profile、プラグインが共有され、Desktop と公式 CLI/Web の変更は同じデータへ反映されます。

<p align="center">
  <img src="./assets/readme/data-home-reuse-en.png" width="900" alt="既存 DSH 設定をデスクトップから直接使用">
  <br><sub>この設定を直接使用：選択したディレクトリとデータを共有</sub>
</p>

### 新しく開始

既存の設定、セッション、プラグインを読み込まず、完全に独立した空の環境を作成します。

<p align="center">
  <img src="./assets/readme/data-home-fresh-en.png" width="900" alt="新しい独立 DSH 環境を作成">
  <br><sub>新しく開始：既存 DSH 設定を読み取りも変更もしません</sub>
</p>

セットアップウィザードでは、モデル API Key、WeChat／Feishu などの IM ボット、任意の Codex 接続を順に設定できます。すべての手順はスキップでき、後から設定画面で完了できます。

## インポート後のプラグイン復元

独立環境へのインポートでは、プラグイン設定と復元リストだけをコピーし、古い node_modules は採用しません。復元画面は各項目を次の状態で表示します。

- **クライアント提供済み**：同梱プリセットが既に満たしています。
- **確認中**：一時ディレクトリで出所を確認し、現在の Profile は変更しません。
- **オンライン復元可能**：同梱 pnpm で再インストールできます。
- **オンライン出所なし**：パッケージ、リポジトリ、Git 参照が存在しません。
- **一時的に確認不可**：オフライン、タイムアウト、認証、レート制限のため後で再試行できます。

オンライン出所が利用できない場合、ユーザーがソースディレクトリまたは .tgz を選択できます。クライアントはパッケージ名、アーカイブパス、manifest とファイルサイズを検証し、ソースはライフサイクルスクリプトを無効化して再パックします。オンライン／ローカルのどちらも、ビルド許可、共有依存関係診断、必要な隔離を通過します。旧 node_modules や資格情報を含む不明な依存 URL は直接実行しません。

<p align="center">
  <img src="./assets/readme/imported-plugin-restore-zh.png" width="900" alt="インポート後のプラグイン出所確認とローカル復元">
  <br><sub>プラグインの出所状態、オンライン復元、安全なローカル復元</sub>
</p>

## 強化された診断

第三者プラグインは Host と同じ Node.js プロセスおよび Cordis サービスグラフを共有します。推移依存関係、pnpm のリンク方式、古い Loader エントリだけでも、設定画面が開く前に空のツール呼び出し、.prepare エラー、プラグイン一覧消失を引き起こせます。

そのため診断は通常のプラグインではなく、Profile の構成・起動層で実行されます。第三者コードの実行前に manifest、pnpm-lock.yaml、Workspace 設定、Bundle 順序、実際の依存グラフ、同梱 Host ランタイムを読み取ります。

Cordis の Context、Service、Symbol はバージョン番号だけでなく物理モジュールの同一性に依存します。同じバージョンでも別 real path にある @deepseek-ai/cordis や dsh-tools は別インスタンスです。診断は各ルートプラグインから直接・間接依存をたどり、宣言範囲と解決先を比較します。正しい peerDependencies は誤検出しません。

確認対象には、共有 Host の単一性、Profile とロックファイルの整合性、孤立／重複 Bundle、幽霊プラグイン、pnpm Store、未完了インストール、allowBuilds、prepare 許可、peer 重複排除設定が含まれます。

修復順序は **読み取り専用検査 → 無損失の収束 → 必要な依存だけ再インストール → real path 再検査 → 必要時に隔離** です。健全な Profile では pnpm を実行しません。互換範囲では管理対象の link: override を使いますが、minimumReleaseAge や明示的な allowBuilds: false を緩めません。pnpm が成功しても、物理パスと Loader 状態の再検査に通るまで起動しません。

安全に統一できない場合は、原因となるルートプラグインだけを活動依存と Bundle 順序から外し、元の仕様、バージョン、依存経路、理由、時刻を保存します。物理パッケージが Profile から除かれ、共有 Host が標準コピーを指し、再検査に成功して初めて隔離完了です。つまり、問題を推測で再インストールするのではなく、「誰が、なぜ失敗し、どの保護を適用し、次に何をすべきか」を示します。

## テキスト選択と右クリックメニュー

会話、ツール出力、詳細、ファイルプレビューなどの読み取り専用テキストを選択すると横型ツールバーが表示され、選択部分を右クリックすると縦型の角丸メニューが表示されます。

- **コピー**：選択テキストをクリップボードへコピー。
- **新しい会話で質問**：現在のワークスペースに新しい会話を作り、質問文を入力しますが自動送信しません。
- **現在の会話へ追加**：既存の下書きを上書きせず Markdown 引用として追記。

現在の会話が確認や選択を待っていて入力欄が無効な場合、「現在の会話へ追加」は非表示になります。

<p align="center">
  <strong>選択ツールバー</strong><br>
  <img src="./assets/readme/selection-toolbar-zh.png" width="900" alt="選択後の横型ツールバー">
</p>

<p align="center">
  <strong>右クリックメニュー</strong><br>
  <img src="./assets/readme/selection-context-menu-zh.png" width="900" alt="選択テキストの縦型右クリックメニュー">
</p>

## デスクトップ体験

- トレイ常駐と完全終了、macOS メニューバー／Windows・Linux トレイからのクイック再起動。
- 起動失敗・復旧通知、固定 Harness ログへの入口、15 秒以上の起動待機表示。
- 一般設定から Release を確認・ダウンロードし、SHA256SUMS を検証してインストーラーを開く機能。
- 同梱 dsh コマンドのシステム PATH への安全な登録と削除。
- Windows／Linux のカスタムタイトルバー、macOS のネイティブ挙動、制限付きクリップボード書き込み。
- ローカル検証済みアーカイブとして Plugin Marketplace、dsh-im、dsh-skill-picker、dsh-font、Better Sidebar、dsh-pocket を提供。アンインストール後は自動で戻しません。
- Codex と Claude Code は同梱せず、設定 → 外部ツールから必要な公式パッケージだけをオンライン導入します。

## テーマと背景

システム、ライト、ダーク、8 種類の製品テーマ、8 枚の内蔵イラスト、ローカル PNG/JPEG/WebP 背景に対応します。カスタム画像はローカルブラウザストレージだけに保存され、モデルへ送信されません。

<table>
  <tr><th width="50%">テーマ</th><th width="50%">背景</th></tr>
  <tr>
    <td align="center"><img src="./assets/readme/theme-settings-en.png" alt="テーマ設定"></td>
    <td align="center"><img src="./assets/readme/background-settings-en.png" alt="背景設定"></td>
  </tr>
</table>

## ダウンロードとインストール

[GitHub Releases](https://github.com/flaqai/open-deepseek-harness-desktop/releases) から対象パッケージを入手してください。

| OS | アーキテクチャ | パッケージ |
| --- | --- | --- |
| macOS | Apple Silicon arm64 | DeepSeek-Harness-macos-arm64.dmg |
| macOS | Intel x64 | DeepSeek-Harness-macos-x64.dmg |
| Windows | x64 | DeepSeek-Harness-windows-x64.exe |
| Linux | Debian / Ubuntu x64 | DeepSeek-Harness-linux-x64.deb |
| Linux | Fedora / RHEL x64 | DeepSeek-Harness-linux-x64.rpm |

SHA256SUMS で完全性を確認してください。macOS 版は ad-hoc 署名で未公証です。Gatekeeper が阻止した場合は「システム設定 → プライバシーとセキュリティ → このまま開く」を使用してください。Windows では未署名・新規公開アプリの評価警告が出る場合があります。

## ソースから実行

Node.js ^22.19.0 または 24 以降と pnpm 11.7.0 を用意し、次を実行します。

    git clone https://github.com/flaqai/open-deepseek-harness-desktop.git
    cd open-deepseek-harness-desktop
    pnpm install
    pnpm run build
    pnpm run dev:desktop

Web のみの場合は pnpm dsh web を使用します。ソース Web は現在の DSH_HOME（未設定なら通常 ~/.dsh）を使用します。インストール版 Desktop は初回起動で選んだディレクトリを使用するため、データ共有の有無はその選択で決まります。

## セキュリティ、コミュニティ、ライセンス

Renderer は Node 統合を無効化し、context isolation と Chromium sandbox を有効化しています。ナビゲーションは Harness の正確な loopback origin に限定され、任意コマンド、ファイル、URL を扱う汎用 bridge は提供しません。API Key は Harness の資格情報サービスで管理してください。

- [ユーザーガイド](docs/user/guide/index.md)、[プラグインガイド](docs/user/develop/framework/index.md)、[Skill ガイド](docs/subsystems/skills.md)
- 不具合と提案：[GitHub Issues](https://github.com/flaqai/open-deepseek-harness-desktop/issues)
- 上流：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

Open DeepSeek Harness Desktop は [MIT License](LICENSE) で公開されています。第三者ライセンスは [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

## Friends

- [DSHFind](https://dshfind.com/zh) — DeepSeek Harness の中国語学習・共有コミュニティ。
