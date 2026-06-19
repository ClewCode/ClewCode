<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Idioma:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文</a> ·
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

Clew é uma CLI não oficial voltada para pesquisa, para desenvolvimento de software assistido por IA.

É um projeto de reconstrução e extensão a partir do código-fonte, projetado para desenvolvimento local, depuração, fluxos de trabalho auto-hospedados e liberdade de escolha de provedor.

Este repositório não é um produto oficial, distribuição, projeto parceiro ou implementação suportada.

> **Aviso legal:** Este projeto não é afiliado, endossado, patrocinado ou aprovado por terceiros. Leia [LICENSE.md](../LICENSE.md) antes de usar, modificar, redistribuir ou implantar este repositório.

## O que este projeto oferece

| Área                   | Descrição                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CLI compilável         | Aplicativo de terminal Bun/TypeScript que pode ser compilado, testado, inspecionado e modificado localmente              |
| Roteamento multiprovedor | Suporte a vários provedores de IA através de adaptadores e comandos de seleção de modelo                                |
| Ferramentas para desenvolvedores | Comandos para inspeção de contexto, revisão de código, simplificação, pesquisa, plugins, MCP, LSP, sessões e fluxos de trabalho em segundo plano |
| Extensibilidade local  | Suporte a plugins, hooks, skills, ferramentas personalizadas, tarefas agendadas e configuração em nível de projeto       |
| Uso em pesquisa        | Base de código transparente para estudar arquitetura de agentes de codificação IA, UX de terminal, roteamento de provedores e execução de ferramentas |

## Funcionalidades

Clew executa diretamente no seu terminal. Pode inspecionar e editar bases de código locais, executar comandos shell com permissões, alternar provedores de modelo e coordenar fluxos de trabalho de agentes de longa duração.

Principais recursos:

* **Roteamento de IA multiprovedor** — Suporta Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot e endpoints compatíveis com OpenAI
* **Alternância de modelo em tempo real** — Use `/model` para alternar modelo ou provedor durante uma sessão
* **Fluxos de trabalho orientados a ferramentas** — Leia, pesquise, edite e escreva arquivos; execute comandos shell; consulte LSP; execute ferramentas MCP; integre automação de navegador
* **Hooks de plugins** — Intercepte prompts, execução shell, chamadas de ferramentas, exibição de mensagens, início de sessão e ações de edição de arquivos
* **Skills dinâmicas** — Carregue skills do projeto e de `.claude/skills/`
* **Ferramentas de revisão de código** — Use `/code-review --fix` para verificar e aplicar alterações, `/simplify` para limpar código
* **Revisão automática Guardian** — `/guardian` roteia solicitações de permissão para um revisor LLM com disjuntor
* **Gerenciamento de PR** — `/pr create`, `list`, `view`, `review`, `merge`, `status`
* **Controle remoto independente de provedor** — `/remote` para compartilhamento CLI via WebSocket
* **Seletor de modelos** — Seleção de modelo global ou apenas para a sessão
* **Mercado de plugins** — Suporte `skipLfs` para fontes de plugins
* **Pesquisa local** — Use `/research <query>` para pesquisa com scraping web local
* **Agentes e supervisor** — Gerencie agentes em segundo plano, fluxos de trabalho em várias etapas, resumos, status de tarefas, aprovações e estado da sessão
* **Comandos shell em segundo plano** — Execute comandos longos com `!bg <command>`
* **Tarefas agendadas** — Crie tarefas únicas ou recorrentes com `/task`
* **Sessões e modo bridge** — Salve, restaure e conecte sessões para fluxos de trabalho remotos

## Início rápido

### Instalação global

```bash
npm install -g clew-code
```

Ou:

```bash
bun install -g clew-code
```

Execute a CLI no diretório do projeto:

```bash
clew
```

> O lançador global requer Bun instalado no sistema

### Executar a partir do código-fonte

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode

