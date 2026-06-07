<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Bahasa:</strong>
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
  <a href="README.id.md"><strong>Bahasa Indonesia</strong></a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

# Clew 🪽

Clew adalah CLI tidak resmi berorientasi riset untuk pengembangan perangkat lunak berbantuan AI.

Proyek ini merupakan rekonstruksi dan ekstensi berbasis sumber, dirancang untuk pengembangan lokal, debugging, alur kerja self-hosted, dan pilihan penyedia AI.

> **Penyangkalan:** Anthropic, Claude, dan Claude Code adalah merek dagang dari pemiliknya masing-masing. Harap baca [LICENSE.md](../LICENSE.md) sebelum menggunakan, memodifikasi, mendistribusikan ulang, atau menyebarkan repositori ini.

## Fitur

- **Routing multi-penyedia** — Mendukung Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot, dan lainnya
- **Pergantian model saat runtime** — Gunakan `/model` untuk mengganti model atau penyedia selama sesi
- **Alur kerja berbasis alat** — Baca/tulis file, perintah shell, LSP, alat MCP, otomatisasi browser
- **Plugin hooks** — Kaitkan ke prompt, eksekusi shell, panggilan alat, dll.
- **Keahlian dinamis** — Muat keahlian dari proyek dan `.claude/skills/`
- **Review kode** — `/code-review --fix` dan `/simplify`
- **Agen dan supervisor** — Agen latar belakang dan alur kerja multi-langkah
- **Tugas terjadwal** — Buat tugas satu kali atau berulang dengan `/task`
- **Mode sesi dan jembatan** — Untuk alur kerja jarak jauh

## Mulai cepat

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

Mode pengembangan: `bun run dev`

## Persyaratan sistem

- Bun 1.3+, Node.js 18+, Git
- Windows / macOS / Linux / WSL2
- Kunci API dari setidaknya satu penyedia yang didukung

## Lisensi

Lihat [LICENSE.md](../LICENSE.md).
