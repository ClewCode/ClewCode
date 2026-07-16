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

Es un proyecto de reconstrucción y extensión desde el código fuente, diseñado para desarrollo local, depuración, flujos de trabajo autoalojados y libertad de elección de proveedor.

Este repositorio no es un producto oficial, distribución, proyecto asociado ni implementación respaldada.

> **Aviso legal:** Este proyecto no está afiliado, respaldado, patrocinado ni aprobado por ningún tercero. Lea [LICENSE.md](../LICENSE.md) antes de usar, modificar, redistribuir o implementar este repositorio.

## Qué ofrece este proyecto

| Área                   | Descripción                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| CLI compilable         | Aplicación de terminal Bun/TypeScript que se puede compilar, probar, inspeccionar y modificar localmente                  |
| Enrutamiento multiproveedor | Soporte para múltiples proveedores de IA mediante adaptadores y comandos de selección de modelo                          |
| Herramientas para desarrolladores | Comandos para inspección de contexto, revisión de código, simplificación, investigación, plugins, MCP, LSP, sesiones y flujos de trabajo en segundo plano |
| Extensibilidad local   | Soporte para plugins, hooks, skills, herramientas personalizadas, tareas programadas y configuración a nivel de proyecto |
| Uso investigativo      | Código base transparente para estudiar la arquitectura de agentes de codificación de IA, UX de terminal, enrutamiento de proveedores y ejecución de herramientas |

## Funcionalidades

Clew se ejecuta directamente en su terminal. Puede inspeccionar y editar bases de código locales, ejecutar comandos de shell con permisos, cambiar de proveedor de modelo y coordinar flujos de trabajo de agentes de larga duración.

Características principales:

* **Enrutamiento multiproveedor** — Soporta Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot y endpoints compatibles con OpenAI
* **Cambio de modelo en tiempo real** — Use `/model` para cambiar de modelo o proveedor durante una sesión
* **Flujos de trabajo basados en herramientas** — Lea, busque, edite y escriba archivos; ejecute comandos de shell; consulte LSP; ejecute herramientas MCP; integre automatización del navegador
* **Hooks de plugins** — Enganche en prompts, ejecución de shell, llamadas a herramientas, visualización de mensajes, inicio de sesión y acciones de edición de archivos
* **Skills dinámicas** — Cargue skills desde el proyecto y `.clew/skills/`
* **Herramientas de revisión de código** — `/code-review --fix` para revisar y aplicar cambios, `/simplify` para limpiar código
* **Revisión automática Guardian** — `/guardian` enruta solicitudes de permiso a un revisor LLM con interruptor automático
* **Gestión de PR** — `/pr create`, `list`, `view`, `review`, `merge`, `status`
* **Control remoto independiente del proveedor** — `/remote` para compartir CLI basado en WebSocket
* **Selector de modelos** — Selección de modelo global o solo para la sesión
* **Mercado de plugins** — Soporte `skipLfs` para fuentes de plugins
* **Investigación local** — `/research <query>` para investigación con scraping web local cuando esté configurado
* **Agentes y supervisor** — Gestión de agentes en segundo plano, flujos de trabajo multipaso, resúmenes, estado de tareas, aprobaciones y estado de sesión
* **Comandos de shell en segundo plano** — Ejecute comandos largos con `!bg <command>`
* **Tareas programadas** — Cree tareas únicas o recurrentes con `/task`
* **Sesiones y modo bridge** — Guarde, restaure y conecte sesiones para flujos de trabajo remotos

## Inicio rápido

### Instalación global

```bash
npm install -g clew-code
```

O:

```bash
bun install -g clew-code
```

Ejecute la CLI en el directorio del proyecto:

```bash
clew
```

> El lanzador global requiere Bun instalado en el sistema

### Ejecutar desde el código fuente

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode

