<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Bahasa:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文</a> ·
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

Ini adalah proyek rekonstruksi dan ekstensi berbasis sumber, dirancang untuk pengembangan lokal, debugging, alur kerja self-hosted, dan kebebasan memilih penyedia.

Repositori ini bukan produk resmi, distribusi, proyek mitra, atau implementasi yang didukung.

> **Penyangkalan:** Proyek ini tidak berafiliasi, didukung, disponsori, atau disetujui oleh pihak ketiga mana pun. Harap baca [LICENSE.md](../LICENSE.md) sebelum menggunakan, memodifikasi, mendistribusikan ulang, atau menyebarkan repositori ini.

## Apa yang Disediakan Proyek Ini

| Area                   | Deskripsi                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| CLI berbasis sumber    | Aplikasi terminal Bun/TypeScript yang dapat dibangun, diuji, diperiksa, dan dimodifikasi secara lokal                    |
| Routing multi-penyedia | Dukungan untuk banyak penyedia AI melalui adaptor penyedia dan perintah pemilihan model                                 |
| Alat pengembang        | Perintah untuk inspeksi konteks, tinjauan kode, penyederhanaan, riset, plugin, MCP, LSP, sesi, dan alur kerja latar belakang |
| Ekstensibilitas lokal  | Dukungan untuk plugin, hook, skill, alat kustom, tugas terjadwal, dan konfigurasi tingkat proyek                        |
| Penggunaan riset       | Basis kode transparan untuk mempelajari arsitektur agen coding AI, UX terminal, routing penyedia, dan eksekusi alat     |

## Fitur

Clew berjalan langsung di terminal Anda. Ia dapat memeriksa dan mengedit basis kode lokal, menjalankan perintah shell dengan izin, mengganti penyedia model, dan mengoordinasikan alur kerja agen jangka panjang.

Fitur utama:

* **Routing AI multi-penyedia** — Mendukung Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot, dan endpoint yang kompatibel dengan OpenAI
* **Pergantian model saat runtime** — Gunakan `/model` untuk mengganti model atau penyedia selama sesi
* **Alur kerja berbasis alat** — Baca, cari, edit, dan tulis file; jalankan perintah shell; query LSP; jalankan alat MCP; integrasikan otomatisasi browser
* **Hook plugin** — Kaitkan ke prompt, eksekusi shell, panggilan alat, tampilan pesan, mulai sesi, dan tindakan edit file
* **Skill dinamis** — Muat skill dari proyek dan `.claude/skills/`
* **Alat tinjauan kode** — Gunakan `/code-review --fix` untuk memeriksa dan menerapkan perubahan, `/simplify` untuk membersihkan kode
* **Tinjauan otomatis Guardian** — `/guardian` merutekan permintaan izin ke peninjau LLM dengan pemutus sirkuit
* **Manajemen PR** — `/pr create`, `list`, `view`, `review`, `merge`, `status`
* **Kontrol jarak jauh independen penyedia** — `/remote` untuk berbagi CLI berbasis WebSocket
* **Pemilih model** — Pemilihan model global atau khusus sesi
* **Pasar plugin** — Dukungan `skipLfs` untuk sumber plugin
* **Riset lokal** — Gunakan `/research <query>` untuk riset dengan scraping web lokal
* **Agen dan supervisor** — Kelola agen latar belakang, alur kerja multi-langkah, ringkasan, status tugas, persetujuan, dan status sesi
* **Perintah shell latar belakang** — Jalankan perintah panjang dengan `!bg <command>`
* **Tugas terjadwal** — Buat tugas satu kali atau berulang dengan `/task`
* **Sesi dan mode bridge** — Simpan, pulihkan, dan hubungkan sesi untuk alur kerja jarak jauh

## Mulai Cepat

### Instalasi global

```bash
npm install -g clew-code
```

Atau:

```bash
bun install -g clew-code
```

Jalankan CLI di direktori proyek:

```bash
clew
```

> Peluncur global memerlukan Bun terinstal di sistem

### Jalankan dari sumber

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode

