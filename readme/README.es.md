<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Idioma:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文 (简体)</a> ·
  <a href="README.th.md">ไทย</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md"><strong>Español</strong></a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

# Clew 🪽

Clew es una CLI no oficial orientada a la investigación para el desarrollo de software asistido por IA.

Este proyecto es una reconstrucción y extensión desde el código fuente, diseñada para desarrollo local, depuración, flujos de trabajo autogestionados y elección de proveedores.

> **Aviso legal:** Anthropic, Claude y Claude Code son marcas comerciales de sus respectivos propietarios. Lea [LICENSE.md](../LICENSE.md) antes de usar, modificar, redistribuir o implementar este repositorio.

## Funcionalidades

- **Enrutamiento multi-proveedor** — Compatible con Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot y más
- **Cambio de modelo en tiempo de ejecución** — Use `/model` para cambiar de modelo o proveedor durante una sesión
- **Flujos de trabajo basados en herramientas** — Lectura/escritura de archivos, comandos de shell, LSP, herramientas MCP, automatización del navegador
- **Hooks de plugins** — Enganche en prompts, ejecución de shell, llamadas a herramientas, etc.
- **Habilidades dinámicas** — Cargue habilidades desde el proyecto y `.claude/skills/`
- **Revisión de código** — `/code-review --fix` y `/simplify`
- **Agentes y supervisor** — Agentes en segundo plano y flujos de trabajo de varios pasos
- **Tareas programadas** — Cree tareas únicas o recurrentes con `/task`
- **Modo sesión y puente** — Para flujos de trabajo remotos

## Inicio rápido

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

Modo desarrollo: `bun run dev`

## Requisitos del sistema

- Bun 1.3+, Node.js 18+, Git
- Windows / macOS / Linux / WSL2
- Clave API de al menos un proveedor compatible

## Licencia

Consulte [LICENSE.md](../LICENSE.md).