bun install
bun run build
bun run start
```

Modo desarrollo:

```bash
bun run dev
```

## Requisitos del sistema

- Bun 1.3 o superior
- Node.js 18 o superior
- Git
- Windows, macOS, Linux o WSL2
- Clave API de al menos un proveedor compatible (no necesario si usa un proveedor local como Ollama)

## Configuración de proveedores

Configure las claves de los proveedores en el shell o en un archivo `.env`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

Cambie de modelo/proveedor durante una sesión:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

Documentación de proveedores:

```text
docs/providers.html
```

## Comandos comunes

```text
/model        Cambiar modelo o proveedor
/taste        Abrir menú de preferencias de aprendizaje
/status       Ver estado del proveedor, sesión y contexto
/doctor       Ejecutar diagnóstico
/context      Inspeccionar uso de contexto
/compact      Comprimir historial de conversación
/mcp          Gestionar servidores MCP
/code-review  Revisar cambios de código
/simplify     Revisión enfocada en limpieza
/plugin       Gestionar plugins y hooks
/bridge       Configurar modo bridge
/agent        Gestionar flujos de trabajo de agentes en segundo plano
/daemon       Iniciar panel de daemon autónomo
/task         Crear o gestionar tareas programadas
```

Escriba `/` en la CLI para ver la lista completa de comandos.

## Tareas programadas

El sistema de tareas programadas está disponible a través de `/task`.

```text
/task
```

Ejemplos:

```text
/task
Name: Verificación del servidor
Schedule: Daily
Time: 20:00
Prompt: Verificar el estado de los servidores locales
Storage: Durable
```

```text
/task
Name: Recordatorio de commit
Schedule: In N minutes
Delay: 10
Prompt: Recordarme hacer commit del código
Storage: Session-only
```

Comportamiento de las tareas:

* Las tareas duraderas se guardan en `.clew/scheduled_tasks.json`
* Las tareas solo de sesión se ejecutan solo durante la sesión activa
* Las tareas recurrentes usan sintaxis cron estándar de 5 campos
* Las tareas únicas se eliminan después de ejecutarse
* Se usa la zona horaria local de la máquina para la ejecución programada

## Taste

Taste es un runtime de aprendizaje de preferencias local. Aprende de señales de aceptación, rechazo, edición, prueba, lint y reglas manuales. Combina reglas simbólicas, puntuación semántica de preferencias y optimización contextual bandit para adaptar Clew a su estilo de codificación. No ajusta el LLM base.

```text
/taste                Abrir menú interactivo
/taste learn <rule>   Añadir una regla manual
/taste forget <id>    Eliminar una regla
/taste profile        Mostrar todas las reglas
/taste events         Mostrar eventos recientes
/taste decay          Aplicar disminución de confianza
/taste eval           Ejecutar autoevaluación
/taste export         Exportar reglas de alta confianza
/taste import <file>  Importar reglas desde archivo
/taste on             Activar Taste
/taste off            Desactivar Taste
```

### Capacidades clave

- **Menú interactivo** — Diálogo navegable con flechas con 11 acciones, Spinner para operaciones asíncronas
- **Validación de ediciones** — Escanea ediciones durante solicitudes de permiso, advierte sobre violaciones de reglas aprendidas
- **Recarga en vivo de configuración** — Se suscribe a cambios de `settings.json` mediante `subscribeToSettingsChanges()`
- **Línea de estado** — `ⓘ taste: N rules` mostrado en PromptInputFooter
- **Inyección en el prompt** — Inyecta bloque XML `<clew_taste>` con hasta 8 reglas relevantes en el prompt del sistema
- **Recolección de señales** — Señales fire-and-forget desde PermissionContext y ejecución de herramientas
- **Motor de disminución** — Reducción gradual de confianza para reglas no utilizadas (basado en vida media, 30 días por defecto)

Consulte [docs/taste.html](../docs/taste.html) para documentación completa.

## Desarrollo

```bash
bun run dev              # Iniciar modo desarrollo
bun run start            # Ejecutar CLI desde fuente
bun run build            # Compilar a dist/
bun test                 # Ejecutar pruebas
bun x tsc --noEmit       # Verificar tipos
bun run lint:check       # Verificar reglas Biome lint
bun run format:check     # Verificar formato Biome
bun run check:ci         # Ejecutar validación Biome CI
```

Utilidades de desarrollo:

```bash
bun run preload <module>     # Precargar contexto de módulo
bun run session <command>    # Guardar, listar o restaurar contexto de sesión
bun run ast-grep -- <args>   # Ejecutar búsqueda o reescritura AST estructural
```

## Estructura del proyecto

```text
src/
├── main.tsx              # Bootstrap de UI de terminal y bucle principal
├── query.ts              # Procesamiento de consultas y lógica de prompt del sistema
├── QueryEngine.ts        # Orquestación de consultas, caché, deduplicación y límites de tasa
├── agentRuntime/         # Orquestación de agentes y almacenes de ejecución persistentes
├── commands/             # Implementaciones de comandos slash
├── tools/                # Herramientas de desarrollo integradas
├── services/
│   ├── ai/               # Gestor de proveedores, adaptadores, normalizadores y providers.json
│   ├── mcp/              # Clientes del Protocolo de Contexto de Modelo
│   ├── plugins/          # Hooks e interceptores del ciclo de vida de plugins
│   ├── tools/            # Servicio de ejecución de herramientas
│   ├── lsp/              # Integración del Protocolo de Servidor de Lenguaje
│   ├── Supervisor/       # Supervisor de agentes en segundo plano
│   └── SessionMemory/    # Memoria de sesión persistente
├── skills/               # Cargador dinámico de skills
├── cli/                  # Contextos de UI de terminal
├── components/           # Componentes de UI de terminal
├── bridge/               # Puente WebSocket
├── coordinator/          # Coordinador multi-agente
├── keybindings/          # Mapeos de atajos de teclado
├── state/                # Almacenes reactivos
└── vim/                  # Modo de navegación tipo Vim
```

## Arquitectura

```text
Terminal UI
  -> Registro de comandos y atajos de teclado
  -> Gestor de proveedores y adaptadores de IA
  -> Motor de consultas y bucles de streaming
  -> Servicio de ejecución de herramientas
  -> Plugins, MCP, LSP, agentes, memoria de sesión y puente