bun install
bun run build
bun run start
```

Mode pengembangan:

```bash
bun run dev
```

## Persyaratan Sistem

- Bun 1.3 atau lebih tinggi
- Node.js 18 atau lebih tinggi
- Git
- Windows, macOS, Linux, atau WSL2
- Kunci API dari setidaknya satu penyedia yang didukung (tidak diperlukan jika menggunakan penyedia lokal seperti Ollama)

## Konfigurasi Penyedia

Atur kunci penyedia di shell atau file `.env`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

Ganti model/penyedia selama sesi:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

Dokumentasi penyedia:

```text
docs/providers.html
```

## Perintah Umum

```text
/model        Ganti model atau penyedia
/taste        Buka menu preferensi pembelajaran
/status       Lihat status penyedia, sesi, dan konteks
/doctor       Jalankan diagnostik
/context      Periksa penggunaan konteks
/compact      Kompres riwayat percakapan
/mcp          Kelola server MCP
/code-review  Tinjau perubahan kode
/simplify     Tinjauan fokus pembersihan
/plugin       Kelola plugin dan hook
/bridge       Atur mode bridge
/agent        Kelola alur kerja agen latar belakang
/daemon       Buka dasbor daemon otonom
/task         Buat atau kelola tugas terjadwal
```

Ketik `/` di CLI untuk melihat daftar lengkap perintah.

## Tugas Terjadwal

Sistem tugas terjadwal tersedia melalui `/task`.

```text
/task
```

Contoh:

```text
/task
Name: Pemeriksaan server
Schedule: Daily
Time: 20:00
Prompt: Periksa status server lokal
Storage: Durable
```

```text
/task
Name: Pengingat commit
Schedule: In N minutes
Delay: 10
Prompt: Ingatkan saya untuk commit kode
Storage: Session-only
```

Perilaku tugas:

* Tugas Durable disimpan di `.claude/scheduled_tasks.json`
* Tugas Session-only hanya berjalan selama sesi aktif
* Tugas berulang menggunakan sintaks cron 5 bidang standar
* Tugas satu kali dihapus setelah dijalankan
* Zona waktu mesin lokal digunakan untuk eksekusi terjadwal

## Taste

Taste adalah runtime pembelajaran preferensi lokal. Ia belajar dari sinyal accept, reject, edit, test, lint, dan aturan manual. Ia menggabungkan aturan simbolis, penilaian preferensi semantik, dan optimasi contextual bandit untuk menyesuaikan Clew dengan gaya coding Anda. Ia tidak melakukan fine-tuning pada LLM dasar.

```text
/taste                Buka menu interaktif
/taste learn <rule>   Tambah aturan manual
/taste forget <id>    Hapus aturan
/taste profile        Tampilkan semua aturan
/taste events         Tampilkan kejadian terbaru
/taste decay          Terapkan penurunan kepercayaan
/taste eval           Jalankan evaluasi mandiri
/taste export         Ekspor aturan kepercayaan tinggi
/taste import <file>  Impor aturan dari file
/taste on             Aktifkan Taste
/taste off            Nonaktifkan Taste
```

### Kemampuan Utama

- **Menu interaktif** — Dialog navigasi panah dengan 11 aksi, Spinner loading untuk operasi async
- **Validasi edit** — Memindai edit selama permintaan izin, memperingatkan saat melanggar aturan yang dipelajari
- **Muat ulang konfigurasi langsung** — Berlangganan perubahan `settings.json` melalui `subscribeToSettingsChanges()`
- **Baris status** — `ⓘ taste: N rules` ditampilkan di PromptInputFooter
- **Injeksi prompt** — Menyuntikkan blok XML `<clew_taste>` dengan hingga 8 aturan relevan ke prompt sistem
- **Koleksi sinyal** — Sinyal fire-and-forget dari PermissionContext dan eksekusi alat
- **Mesin penurunan** — Pengurangan kepercayaan bertahap untuk aturan yang tidak digunakan (berbasis waktu paruh, default 30 hari)

Lihat [docs/taste.html](../docs/taste.html) untuk dokumentasi lengkap.

## Pengembangan

```bash
bun run dev              # Mulai mode pengembangan
bun run start            # Jalankan CLI dari sumber
bun run build            # Bangun ke dist/
bun test                 # Jalankan tes
bun x tsc --noEmit       # Periksa tipe
bun run lint:check       # Periksa aturan Biome lint
bun run format:check     # Periksa format Biome
bun run check:ci         # Jalankan validasi Biome CI
```

Utilitas pengembangan:

```bash
bun run preload <module>     # Muat awal konteks modul
bun run session <command>    # Simpan, daftar, atau pulihkan konteks sesi
bun run codegraph            # Hasilkan grafik dependensi modul
bun run ast-grep -- <args>   # Jalankan pencarian atau penulisan ulang AST struktural
```

## Struktur Proyek

```text
src/
├── main.tsx              # Bootstrap UI terminal dan loop utama
├── query.ts              # Pemrosesan kueri dan logika prompt sistem
├── QueryEngine.ts        # Orkestrasi kueri, caching, deduplikasi, dan batas kecepatan
├── agentRuntime/         # Orkestrasi agen dan penyimpanan proses permanen
├── commands/             # Implementasi perintah slash
├── tools/                # Alat pengembang bawaan
├── services/
│   ├── ai/               # Manajer penyedia, adaptor, normalisasi, dan providers.json
│   ├── mcp/              # Klien Model Context Protocol
│   ├── plugins/          # Hook dan interceptor siklus hidup plugin
│   ├── tools/            # Layanan eksekusi alat
│   ├── lsp/              # Integrasi Language Server Protocol
│   ├── Supervisor/       # Supervisor agen latar belakang
│   └── SessionMemory/    # Memori sesi persisten
├── skills/               # Pemuat skill dinamis
├── cli/                  # Konteks UI terminal
├── components/           # Komponen UI terminal
├── bridge/               # Jembatan WebSocket
├── coordinator/          # Koordinator multi-agen
├── keybindings/          # Pemetaan pintasan keyboard
├── state/                # Penyimpanan reaktif
└── vim/                  # Mode navigasi ala Vim
```

## Arsitektur

```text
Terminal UI
  -> Registri perintah dan pintasan keyboard
  -> Manajer penyedia dan adaptor AI
  -> Mesin kueri dan loop streaming
  -> Layanan eksekusi alat
  -> Plugin, MCP, LSP, agen, memori sesi, dan jembatan
