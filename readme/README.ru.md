<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Язык:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文 (简体)</a> ·
  <a href="README.th.md">ไทย</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.ru.md"><strong>Русский</strong></a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

# Clew 🪽

Clew — это неофициальный CLI, ориентированный на исследования, для разработки программного обеспечения с помощью ИИ.

Этот проект представляет собой реконструкцию и расширение исходного кода, предназначенную для локальной разработки, отладки, самостоятельного хостинга и выбора поставщика ИИ.

> **Отказ от ответственности:** Anthropic, Claude и Claude Code являются товарными знаками соответствующих владельцев. Пожалуйста, прочтите [LICENSE.md](../LICENSE.md) перед использованием, модификацией, распространением или развертыванием этого репозитория.

## Возможности

- **Маршрутизация между несколькими провайдерами** — Поддержка Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot и других
- **Смена модели во время выполнения** — Используйте `/model` для смены модели или провайдера во время сессии
- **Рабочие процессы на основе инструментов** — Чтение/запись файлов, команды shell, LSP, инструменты MCP, автоматизация браузера
- **Хуки плагинов** — Перехват промптов, выполнения shell, вызовов инструментов и т.д.
- **Динамические навыки** — Загрузка навыков из проекта и `.claude/skills/`
- **Ревью кода** — `/code-review --fix` и `/simplify`
- **Агенты и супервизор** — Фоновые агенты и многошаговые рабочие процессы
- **Запланированные задачи** — Создание одноразовых или повторяющихся задач с помощью `/task`
- **Сессии и режим моста** — Для удаленных рабочих процессов

## Быстрый старт

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

Режим разработки: `bun run dev`

## Системные требования

- Bun 1.3+, Node.js 18+, Git
- Windows / macOS / Linux / WSL2
- API-ключ хотя бы от одного поддерживаемого провайдера

## Лицензия

См. [LICENSE.md](../LICENSE.md).
