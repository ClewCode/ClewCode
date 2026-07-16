<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>言語:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文</a> ·
  <a href="README.th.md">ไทย</a> ·
  <a href="README.ja.md"><strong>日本語</strong></a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

# Clew 🪽

Clew は、AI を用いたソフトウェア開発のための非公式の研究指向 CLI です。

このプロジェクトは、ローカル開発、デバッグ、セルフホストワークフロー、プロバイダ選択のために設計された、ソースからの再構築および拡張プロジェクトです。

このリポジトリは、公式製品、配布物、パートナープロジェクト、またはサポート対象の実装ではありません。

> **免責事項:** このプロジェクトはいかなる第三者とも提携、承認、後援、または承認されていません。このリポジトリを使用、変更、再配布、またはデプロイする前に [LICENSE.md](../LICENSE.md) をお読みください。

## このプロジェクトの提供内容

| 分野                   | 説明                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ソースビルド CLI       | ローカルでビルド、テスト、検査、変更が可能な Bun/TypeScript ターミナルアプリケーション                                     |
| マルチプロバイダルーティング | プロバイダアダプターとモデル選択コマンドによる複数 AI プロバイダのサポート                                                    |
| 開発者ツール            | コンテキスト検査、コードレビュー、簡略化、リサーチ、プラグイン、MCP、LSP、セッション、バックグラウンドワークフロー用のコマンド      |
| ローカル拡張性           | プラグイン、フック、スキル、カスタムツール、スケジュールタスク、プロジェクトレベル設定のサポート                                          |
| 研究用途               | AI コーディングエージェントのアーキテクチャ、ターミナル UX、プロバイダルーティング、ツール実行の研究のための透過的なコードベース        |

## 機能

Clew はターミナル上で直接動作します。ローカルコードベースの検査・編集、権限に基づくシェルコマンドの実行、モデルプロバイダの切り替え、長期エージェントワークフローの調整が可能です。

主な機能:

* **マルチプロバイダ AI ルーティング** — Anthropic、OpenAI、Google Gemini、OpenRouter、Ollama、GitHub Copilot、OpenAI 互換エンドポイントをサポート
* **実行時モデル切り替え** — セッション中に `/model` を使用してモデルやプロバイダを切り替え
* **ツール駆動ワークフロー** — ファイルの読み取り、検索、編集、書き込み、シェルコマンドの実行、LSP のクエリ、MCP ツールの実行、ブラウザ自動化の統合
* **プラグインフック** — プロンプト、シェル実行、ツール呼び出し、メッセージ表示、セッション開始、ファイル編集アクションにフック
* **動的スキル** — プロジェクト内および `.clew/skills/` からのスキル読み込み
* **コードレビューツール** — `/code-review --fix` で変更コードをチェックして適用、`/simplify` でクリーンアップ
* **ガーディアン自動レビュー** — `/guardian` が許可リクエストをサーキットブレーカー付き LLM レビューアにルーティング
* **PR 管理** — `/pr create`、`list`、`view`、`review`、`merge`、`status`
* **プロバイダ非依存リモートコントロール** — `/remote` で WebSocket ベースの CLI 共有
* **モデルピッカー** — グローバルまたはセッション限定でのモデル選択
* **プラグインマーケットプレイス** — プラグインソースの `skipLfs` サポート
* **ローカルリサーチ** — 設定が有効な場合、`/research <query>` でローカルウェブスクレイピング付きリサーチワークフロー
* **エージェントとスーパーバイザー** — バックグラウンドエージェント、マルチステップワークフロー、サマリー、タスク状態、承認、セッション状態の管理
* **バックグラウンドシェルコマンド** — `!bg <command>` で長時間コマンドを実行
* **スケジュールタスク** — `/task` で単発または定期タスクを作成
* **セッションとブリッジモード** — リモートワークフロー用のセッション保存、復元、接続

## クイックスタート

### グローバルインストール

```bash
npm install -g clew-code
```

または:

```bash
bun install -g clew-code
```

プロジェクトディレクトリで CLI を実行:

```bash
clew
```