```

## Dokumentasi

* [Instalasi](../docs/installation.html)
* [Mulai cepat](../docs/quick-start.html)
* [Konfigurasi](../docs/configuration.html)
* [Penyedia AI](../docs/providers.html)
* [Model](../docs/models.html)
* [Perintah](../docs/commands.html)
* [Alat](../docs/tools.html)
* [Plugin](../docs/plugins.html)
* [Skill](../docs/skills.html)
* [Arsitektur](../docs/architecture.html)
* [Model Izin](../docs/permission-model.html)
* [Mode Bridge](../docs/features/bridge-mode.html)
* [Pencarian SearXNG](../docs/features/searxng-search.html)
* [Pemecahan Masalah](../docs/troubleshooting.html)
* [Evaluasi](../docs/features/evals.html)
* [Taste](../docs/taste.html)

## Debugging

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## Catatan Platform

### Windows

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

Biner `ripgrep` yang telah dikompilasi untuk Windows mungkin disertakan di:

```text
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## Berkontribusi

Baca file-file ini sebelum berkontribusi:

* [CONTRIBUTING.md](../CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
* [SECURITY.md](../SECURITY.md)
* [LICENSE.md](../LICENSE.md)

Jangan kirimkan kode kepemilikan, sumber yang disalin, materi bocor, kredensial, kunci pribadi, atau konten yang tidak memiliki hak lisensi.

## Keamanan

Jangan buka masalah publik untuk kerentanan keamanan.

Gunakan proses pelaporan pribadi yang dijelaskan di [SECURITY.md](../SECURITY.md).

## Lisensi

Lihat [LICENSE.md](../LICENSE.md).

Hanya modifikasi dan tambahan asli yang dibuat oleh kontributor yang dilisensikan seperti yang dijelaskan dalam `LICENSE.md`.