```

## Documentación

* [Instalación](../docs/installation.html)
* [Inicio rápido](../docs/quick-start.html)
* [Configuración](../docs/configuration.html)
* [Proveedores de IA](../docs/providers.html)
* [Modelos](../docs/models.html)
* [Comandos](../docs/commands.html)
* [Herramientas](../docs/tools.html)
* [Plugins](../docs/plugins.html)
* [Skills](../docs/skills.html)
* [Arquitectura](../docs/architecture.html)
* [Modelo de permisos](../docs/permission-model.html)
* [Modo Bridge](../docs/features/bridge-mode.html)
* [Solución de problemas](../docs/troubleshooting.html)
* [Evaluaciones](../docs/features/evals.html)
* [Taste](../docs/taste.html)

## Depuración

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

Un binario `ripgrep` precompilado para Windows puede estar incluido en:

```text
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## Contribuir

Lea estos archivos antes de contribuir:

* [CONTRIBUTING.md](../CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
* [SECURITY.md](../SECURITY.md)
* [LICENSE.md](../LICENSE.md)

No envíe código propietario, fuente copiada, material filtrado, credenciales, claves privadas o contenido que no tenga derecho a licenciar.

## Seguridad

No abra problemas públicos para vulnerabilidades de seguridad.

Utilice el proceso de informe privado descrito en [SECURITY.md](../SECURITY.md).


## Changelog

<details>
<summary><strong>0.2.4 — 2026-06-08</strong></summary>

- **Peer-to-peer** — LAN discovery, task delegation, 14 AI tools
- **Taste tools** — taste_learn, taste_forget, taste_profile, taste_suggest
- **Autonomous agents** — agent loop, supervisor, task queue, Loop Lock
- **Workflow Rainbow** — per-character gradient

</details>

[Full changelog](../CHANGELOG.md)

## Licencia

Consulte [LICENSE.md](../LICENSE.md).

Solo las modificaciones y adiciones originales creadas por el colaborador tienen licencia según lo descrito en `LICENSE.md`.
