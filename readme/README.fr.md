<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Langue:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文 (简体)</a> ·
  <a href="README.th.md">ไทย</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md"><strong>Français</strong></a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

# Clew 🪽

Clew est un CLI non officiel orienté recherche pour le développement de logiciels assisté par IA.

Ce projet est une reconstruction et une extension à partir des sources, conçue pour le développement local, le débogage, les flux de travail auto-hébergés et le choix du fournisseur d'IA.

> **Avertissement:** Anthropic, Claude et Claude Code sont des marques commerciales de leurs propriétaires respectifs. Veuillez lire [LICENSE.md](../LICENSE.md) avant d'utiliser, modifier, redistribuer ou déployer ce dépôt.

## Fonctionnalités

- **Routage multi-fournisseur** — Prend en charge Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot, etc.
- **Changement de modèle à l'exécution** — Utilisez `/model` pour changer de modèle ou de fournisseur pendant une session
- **Flux de travail pilotés par les outils** — Lecture/écriture de fichiers, commandes shell, LSP, outils MCP, automatisation du navigateur
- **Hooks de plugins** — Interception des invites, exécution shell, appels d'outils, etc.
- **Compétences dynamiques** — Chargez des compétences depuis le projet et `.claude/skills/`
- **Révision de code** — `/code-review --fix` et `/simplify`
- **Agents et superviseur** — Agents en arrière-plan et flux de travail multi-étapes
- **Tâches planifiées** — Créez des tâches ponctuelles ou récurrentes avec `/task`
- **Mode session et pont** — Pour les flux de travail à distance

## Démarrage rapide

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

Mode développement : `bun run dev`

## Configuration requise

- Bun 1.3+, Node.js 18+, Git
- Windows / macOS / Linux / WSL2
- Clé API d'au moins un fournisseur pris en charge

## Licence

Consultez [LICENSE.md](../LICENSE.md).
