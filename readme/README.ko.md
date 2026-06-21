<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>언어:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文</a> ·
  <a href="README.th.md">ไทย</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md"><strong>한국어</strong></a> ·
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

Clew는 AI 기반 소프트웨어 개발을 위한 비공식 연구 지향 CLI입니다.

이 프로젝트는 로컬 개발, 디버깅, 자체 호스팅 워크플로우 및 제공자 선택을 위해 설계된 소스 기반 재구성 및 확장 프로젝트입니다.

이 저장소는 공식 제품, 배포본, 파트너 프로젝트 또는 지원되는 구현이 아닙니다.

> **면책 조항:** 이 프로젝트는 어떤 제3자와도 제휴, 보증, 후원 또는 승인되지 않았습니다. 이 저장소를 사용, 수정, 재배포 또는 배포하기 전에 [LICENSE.md](../LICENSE.md)를 읽어주세요.

## 이 프로젝트가 제공하는 것

| 분야                   | 설명                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 소스 빌드 CLI          | 로컬에서 빌드, 테스트, 검사 및 수정 가능한 Bun/TypeScript 터미널 애플리케이션                                                  |
| 멀티 프로바이더 라우팅  | 프로바이더 어댑터 및 모델 선택 명령을 통한 여러 AI 프로바이더 지원                                                              |
| 개발자 도구             | 컨텍스트 검사, 코드 리뷰, 단순화, 리서치, 플러그인, MCP, LSP, 세션 및 백그라운드 워크플로우 명령어                                    |
| 로컬 확장성             | 플러그인, 훅, 스킬, 커스텀 도구, 예약된 작업 및 프로젝트 수준 구성 지원                                                           |
| 연구 용도              | AI 코딩 에이전트 아키텍처, 터미널 UX, 프로바이더 라우팅 및 도구 실행 연구를 위한 투명한 코드베이스                                       |

## 기능

Clew는 터미널에서 직접 실행됩니다. 로컬 코드베이스를 검사 및 편집하고, 권한에 따라 셸 명령을 실행하며, 모델 프로바이더를 전환하고, 장기 실행 에이전트 워크플로우를 조정할 수 있습니다.

주요 기능:

* **멀티 프로바이더 AI 라우팅** — Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot 및 OpenAI 호환 엔드포인트 지원
* **런타임 모델 전환** — 세션 중 `/model`을 사용하여 모델 또는 프로바이더 전환
* **도구 기반 워크플로우** — 파일 읽기, 검색, 편집, 쓰기, 셸 명령 실행, LSP 쿼리, MCP 도구 실행, 브라우저 자동화 통합
* **플러그인 훅** — 프롬프트, 셸 실행, 도구 호출, 메시지 표시, 세션 시작, 파일 편집 작업에 훅
* **동적 스킬** — 프로젝트 내 및 `.clew/skills/`에서 스킬 로드
* **코드 리뷰 도구** — `/code-review --fix`로 변경된 코드 검사 및 적용, `/simplify`로 정리
* **가디언 자동 리뷰** — `/guardian`이 권한 요청을 서킷 브레이커가 있는 LLM 리뷰어로 라우팅
* **PR 관리** — `/pr create`, `list`, `view`, `review`, `merge`, `status`
* **프로바이더 독립적 원격 제어** — `/remote`로 WebSocket 기반 CLI 공유
* **모델 피커** — 전역 또는 세션 전용 모델 선택
* **플러그인 마켓플레이스** — 플러그인 소스의 `skipLfs` 지원
* **로컬 리서치 워크플로우** — 설정이 활성화된 경우 `/research <query>`로 로컬 웹 스크래핑을 포함한 리서치
* **에이전트 및 슈퍼바이저** — 백그라운드 에이전트, 멀티스텝 워크플로우, 요약, 작업 상태, 승인 및 세션 상태 관리
* **백그라운드 셸 명령** — `!bg <command>`로 장시간 명령 실행
* **예약된 작업** — `/task`로 일회성 또는 반복 작업 생성
* **세션 및 브릿지 모드** — 원격 워크플로우를 위한 세션 저장, 복원 및 연결

## 빠른 시작

### 전역 설치

```bash
npm install -g clew-code
```

또는:

```bash
bun install -g clew-code
```

프로젝트 디렉토리에서 CLI 실행:

```bash
clew
```

