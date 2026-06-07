<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Langue:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文</a> ·
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

Clew est un CLI non officiel orienté vers la recherche pour le développement logiciel assisté par IA.

Il s'agit d'un projet de reconstruction et d'extension à partir des sources, conçu pour le développement local, le débogage, les workflows auto-hébergés et le choix du fournisseur d'IA.

Ce dépôt n'est pas un produit officiel d'Anthropic, une distribution, un projet partenaire ou une implémentation supportée.

> **Avis de non-responsabilité :** Anthropic, Claude et Claude Code sont des marques commerciales de leurs propriétaires respectifs. Ce projet n'est pas affilié, approuvé, sponsorisé ou autorisé par Anthropic PBC. Le produit officiel Claude Code d'Anthropic est un logiciel propriétaire. Veuillez lire [LICENSE.md](../LICENSE.md) avant d'utiliser, modifier, redistribuer ou déployer ce dépôt.

## Ce que ce projet offre

| Domaine                | Description                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| CLI construite         | Application terminal Bun/TypeScript pouvant être construite, testée, inspectée et modifiée localement                      |
| Routage multiprovideur | Prise en charge de plusieurs fournisseurs d'IA via des adaptateurs et des commandes de sélection de modèle                 |
| Outils de développement| Commandes pour l'inspection du contexte, la révision de code, la simplification, la recherche, les plugins, MCP, LSP, sessions et workflows en arrière-plan |
| Extensibilité locale   | Prise en charge des plugins, hooks, skills, outils personnalisés, tâches planifiées et configuration au niveau projet     |
| Usage recherche        | Code transparent pour étudier l'architecture des agents de codage IA, l'UX terminal, le routage des fournisseurs et l'exécution d'outils |

## Fonctionnalités

Clew s'exécute directement dans votre terminal. Il peut inspecter et modifier des bases de code locales, exécuter des commandes shell avec autorisations, changer de fournisseur de modèle et coordonner des workflows d'agents de longue durée.

Principales fonctionnalités :

* **Routage multiprovideur IA** — Prend en charge Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot et les endpoints compatibles OpenAI
* **Changement de modèle à l'exécution** — Utilisez `/model` pour changer de modèle ou de fournisseur pendant une session
* **Workflows basés sur les outils** — Lire, rechercher, éditer et écrire des fichiers ; exécuter des commandes shell ; interroger LSP ; exécuter des outils MCP ; intégrer l'automatisation du navigateur
* **Hooks de plugins** — Interceptez les prompts, l'exécution shell, les appels d'outils, l'affichage des messages, le début de session et les actions d'édition de fichiers
* **Compétences dynamiques** — Chargez des compétences depuis le projet et `.claude/skills/`
* **Outils de révision de code** — `/code-review --fix` pour vérifier et appliquer les modifications, `/simplify` pour nettoyer
* **Révision automatique Guardian** — `/guardian` achemine les demandes d'autorisation vers un réviseur LLM avec coupe-circuit
* **Gestion des PR** — `/pr create`, `list`, `view`, `review`, `merge`, `status`
* **Contrôle à distance indépendant du fournisseur** — `/remote` pour le partage CLI via WebSocket
* **Sélecteur de modèles** — Sélection globale ou limitée à la session
* **Marketplace de plugins** — Support `skipLfs` pour les sources de plugins
* **Recherche locale** — `/research <query>` pour un workflow de recherche avec scraping web local
* **Agents et superviseur** — Gérez les agents en arrière-plan, workflows multi-étapes, résumés, état des tâches, approbations et état des sessions
* **Commandes shell en arrière-plan** — Exécutez des commandes longues avec `!bg <command>`
* **Tâches planifiées** — Créez des tâches ponctuelles ou récurrentes avec `/task`
* **Sessions et mode bridge** — Sauvegardez, restaurez et connectez des sessions pour les workflows distants

## Démarrage rapide

### Installation globale

```bash
npm install -g clew-code
```

Ou :

```bash
bun install -g clew-code
```

Exécutez le CLI dans le répertoire du projet :

```bash
clew
```

> Le lanceur global nécessite que Bun soit installé sur le système

### Exécuter depuis les sources

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode

