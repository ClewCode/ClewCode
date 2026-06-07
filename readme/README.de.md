<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Sprache:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文 (简体)</a> ·
  <a href="README.th.md">ไทย</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md"><strong>Deutsch</strong></a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

# Clew 🪽

Clew ist ein inoffizielles, forschungsorientiertes CLI für KI-gestützte Softwareentwicklung.

Dieses Projekt ist eine quellcodebasierte Rekonstruktion und Erweiterung, entwickelt für lokale Entwicklung, Debugging, selbstgehostete Workflows und die freie Wahl des KI-Anbieters.

> **Haftungsausschluss:** Anthropic, Claude und Claude Code sind Marken ihrer jeweiligen Eigentümer. Bitte lesen Sie [LICENSE.md](../LICENSE.md), bevor Sie dieses Repository verwenden, modifizieren, weiterverteilen oder bereitstellen.

## Funktionen

- **Multi-Anbieter-Routing** — Unterstützt Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot u. a.
- **Laufzeit-Modellwechsel** — Verwenden Sie `/model`, um während einer Sitzung das Modell oder den Anbieter zu wechseln
- **Tool-gesteuerte Workflows** — Dateien lesen/schreiben, Shell-Befehle, LSP, MCP-Tools, Browser-Automatisierung
- **Plugin-Hooks** — Einhaken in Prompts, Shell-Ausführung, Tool-Aufrufe usw.
- **Dynamische Fähigkeiten** — Laden Sie Fähigkeiten aus dem Projekt und `.claude/skills/`
- **Code-Review** — `/code-review --fix` und `/simplify`
- **Agenten und Supervisor** — Hintergrundagenten und mehrstufige Workflows
- **Geplante Aufgaben** — Erstellen Sie einmalige oder wiederkehrende Aufgaben mit `/task`
- **Sitzungen und Bridge-Modus** — Für Remote-Workflows

## Schnellstart

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

Entwicklungsmodus: `bun run dev`

## Systemanforderungen

- Bun 1.3+, Node.js 18+, Git
- Windows / macOS / Linux / WSL2
- API-Schlüssel von mindestens einem unterstützten Anbieter

## Lizenz

Siehe [LICENSE.md](../LICENSE.md).