> グローバルランチャーを使用するには、システムに Bun がインストールされている必要があります

### ソースから実行

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode

bun install
bun run build
bun run start
```

開発モード:

```bash
bun run dev
```

## システム要件

- Bun 1.3 以上
- Node.js 18 以上
- Git
- Windows、macOS、Linux、または WSL2
- サポートされているプロバイダの API キー（Ollama などのローカルプロバイダを使用する場合は不要）

## プロバイダ設定

プロバイダキーはシェルまたは `.env` ファイルで設定:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

セッション中のモデル/プロバイダ切り替え:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

プロバイダドキュメント:

```text
docs/providers.html
```

## よく使うコマンド

```text
/model        モデルまたはプロバイダを切り替え
/taste        学習設定メニューを開く
/status       プロバイダ、セッション、コンテキストの状態を表示
/doctor       診断を実行
/context      コンテキスト使用量を検査
/compact      会話履歴を圧縮
/mcp          MCP サーバーを管理
/code-review  変更コードをレビュー
/simplify     クリーンアップ重視のレビュー
/plugin       プラグインとフックを管理
/bridge       ブリッジモードを設定
/agent        バックグラウンドエージェントワークフローを管理
/daemon       自律型デーモンダッシュボードを起動
/task         スケジュールタスクを作成または管理
```

CLI で `/` を入力すると全コマンド一覧が表示されます。

## スケジュールタスク

スケジュールタスクシステムは `/task` で利用可能です。

```text
/task
```

例:

```text
/task
Name: サーバーチェック
Schedule: Daily
Time: 20:00
Prompt: ローカルサーバーの状態を確認
Storage: Durable
```

```text
/task
Name: コミットリマインダー
Schedule: In N minutes
Delay: 10
Prompt: コードをコミットするようリマインド
Storage: Session-only
```

タスクの動作:

* Durable タスクは `.clew/scheduled_tasks.json` に保存
* Session-only タスクはアクティブセッション中のみ実行
* 定期タスクは標準の 5 フィールド cron 構文を使用
* 単発タスクは実行後に削除
* スケジュール実行にはローカルマシンのタイムゾーンを使用

## Taste

Taste はローカルファーストの嗜好学習ランタイムです。accept、reject、edit、test、lint、手動ルールから学習します。シンボリックルール、セマンティック嗜好スコアリング、コンテキストバンディット最適化を組み合わせて、Clew をコーディングスタイルに適応させます。ベース LLM のファインチューニングは行いません。

```text
/taste               対話型メニューを開く
/taste learn <rule>  手動ルールを追加
/taste forget <id>   ルールを削除
/taste profile       全ルールを表示
/taste events        最近のイベントを表示
/taste decay         信頼度減衰を適用
/taste eval          自己評価を実行
/taste export        高信頼度ルールをエクスポート
/taste import <file> ファイルからルールをインポート
/taste on            Taste を有効化
/taste off           Taste を無効化
```

### 主な機能

- **対話型メニュー** — 矢印キーで操作可能な 11 アクションのダイアログ、非同期処理用 Spinner
- **編集検証** — パーミッションリクエスト中に編集をスキャン、学習ルール違反を警告
- **設定のライブリロード** — `subscribeToSettingsChanges()` で `settings.json` の変更を購読
- **ステータスライン** — PromptInputFooter に `ⓘ taste: N rules` を表示
- **プロンプトインジェクション** — システムプロンプトに最大 8 件の関連ルールを含む `<clew_taste>` XML ブロックを注入
- **シグナル収集** — PermissionContext とツール実行からの fire-and-forget シグナル
- **減衰エンジン** — 未使用ルールの段階的信頼度低減（半減期ベース、デフォルト 30 日）

詳細は [docs/taste.html](../docs/taste.html) をご覧ください。

## 開発

```bash
bun run dev              # 開発モードを開始
bun run start            # CLI をソースから実行
bun run build            # dist/ にビルド
bun test                 # テストを実行
bun x tsc --noEmit       # 型チェック
bun run lint:check       # Biome lint をチェック
bun run format:check     # Biome フォーマットをチェック
bun run check:ci         # Biome CI 検証を実行
```

開発ユーティリティ:

```bash
bun run preload <module>     # モジュールコンテキストをプリロード
bun run session <command>    # セッションコンテキストを保存、一覧表示、復元
bun run ast-grep -- <args>   # 構造的 AST 検索または書き換えを実行
```

## プロジェクト構造

```text
src/
├── main.tsx              # Terminal UI ブートストラップとメインループ
├── query.ts              # クエリ処理とシステムプロンプトロジック
├── QueryEngine.ts        # クエリオーケストレーション、キャッシュ、重複排除、レート制限
├── agentRuntime/         # エージェントオーケストレーションと永続ランストア
├── commands/             # スラッシュコマンドの実装
├── tools/                # ビルトイン開発ツール
├── services/
│   ├── ai/               # プロバイダマネージャー、アダプター、正規化、providers.json
│   ├── mcp/              # Model Context Protocol クライアント
│   ├── plugins/          # プラグインライフサイクルフックとインターセプター
│   ├── tools/            # ツール実行サービス
│   ├── lsp/              # Language Server Protocol 統合
│   ├── Supervisor/       # バックグラウンドエージェントスーパーバイザー
│   └── SessionMemory/    # 永続セッションメモリ
├── skills/               # 動的スキルローダー
├── cli/                  # Terminal UI コンテキスト
├── components/           # Terminal UI コンポーネント
├── bridge/               # WebSocket ブリッジ
├── coordinator/          # マルチエージェントコーディネーター
├── keybindings/          # キーボードショートカットマッピング
├── state/                # リアクティブストア
└── vim/                  # Vim ライクナビゲーションモード
```

## アーキテクチャ

```text
Terminal UI
  -> コマンドレジストリとキーバインディング
  -> プロバイダマネージャーと AI アダプター
  -> クエリエンジンとストリーミングループ
  -> ツール実行サービス
  -> プラグイン、MCP、LSP、エージェント、セッションメモリ、ブリッジ
