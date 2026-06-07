<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>言語:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文 (简体)</a> ·
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

> **免責事項:** Anthropic、Claude、Claude Code は各所有者の商標です。このリポジトリを使用、変更、再配布、またはデプロイする前に [LICENSE.md](../LICENSE.md) をお読みください。

## 機能

- **マルチプロバイダ AI ルーティング** — Anthropic、OpenAI、Google Gemini、OpenRouter、Ollama、GitHub Copilot などをサポート
- **実行時モデル切り替え** — セッション中に `/model` でモデルやプロバイダを切り替え
- **ツール駆動ワークフロー** — ファイル操作、シェルコマンド、LSP、MCP ツール、ブラウザ自動化
- **プラグインフック** — プロンプト、シェル実行、ツール呼び出しなどにフック
- **動的スキル** — プロジェクト内および `.claude/skills/` からスキルを読み込み
- **コードレビュー** — `/code-review --fix` と `/simplify`
- **エージェントとスーパーバイザー** — バックグラウンドエージェントとマルチステップワークフロー
- **スケジュールタスク** — `/task` で単発または定期タスク
- **セッションとブリッジモード** — リモートワークフロー用

## クイックスタート

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

開発モード: `bun run dev`

## システム要件

- Bun 1.3+、Node.js 18+、Git
- Windows / macOS / Linux / WSL2
- サポート対象プロバイダの API キー

## ライセンス

[LICENSE.md](../LICENSE.md) をご覧ください。