bun install
bun run build
bun run start
```

Mode développement :

```bash
bun run dev
```

## Configuration requise

- Bun 1.3 ou supérieur
- Node.js 18 ou supérieur
- Git
- Windows, macOS, Linux ou WSL2
- Clé API d'au moins un fournisseur pris en charge (non requis si vous utilisez un fournisseur local comme Ollama)

## Configuration des fournisseurs

Définissez les clés des fournisseurs dans le shell ou un fichier `.env` :

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

Changez de modèle/fournisseur pendant une session :

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

Documentation des fournisseurs :

```text
docs/providers.html
```

## Commandes courantes

```text
/model        Changer de modèle ou de fournisseur
/taste        Ouvrir le menu d'apprentissage des préférences
/status       Voir l'état du fournisseur, de la session et du contexte
/doctor       Exécuter un diagnostic
/context      Inspecter l'utilisation du contexte
/compact      Compresser l'historique de la conversation
/mcp          Gérer les serveurs MCP
/code-review  Réviser les modifications de code
/simplify     Révision axée sur le nettoyage
/plugin       Gérer les plugins et hooks
/bridge       Configurer le mode bridge
/agent        Gérer les workflows d'agents en arrière-plan
/daemon       Lancer le tableau de bord du démon autonome
/task         Créer ou gérer des tâches planifiées
```

Tapez `/` dans le CLI pour voir la liste complète des commandes.

## Tâches planifiées

Le système de tâches planifiées est disponible via `/task`.

```text
/task
```

Exemples :

```text
/task
Name: Vérification serveur
Schedule: Daily
Time: 20:00
Prompt: Vérifier l'état des serveurs locaux
Storage: Durable
```

```text
/task
Name: Rappel de commit
Schedule: In N minutes
Delay: 10
Prompt: Me rappeler de faire un commit
Storage: Session-only
```

Comportement des tâches :

* Les tâches durables sont sauvegardées dans `.claude/scheduled_tasks.json`
* Les tâches session-only s'exécutent uniquement pendant la session active
* Les tâches récurrentes utilisent la syntaxe cron standard à 5 champs
* Les tâches ponctuelles sont supprimées après exécution
* Le fuseau horaire local est utilisé pour l'exécution planifiée

## Taste

Taste est un runtime d'apprentissage des préférences local. Il apprend des signaux d'acceptation, de rejet, d'édition, de test, de lint et des règles manuelles. Il combine des règles symboliques, un score sémantique de préférence et une optimisation contextuelle par bandit pour adapter Clew à votre style de codage. Il ne fine-tune pas le LLM de base.

```text
/taste                Ouvrir le menu interactif
/taste learn <rule>   Ajouter une règle manuelle
/taste forget <id>    Supprimer une règle
/taste profile        Afficher toutes les règles
/taste events         Afficher les événements récents
/taste decay          Appliquer la décroissance de confiance
/taste eval           Exécuter l'auto-évaluation
/taste export         Exporter les règles de haute confiance
/taste import <file>  Importer des règles depuis un fichier
/taste on             Activer Taste
/taste off            Désactiver Taste
```

### Capacités clés

- **Menu interactif** — Dialogue navigable aux flèches avec 11 actions, Spinner pour les opérations asynchrones
- **Validation d'édition** — Scanne les éditions pendant les demandes d'autorisation, avertit en cas de violation des règles apprises
- **Rechargement à chaud de la configuration** — S'abonne aux changements de `settings.json` via `subscribeToSettingsChanges()`
- **Ligne d'état** — `ⓘ taste: N rules` affiché dans PromptInputFooter
- **Injection dans le prompt** — Injecte un bloc XML `<clew_taste>` avec jusqu'à 8 règles pertinentes dans le prompt système
- **Collecte de signaux** — Signaux fire-and-forget depuis PermissionContext et l'exécution d'outils
- **Moteur de décroissance** — Réduction progressive de la confiance pour les règles inutilisées (basé sur la demi-vie, 30 jours par défaut)

Voir [docs/taste.html](../docs/taste.html) pour la documentation complète.

## Développement

```bash
bun run dev              # Démarrer le mode développement
bun run start            # Exécuter le CLI depuis les sources
bun run build            # Compiler dans dist/
bun test                 # Exécuter les tests
bun x tsc --noEmit       # Vérification des types
bun run lint:check       # Vérifier les règles Biome lint
bun run format:check     # Vérifier le formatage Biome
bun run check:ci         # Exécuter la validation Biome CI
```

Utilitaires de développement :

```bash
bun run preload <module>     # Précharger le contexte du module
bun run session <command>    # Sauvegarder, lister ou restaurer le contexte de session
bun run codegraph            # Générer des graphes de dépendances de modules
bun run ast-grep -- <args>   # Exécuter une recherche ou réécriture AST structurelle
```

## Structure du projet

```text
src/
├── main.tsx              # Bootstrap de l'UI terminal et boucle principale
├── query.ts              # Traitement des requêtes et logique du prompt système
├── QueryEngine.ts        # Orchestration des requêtes, cache, déduplication et limites de débit
├── agentRuntime/         # Orchestration des agents et stockages d'exécution persistants
├── commands/             # Implémentations des commandes slash
├── tools/                # Outils de développement intégrés
├── services/
│   ├── ai/               # Gestionnaire de fournisseurs, adaptateurs, normalisateurs et providers.json
│   ├── mcp/              # Clients Model Context Protocol
│   ├── plugins/          # Hooks et intercepteurs du cycle de vie des plugins
│   ├── tools/            # Service d'exécution d'outils
│   ├── lsp/              # Intégration Language Server Protocol
│   ├── Supervisor/       # Superviseur d'agents en arrière-plan
│   └── SessionMemory/    # Mémoire de session persistante
├── skills/               # Chargeur de compétences dynamique
├── cli/                  # Contextes d'UI terminal
├── components/           # Composants d'UI terminal
├── bridge/               # Pont WebSocket
├── coordinator/          # Coordinateur multi-agents
├── keybindings/          # Mappages de raccourcis clavier
├── state/                # Stores réactifs
└── vim/                  # Mode de navigation type Vim
```

## Architecture

```text
Terminal UI
  -> Registre de commandes et raccourcis clavier
  -> Gestionnaire de fournisseurs et adaptateurs IA
  -> Moteur de requêtes et boucles de streaming
  -> Service d'exécution d'outils
  -> Plugins, MCP, LSP, agents, mémoire de session et pont