bun install
bun run build
bun run start
```

Modo de desenvolvimento:

```bash
bun run dev
```

## Requisitos do sistema

- Bun 1.3 ou superior
- Node.js 18 ou superior
- Git
- Windows, macOS, Linux ou WSL2
- Chave de API de pelo menos um provedor compatível (não necessário ao usar provedor local como Ollama)

## Configuração de provedores

Defina as chaves dos provedores no shell ou em um arquivo `.env`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

Altere modelo/provedor durante uma sessão:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

Documentação de provedores:

```text
docs/providers.html
```

## Comandos comuns

```text
/model        Alterar modelo ou provedor
/taste        Abrir menu de preferências de aprendizado
/status       Ver status do provedor, sessão e contexto
/doctor       Executar diagnóstico
/context      Inspecionar uso de contexto
/compact      Comprimir histórico de conversa
/mcp          Gerenciar servidores MCP
/code-review  Revisar alterações de código
/simplify     Revisão focada em limpeza
/plugin       Gerenciar plugins e hooks
/bridge       Configurar modo bridge
/agent        Gerenciar fluxos de trabalho de agentes em segundo plano
/daemon       Iniciar painel do daemon autônomo
/task         Criar ou gerenciar tarefas agendadas
```

Digite `/` na CLI para ver a lista completa de comandos.

## Tarefas agendadas

O sistema de tarefas agendadas está disponível através de `/task`.

```text
/task
```

Exemplos:

```text
/task
Name: Verificação do servidor
Schedule: Daily
Time: 20:00
Prompt: Verificar o status dos servidores locais
Storage: Durable
```

```text
/task
Name: Lembrete de commit
Schedule: In N minutes
Delay: 10
Prompt: Lembrar-me de fazer commit do código
Storage: Session-only
```

Comportamento das tarefas:

* Tarefas duráveis são salvas em `.claude/scheduled_tasks.json`
* Tarefas apenas de sessão são executadas apenas durante a sessão ativa
* Tarefas recorrentes usam sintaxe cron padrão de 5 campos
* Tarefas únicas são removidas após a execução
* O fuso horário local da máquina é usado para execução agendada

## Taste

Taste é um runtime de aprendizado de preferências local. Ele aprende com sinais de aceitação, rejeição, edição, teste, lint e regras manuais. Combina regras simbólicas, pontuação semântica de preferência e otimização contextual bandit para adaptar o Clew ao seu estilo de codificação. Não faz fine-tuning do LLM base.

```text
/taste                Abrir menu interativo
/taste learn <rule>   Adicionar uma regra manual
/taste forget <id>    Remover uma regra
/taste profile        Mostrar todas as regras
/taste events         Mostrar eventos recentes
/taste decay          Aplicar decaimento de confiança
/taste eval           Executar autoavaliação
/taste export         Exportar regras de alta confiança
/taste import <file>  Importar regras de arquivo
/taste on             Ativar Taste
/taste off            Desativar Taste
```

### Capacidades principais

- **Menu interativo** — Diálogo navegável com setas com 11 ações, Spinner para operações assíncronas
- **Validação de edição** — Escaneia edições durante solicitações de permissão, alerta sobre violações de regras aprendidas
- **Recarga ao vivo de configuração** — Assina alterações do `settings.json` via `subscribeToSettingsChanges()`
- **Linha de status** — `ⓘ taste: N rules` exibido no PromptInputFooter
- **Injeção de prompt** — Injeta bloco XML `<clew_taste>` com até 8 regras relevantes no prompt do sistema
- **Coleta de sinais** — Sinais fire-and-forget do PermissionContext e execução de ferramentas
- **Mecanismo de decaimento** — Redução gradual de confiança para regras não utilizadas (baseado em meia-vida, padrão 30 dias)

Veja [docs/taste.html](../docs/taste.html) para documentação completa.

## Desenvolvimento

```bash
bun run dev              # Iniciar modo de desenvolvimento
bun run start            # Executar o CLI a partir da fonte
bun run build            # Compilar para dist/
bun test                 # Executar testes
bun x tsc --noEmit       # Verificação de tipos
bun run lint:check       # Verificar regras Biome lint
bun run format:check     # Verificar formatação Biome
bun run check:ci         # Executar validação Biome CI
```

Utilitários de desenvolvimento:

```bash
bun run preload <module>     # Pré-carregar contexto do módulo
bun run session <command>    # Salvar, listar ou restaurar contexto de sessão
bun run codegraph            # Gerar gráficos de dependência de módulos
bun run ast-grep -- <args>   # Executar busca ou reescrita AST estrutural
```

## Estrutura do projeto

```text
src/
├── main.tsx              # Bootstrap da UI do terminal e loop principal
├── query.ts              # Processamento de consultas e lógica de prompt do sistema
├── QueryEngine.ts        # Orquestração de consultas, cache, deduplicação e limites de taxa
├── agentRuntime/         # Orquestração de agentes e armazenamentos de execução persistentes
├── commands/             # Implementações de comandos slash
├── tools/                # Ferramentas de desenvolvimento integradas
├── services/
│   ├── ai/               # Gerenciador de provedores, adaptadores, normalizadores e providers.json
│   ├── mcp/              # Clientes Model Context Protocol
│   ├── plugins/          # Hooks e interceptadores do ciclo de vida de plugins
│   ├── tools/            # Serviço de execução de ferramentas
│   ├── lsp/              # Integração Language Server Protocol
│   ├── Supervisor/       # Supervisor de agentes em segundo plano
│   └── SessionMemory/    # Memória de sessão persistente
├── skills/               # Carregador dinâmico de skills
├── cli/                  # Contextos da UI do terminal
├── components/           # Componentes da UI do terminal
├── bridge/               # Ponte WebSocket
├── coordinator/          # Coordenador multi-agente
├── keybindings/          # Mapeamentos de atalhos de teclado
├── state/                # Stores reativos
└── vim/                  # Modo de navegação estilo Vim
```

## Arquitetura

```text
Terminal UI
  -> Registro de comandos e atalhos de teclado
  -> Gerenciador de provedores e adaptadores de IA
  -> Mecanismo de consultas e loops de streaming
  -> Serviço de execução de ferramentas
  -> Plugins, MCP, LSP, agentes, memória de sessão e ponte