> 전역 실행기 사용을 위해 시스템에 Bun이 설치되어 있어야 합니다

### 소스에서 실행

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode

bun install
bun run build
bun run start
```

개발 모드:

```bash
bun run dev
```

## 시스템 요구사항

- Bun 1.3 이상
- Node.js 18 이상
- Git
- Windows, macOS, Linux 또는 WSL2
- 지원되는 프로바이더의 API 키 (Ollama 같은 로컬 프로바이더 사용 시 불필요)

## 프로바이더 설정

프로바이더 키는 셸 또는 `.env` 파일에서 설정:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

세션 중 모델/프로바이더 전환:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

프로바이더 문서:

```text
docs/providers.html
```

## 자주 사용하는 명령어

```text
/model        모델 또는 프로바이더 전환
/taste        학습 설정 메뉴 열기
/status       프로바이더, 세션, 컨텍스트 상태 보기
/doctor       진단 실행
/context      컨텍스트 사용량 검사
/compact      대화 기록 압축
/mcp          MCP 서버 관리
/code-review  변경된 코드 검토
/simplify     정리 중심 리뷰
/plugin       플러그인 및 훅 관리
/bridge       브릿지 모드 설정
/agent        백그라운드 에이전트 워크플로우 관리
/daemon       자율 데몬 대시보드 시작
/task         예약된 작업 생성 또는 관리
```

CLI에서 `/`를 입력하면 전체 명령어 목록이 표시됩니다.

## 예약된 작업

예약된 작업 시스템은 `/task`로 사용 가능합니다.

```text
/task
```

예시:

```text
/task
Name: 서버 체크
Schedule: Daily
Time: 20:00
Prompt: 로컬 서버 상태 확인
Storage: Durable
```

```text
/task
Name: 커밋 알림
Schedule: In N minutes
Delay: 10
Prompt: 코드 커밋 알림
Storage: Session-only
```

작업 동작:

* Durable 작업은 `.clew/scheduled_tasks.json`에 저장
* Session-only 작업은 활성 세션 중에만 실행
* 반복 작업은 표준 5필드 cron 구문 사용
* 일회성 작업은 실행 후 제거
* 예약 실행에는 로컬 머신 시간대 사용

## Taste

Taste는 로컬 우선 선호도 학습 런타임입니다. accept, reject, edit, test, lint 및 수동 규칙에서 학습합니다. 기호 규칙, 의미론적 선호도 점수 및 컨텍스트 밴디트 최적화를 결합하여 Clew를 코딩 스타일에 적응시킵니다. 기본 LLM을 미세 조정하지 않습니다.

```text
/taste                대화형 메뉴 열기
/taste learn <rule>   수동 규칙 추가
/taste forget <id>    규칙 제거
/taste profile        모든 규칙 표시
/taste events         최근 이벤트 표시
/taste decay          신뢰도 감소 적용
/taste eval           자체 평가 실행
/taste export         높은 신뢰도 규칙 내보내기
/taste import <file>  파일에서 규칙 가져오기
/taste on             Taste 활성화
/taste off            Taste 비활성화
```

### 주요 기능

- **대화형 메뉴** — 화살표 키 탐색 가능한 11개 액션 다이얼로그, 비동기 작업용 Spinner 로딩
- **편집 검증** — 권한 요청 중 편집 스캔, 학습된 규칙 위반 시 경고
- **설정 실시간 리로드** — `subscribeToSettingsChanges()`를 통해 `settings.json` 변경 구독
- **상태 표시줄** — PromptInputFooter에 `ⓘ taste: N rules` 표시
- **프롬프트 주입** — 시스템 프롬프트에 최대 8개의 관련 규칙이 포함된 `<clew_taste>` XML 블록 주입
- **시그널 수집** — PermissionContext 및 도구 실행에서 fire-and-forget 시그널
- **감소 엔진** — 사용되지 않는 규칙의 점진적 신뢰도 감소 (반감기 기반, 기본 30일)

자세한 내용은 [docs/taste.html](../docs/taste.html)을 참조하세요.

## 개발

```bash
bun run dev              # 개발 모드 시작
bun run start            # 소스에서 CLI 실행
bun run build            # dist/로 빌드
bun test                 # 테스트 실행
bun x tsc --noEmit       # 타입 체크
bun run lint:check       # Biome 린트 규칙 확인
bun run format:check     # Biome 포맷팅 확인
bun run check:ci         # Biome CI 검증 실행
```

개발 유틸리티:

```bash
bun run preload <module>     # 모듈 컨텍스트 사전 로드
bun run session <command>    # 세션 컨텍스트 저장, 목록 또는 복원
bun run codegraph            # 모듈 의존성 그래프 생성
bun run ast-grep -- <args>   # 구조적 AST 검색 또는 재작성 실행
```

## 프로젝트 구조

```text
src/
├── main.tsx              # Terminal UI 부트스트랩 및 메인 루프
├── query.ts              # 쿼리 처리 및 시스템 프롬프트 로직
├── QueryEngine.ts        # 쿼리 오케스트레이션, 캐싱, 중복 제거, 속도 제한
├── agentRuntime/         # 에이전트 오케스트레이션 및 영구 실행 저장소
├── commands/             # 슬래시 명령 구현
├── tools/                # 내장 개발자 도구
├── services/
│   ├── ai/               # 프로바이더 관리자, 어댑터, 정규화, providers.json
│   ├── mcp/              # Model Context Protocol 클라이언트
│   ├── plugins/          # 플러그인 라이프사이클 훅 및 인터셉터
│   ├── tools/            # 도구 실행 서비스
│   ├── lsp/              # Language Server Protocol 통합
│   ├── Supervisor/       # 백그라운드 에이전트 감독자
│   └── SessionMemory/    # 영구 세션 메모리
├── skills/               # 동적 스킬 로더
├── cli/                  # Terminal UI 컨텍스트
├── components/           # Terminal UI 컴포넌트
├── bridge/               # WebSocket 브릿지
├── coordinator/          # 멀티 에이전트 코디네이터
├── keybindings/          # 키보드 단축키 매핑
├── state/                # 반응형 스토어
└── vim/                  # Vim 스타일 내비게이션 모드
```

## 아키텍처

```text
Terminal UI
  -> 명령 레지스트리 및 키바인딩
  -> 프로바이더 관리자 및 AI 어댑터
  -> 쿼리 엔진 및 스트리밍 루프
  -> 도구 실행 서비스
  -> 플러그인, MCP, LSP, 에이전트, 세션 메모리, 브릿지
