<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>언어:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文 (简体)</a> ·
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

Clew는 AI 기반 소프트웨어 개발을 위한 비공식 연구용 CLI입니다.

이 프로젝트는 로컬 개발, 디버깅, 자체 호스팅 워크플로우 및 제공자 선택을 위해 설계된 소스 빌드 재구성 및 확장 프로젝트입니다.

> **면책 조항:** Anthropic, Claude, Claude Code는 해당 소유자의 상표입니다. 이 저장소를 사용, 수정, 재배포 또는 배포하기 전에 [LICENSE.md](../LICENSE.md)를 읽어주세요.

## 기능

- **멀티 프로바이더 AI 라우팅** — Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot 등 지원
- **런타임 모델 전환** — 세션 중 `/model`로 모델/프로바이더 전환
- **도구 기반 워크플로우** — 파일 읽기/쓰기, 셸 명령, LSP, MCP 도구, 브라우저 자동화
- **플러그인 훅** — 프롬프트, 셸 실행, 도구 호출 등에 훅
- **동적 스킬** — 프로젝트 내 및 `.claude/skills/`에서 스킬 로드
- **코드 리뷰** — `/code-review --fix` 및 `/simplify`
- **에이전트 및 슈퍼바이저** — 백그라운드 에이전트 및 다단계 워크플로우
- **예약 작업** — `/task`로 일회성 또는 반복 작업 생성
- **세션 및 브리지 모드** — 원격 워크플로우용

## 퀵스타트

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

개발 모드: `bun run dev`

## 시스템 요구사항

- Bun 1.3+, Node.js 18+, Git
- Windows / macOS / Linux / WSL2
- 지원되는 프로바이더의 API 키

## 라이선스

[LICENSE.md](../LICENSE.md)를 확인해주세요.