```

## Documentação

* [Instalação](../docs/installation.html)
* [Início rápido](../docs/quick-start.html)
* [Configuração](../docs/configuration.html)
* [Provedores de IA](../docs/providers.html)
* [Modelos](../docs/models.html)
* [Comandos](../docs/commands.html)
* [Ferramentas](../docs/tools.html)
* [Plugins](../docs/plugins.html)
* [Skills](../docs/skills.html)
* [Arquitetura](../docs/architecture.html)
* [Modelo de permissão](../docs/permission-model.html)
* [Modo Bridge](../docs/features/bridge-mode.html)
* [Solução de problemas](../docs/troubleshooting.html)
* [Avaliações](../docs/features/evals.html)
* [Taste](../docs/taste.html)

## Depuração

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## Notas de plataforma

### Windows

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

Um binário `ripgrep` pré-compilado para Windows pode estar incluído em:

```text
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## Contribuição

Leia estes arquivos antes de contribuir:

* [CONTRIBUTING.md](../CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
* [SECURITY.md](../SECURITY.md)
* [LICENSE.md](../LICENSE.md)

Não envie código proprietário, fonte copiada, material vazado, credenciais, chaves privadas ou conteúdo que você não tem o direito de licenciar.

## Segurança

Não abra issues públicas para vulnerabilidades de segurança.

Use o processo de relato privado descrito em [SECURITY.md](../SECURITY.md).


## Changelog

<details>
<summary><strong>0.2.4 — 2026-06-08</strong></summary>

- **Peer-to-peer** — LAN discovery, task delegation, 14 AI tools
- **Taste tools** — taste_learn, taste_forget, taste_profile, taste_suggest
- **Autonomous agents** — agent loop, supervisor, task queue, Loop Lock
- **Workflow Rainbow** — per-character gradient

</details>

[Full changelog](../CHANGELOG.md)

## Licença

Consulte [LICENSE.md](../LICENSE.md).

Apenas modificações e adições originais criadas pelo contribuidor são licenciadas conforme descrito em `LICENSE.md`.
