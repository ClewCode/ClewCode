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
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt.md"><strong>Português</strong></a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

# Clew 🪽

Clew é uma CLI não oficial voltada à pesquisa para desenvolvimento de software assistido por IA.

Este projeto é uma reconstrução e extensão a partir do código-fonte, projetada para desenvolvimento local, depuração, fluxos de trabalho auto-hospedados e escolha de provedor.

> **Aviso legal:** Anthropic, Claude e Claude Code são marcas registradas de seus respectivos proprietários. Leia [LICENSE.md](../LICENSE.md) antes de usar, modificar, redistribuir ou implantar este repositório.

## Funcionalidades

- **Roteamento multi-provedor** — Suporta Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot e mais
- **Troca de modelo em tempo de execução** — Use `/model` para trocar de modelo ou provedor durante uma sessão
- **Fluxos de trabalho baseados em ferramentas** — Leitura/gravação de arquivos, comandos shell, LSP, ferramentas MCP, automação de navegador
- **Hooks de plugins** — Intercepte prompts, execução shell, chamadas de ferramentas, etc.
- **Habilidades dinâmicas** — Carregue habilidades do projeto e de `.claude/skills/`
- **Revisão de código** — `/code-review --fix` e `/simplify`
- **Agentes e supervisor** — Agentes em segundo plano e fluxos de trabalho multi-etapas
- **Tarefas agendadas** — Crie tarefas únicas ou recorrentes com `/task`
- **Modo sessão e ponte** — Para fluxos de trabalho remotos

## Início rápido

```bash
git clone https://github.com/JonusNattapong/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

Modo desenvolvimento: `bun run dev`

## Requisitos do sistema

- Bun 1.3+, Node.js 18+, Git
- Windows / macOS / Linux / WSL2
- Chave de API de pelo menos um provedor compatível

## Licença

Consulte [LICENSE.md](../LICENSE.md).