```

## 문서

* [설치](../docs/installation.html)
* [빠른 시작](../docs/quick-start.html)
* [설정](../docs/configuration.html)
* [AI 프로바이더](../docs/providers.html)
* [모델](../docs/models.html)
* [명령어](../docs/commands.html)
* [도구](../docs/tools.html)
* [플러그인](../docs/plugins.html)
* [스킬](../docs/skills.html)
* [아키텍처](../docs/architecture.html)
* [권한 모델](../docs/permission-model.html)
* [브릿지 모드](../docs/features/bridge-mode.html)
* [문제 해결](../docs/troubleshooting.html)
* [평가](../docs/features/evals.html)
* [Taste](../docs/taste.html)

## 디버깅

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## 플랫폼 참고사항

### Windows

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

사전 컴파일된 `ripgrep` 바이너리는 다음 경로에 번들될 수 있습니다:

```text
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## 기여

기여하기 전에 다음 파일을 읽어주세요:

* [CONTRIBUTING.md](../CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
* [SECURITY.md](../SECURITY.md)
* [LICENSE.md](../LICENSE.md)

독점 코드, 복사된 소스, 유출된 자료, 자격 증명, 개인 키 또는 라이선스 권한이 없는 콘텐츠를 제출하지 마세요.

## 보안

보안 취약점을 공개 이슈로 열지 마세요.

[SECURITY.md](../SECURITY.md)에 설명된 비공개 보고 프로세스를 사용하세요.


## Changelog

<details>
<summary><strong>0.2.4 — 2026-06-08</strong></summary>

- **Peer-to-peer** — LAN discovery, task delegation, 14 AI tools
- **Taste tools** — taste_learn, taste_forget, taste_profile, taste_suggest
- **Autonomous agents** — agent loop, supervisor, task queue, Loop Lock
- **Workflow Rainbow** — per-character gradient

</details>

[Full changelog](../CHANGELOG.md)

## 라이선스

[LICENSE.md](../LICENSE.md)를 참조하세요.

기여자가 작성한 수정 사항 및 원본 추가 사항만 `LICENSE.md`에 설명된 대로 라이선스가 부여됩니다.