```

## Documentation

* [Installation](../docs/installation.html)
* [Démarrage rapide](../docs/quick-start.html)
* [Configuration](../docs/configuration.html)
* [Fournisseurs IA](../docs/providers.html)
* [Modèles](../docs/models.html)
* [Commandes](../docs/commands.html)
* [Outils](../docs/tools.html)
* [Plugins](../docs/plugins.html)
* [Compétences](../docs/skills.html)
* [Architecture](../docs/architecture.html)
* [Modèle de permission](../docs/permission-model.html)
* [Mode Bridge](../docs/features/bridge-mode.html)
* [Recherche SearXNG](../docs/features/searxng-search.html)
* [Dépannage](../docs/troubleshooting.html)
* [Évaluations](../docs/features/evals.html)
* [Taste](../docs/taste.html)

## Débogage

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## Notes sur les plateformes

### Windows

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

Un binaire `ripgrep` précompilé pour Windows peut être inclus sous :

```text
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## Contribution

Lisez ces fichiers avant de contribuer :

* [CONTRIBUTING.md](../CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
* [SECURITY.md](../SECURITY.md)
* [LICENSE.md](../LICENSE.md)

Ne soumettez pas de code propriétaire, de source copiée, de matériel divulgué, d'identifiants, de clés privées ou de contenu que vous n'avez pas le droit de licencier.

## Sécurité

N'ouvrez pas de problèmes publics pour les vulnérabilités de sécurité.

Utilisez le processus de signalement privé décrit dans [SECURITY.md](../SECURITY.md).

## Licence

Voir [LICENSE.md](../LICENSE.md).

Seules les modifications et ajouts originaux créés par le contributeur sont licenciés comme décrit dans `LICENSE.md`. Ce dépôt n'accorde pas de droits sur les logiciels propriétaires, services, modèles, marques commerciales ou autres matériels protégés d'Anthropic.