```

## ドキュメント

* [インストール](../docs/installation.html)
* [クイックスタート](../docs/quick-start.html)
* [設定](../docs/configuration.html)
* [AI プロバイダ](../docs/providers.html)
* [モデル](../docs/models.html)
* [コマンド](../docs/commands.html)
* [ツール](../docs/tools.html)
* [プラグイン](../docs/plugins.html)
* [スキル](../docs/skills.html)
* [アーキテクチャ](../docs/architecture.html)
* [パーミッションモデル](../docs/permission-model.html)
* [ブリッジモード](../docs/features/bridge-mode.html)
* [トラブルシューティング](../docs/troubleshooting.html)
* [評価](../docs/features/evals.html)
* [Taste](../docs/taste.html)

## デバッグ

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## プラットフォーム注意事項

### Windows

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

プリコンパイル済みの `ripgrep` バイナリは以下にバンドルされている場合があります:

```text
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## コントリビューション

コントリビュート前に以下のファイルをお読みください:

* [CONTRIBUTING.md](../CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
* [SECURITY.md](../SECURITY.md)
* [LICENSE.md](../LICENSE.md)

プロプライエタリコード、コピーされたソース、リークされたマテリアル、認証情報、プライベートキー、またはライセンス権限のないコンテンツを提出しないでください。

## セキュリティ

セキュリティ脆弱性は公開 issue で報告しないでください。

[SECURITY.md](../SECURITY.md) に記載されている非公開報告プロセスを使用してください。


## Changelog

<details>
<summary><strong>0.2.4 — 2026-06-08</strong></summary>

- **Peer-to-peer** — LAN discovery, task delegation, 14 AI tools
- **Taste tools** — taste_learn, taste_forget, taste_profile, taste_suggest
- **Autonomous agents** — agent loop, supervisor, task queue, Loop Lock
- **Workflow Rainbow** — per-character gradient

</details>

[Full changelog](../CHANGELOG.md)

## ライセンス

[LICENSE.md](../LICENSE.md) をご覧ください。

コントリビューターが作成した修正および追加のみが `LICENSE.md` に記載されたライセンスの対象となります。
