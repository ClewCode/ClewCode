<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Ngôn ngữ:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文</a> ·
  <a href="README.th.md">ไทย</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.vi.md"><strong>Tiếng Việt</strong></a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

# Clew 🪽

Clew là CLI không chính thức, định hướng nghiên cứu dành cho phát triển phần mềm với sự hỗ trợ của AI.

Đây là dự án tái xây dựng và mở rộng từ mã nguồn, được thiết kế cho phát triển cục bộ, gỡ lỗi, quy trình làm việc tự quản và tự do lựa chọn nhà cung cấp.

Kho lưu trữ này không phải là sản phẩm chính thức, bản phân phối, dự án đối tác hay triển khai được hỗ trợ.

> **Tuyên bố miễn trừ:** Dự án này không liên kết, được xác nhận, tài trợ hoặc phê duyệt bởi bên thứ ba nào. Vui lòng đọc [LICENSE.md](../LICENSE.md) trước khi sử dụng, sửa đổi, phân phối lại hoặc triển khai kho lưu trữ này.

## Dự án này cung cấp những gì

| Lĩnh vực                | Mô tả                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| CLI xây dựng từ mã nguồn | Ứng dụng terminal Bun/TypeScript có thể xây dựng, kiểm thử, kiểm tra và sửa đổi cục bộ                              |
| Định tuyến đa nhà cung cấp | Hỗ trợ nhiều nhà cung cấp AI thông qua bộ điều hợp và lệnh chọn mô hình                                             |
| Công cụ phát triển      | Các lệnh kiểm tra ngữ cảnh, đánh giá mã, đơn giản hóa, nghiên cứu, plugin, MCP, LSP, phiên và quy trình nền         |
| Mở rộng cục bộ          | Hỗ trợ plugin, hook, skill, công cụ tùy chỉnh, tác vụ theo lịch và cấu hình cấp dự án                              |
| Mục đích nghiên cứu     | Mã nguồn minh bạch để nghiên cứu kiến trúc tác nhân lập trình AI, UX terminal, định tuyến nhà cung cấp và thực thi công cụ |

## Tính năng

Clew chạy trực tiếp trong terminal của bạn. Nó có thể kiểm tra và chỉnh sửa mã nguồn cục bộ, thực thi lệnh shell với phân quyền, chuyển đổi nhà cung cấp mô hình và điều phối quy trình làm việc tác nhân dài hạn.

Tính năng chính:

* **Định tuyến AI đa nhà cung cấp** — Hỗ trợ Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot và các endpoint tương thích OpenAI
* **Chuyển đổi mô hình khi đang chạy** — Sử dụng `/model` để chuyển đổi mô hình hoặc nhà cung cấp trong phiên làm việc
* **Quy trình làm việc dựa trên công cụ** — Đọc, tìm kiếm, chỉnh sửa và ghi file; thực thi lệnh shell; truy vấn LSP; chạy công cụ MCP; tích hợp tự động hóa trình duyệt
* **Hook plugin** — Móc vào prompt, thực thi shell, gọi công cụ, hiển thị tin nhắn, bắt đầu phiên và hành động chỉnh sửa file
* **Skill động** — Tải skill từ dự án và `.claude/skills/`
* **Công cụ đánh giá mã** — Sử dụng `/code-review --fix` để kiểm tra và áp dụng thay đổi, `/simplify` để dọn dẹp mã
* **Đánh giá tự động Guardian** — `/guardian` định tuyến yêu cầu cấp quyền đến người đánh giá LLM với bộ ngắt mạch
* **Quản lý PR** — `/pr create`, `list`, `view`, `review`, `merge`, `status`
* **Điều khiển từ xa độc lập nhà cung cấp** — `/remote` để chia sẻ CLI qua WebSocket
* **Trình chọn mô hình** — Chọn mô hình toàn cục hoặc chỉ trong phiên
* **Chợ plugin** — Hỗ trợ `skipLfs` cho nguồn plugin
* **Nghiên cứu cục bộ** — Sử dụng `/research <query>` cho quy trình nghiên cứu với thu thập web cục bộ
* **Tác nhân và giám sát** — Quản lý tác nhân nền, quy trình đa bước, tóm tắt, trạng thái tác vụ, phê duyệt và trạng thái phiên
* **Lệnh shell nền** — Chạy lệnh dài với `!bg <command>`
* **Tác vụ theo lịch** — Tạo tác vụ một lần hoặc định kỳ với `/task`
* **Phiên và chế độ bridge** — Lưu, khôi phục và kết nối phiên cho quy trình từ xa

## Bắt đầu nhanh

### Cài đặt toàn cục

```bash
npm install -g clew-code
```

Hoặc:

```bash
bun install -g clew-code
```

Chạy CLI trong thư mục dự án:

```bash
clew
```

> Trình khởi chạy toàn cục yêu cầu Bun được cài đặt trên hệ thống

### Chạy từ mã nguồn

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode

bun install
bun run build
bun run start
```

Chế độ phát triển:

```bash
bun run dev
```

## Yêu cầu hệ thống

- Bun 1.3 trở lên
- Node.js 18 trở lên
- Git
- Windows, macOS, Linux hoặc WSL2
- Khóa API từ ít nhất một nhà cung cấp được hỗ trợ (không cần nếu dùng nhà cung cấp cục bộ như Ollama)

## Cấu hình nhà cung cấp

Đặt khóa nhà cung cấp trong shell hoặc file `.env`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

Chuyển đổi mô hình/nhà cung cấp trong phiên:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

Tài liệu nhà cung cấp:

```text
docs/providers.html
```

## Lệnh thông dụng

```text
/model        Chuyển đổi mô hình hoặc nhà cung cấp
/taste        Mở menu tùy chỉnh học tập
/status       Xem trạng thái nhà cung cấp, phiên và ngữ cảnh
/doctor       Chạy chẩn đoán
/context      Kiểm tra sử dụng ngữ cảnh
/compact      Nén lịch sử hội thoại
/mcp          Quản lý máy chủ MCP
/code-review  Đánh giá thay đổi mã
/simplify     Đánh giá tập trung vào dọn dẹp
/plugin       Quản lý plugin và hook
/bridge       Thiết lập chế độ bridge
/agent        Quản lý quy trình tác nhân nền
/daemon       Mở bảng điều khiển daemon tự động
/task         Tạo hoặc quản lý tác vụ theo lịch
```

Gõ `/` trong CLI để xem danh sách đầy đủ các lệnh.

## Tác vụ theo lịch

Hệ thống tác vụ theo lịch có sẵn qua `/task`.

```text
/task
```

Ví dụ:

```text
/task
Name: Kiểm tra máy chủ
Schedule: Daily
Time: 20:00
Prompt: Kiểm tra trạng thái máy chủ cục bộ
Storage: Durable
```

```text
/task
Name: Nhắc nhở commit
Schedule: In N minutes
Delay: 10
Prompt: Nhắc tôi commit mã
Storage: Session-only
```

Hành vi tác vụ:

* Tác vụ Durable được lưu vào `.claude/scheduled_tasks.json`
* Tác vụ Session-only chỉ chạy trong phiên hoạt động
* Tác vụ định kỳ sử dụng cú pháp cron 5 trường tiêu chuẩn
* Tác vụ một lần bị xóa sau khi chạy
* Múi giờ máy cục bộ được sử dụng cho thực thi theo lịch

## Taste

Taste là runtime học tập ưu tiên cục bộ. Nó học từ các tín hiệu chấp nhận, từ chối, chỉnh sửa, kiểm thử, lint và quy tắc thủ công. Nó kết hợp quy tắc biểu tượng, điểm số ưu tiên ngữ nghĩa và tối ưu hóa contextual bandit để thích ứng Clew với phong cách viết mã của bạn. Nó không fine-tune LLM cơ sở.

```text
/taste                Mở menu tương tác
/taste learn <rule>   Thêm quy tắc thủ công
/taste forget <id>    Xóa quy tắc
/taste profile        Hiển thị tất cả quy tắc
/taste events         Hiển thị sự kiện gần đây
/taste decay          Áp dụng giảm độ tin cậy
/taste eval           Chạy tự đánh giá
/taste export         Xuất quy tắc độ tin cậy cao
/taste import <file>  Nhập quy tắc từ file
/taste on             Bật Taste
/taste off            Tắt Taste
```

### Khả năng chính

- **Menu tương tác** — Hộp thoại điều hướng phím mũi tên với 11 hành động, Spinner cho tác vụ bất đồng bộ
- **Xác thực chỉnh sửa** — Quét chỉnh sửa trong yêu cầu cấp quyền, cảnh báo khi vi phạm quy tắc đã học
- **Tải lại cấu hình trực tiếp** — Đăng ký thay đổi `settings.json` qua `subscribeToSettingsChanges()`
- **Dòng trạng thái** — `ⓘ taste: N rules` hiển thị trong PromptInputFooter
- **Tiêm prompt** — Tiêm khối XML `<clew_taste>` với tối đa 8 quy tắc liên quan vào prompt hệ thống
- **Thu thập tín hiệu** — Tín hiệu fire-and-forget từ PermissionContext và thực thi công cụ
- **Cơ chế suy giảm** — Giảm độ tin cậy dần dần cho quy tắc không sử dụng (dựa trên chu kỳ bán rã, mặc định 30 ngày)

Xem [docs/taste.html](../docs/taste.html) để có tài liệu đầy đủ.

## Phát triển

```bash
bun run dev              # Bắt đầu chế độ phát triển
bun run start            # Chạy CLI từ mã nguồn
bun run build            # Xây dựng vào dist/
bun test                 # Chạy kiểm thử
bun x tsc --noEmit       # Kiểm tra kiểu
bun run lint:check       # Kiểm tra quy tắc Biome lint
bun run format:check     # Kiểm tra định dạng Biome
bun run check:ci         # Chạy xác thực Biome CI
```

Tiện ích phát triển:

```bash
bun run preload <module>     # Tải trước ngữ cảnh module
bun run session <command>    # Lưu, liệt kê hoặc khôi phục ngữ cảnh phiên
bun run codegraph            # Tạo biểu đồ phụ thuộc module
bun run ast-grep -- <args>   # Chạy tìm kiếm hoặc viết lại AST cấu trúc
```

## Cấu trúc dự án

```text
src/
├── main.tsx              # Khởi tạo UI terminal và vòng lặp chính
├── query.ts              # Xử lý truy vấn và logic prompt hệ thống
├── QueryEngine.ts        # Điều phối truy vấn, bộ nhớ đệm, loại bỏ trùng lặp và giới hạn tốc độ
├── agentRuntime/         # Điều phối tác nhân và kho lưu trữ chạy bền vững
├── commands/             # Triển khai lệnh slash
├── tools/                # Công cụ phát triển tích hợp
├── services/
│   ├── ai/               # Quản lý nhà cung cấp, bộ điều hợp, chuẩn hóa và providers.json
│   ├── mcp/              # Trình khách Model Context Protocol
│   ├── plugins/          # Hook và bộ chặn vòng đời plugin
│   ├── tools/            # Dịch vụ thực thi công cụ
│   ├── lsp/              # Tích hợp Language Server Protocol
│   ├── Supervisor/       # Giám sát tác nhân nền
│   └── SessionMemory/    # Bộ nhớ phiên bền vững
├── skills/               # Trình tải skill động
├── cli/                  # Ngữ cảnh UI terminal
├── components/           # Thành phần UI terminal
├── bridge/               # Cầu nối WebSocket
├── coordinator/          # Điều phối đa tác nhân
├── keybindings/          # Ánh xạ phím tắt
├── state/                # Kho lưu trữ phản ứng
└── vim/                  # Chế độ điều hướng kiểu Vim
```

## Kiến trúc

```text
Terminal UI
  -> Đăng ký lệnh và phím tắt
  -> Quản lý nhà cung cấp và bộ điều hợp AI
  -> Công cụ truy vấn và vòng lặp streaming
  -> Dịch vụ thực thi công cụ
  -> Plugin, MCP, LSP, tác nhân, bộ nhớ phiên và cầu nối
```

## Tài liệu

* [Cài đặt](../docs/installation.html)
* [Bắt đầu nhanh](../docs/quick-start.html)
* [Cấu hình](../docs/configuration.html)
* [Nhà cung cấp AI](../docs/providers.html)
* [Mô hình](../docs/models.html)
* [Lệnh](../docs/commands.html)
* [Công cụ](../docs/tools.html)
* [Plugin](../docs/plugins.html)
* [Skill](../docs/skills.html)
* [Kiến trúc](../docs/architecture.html)
* [Mô hình quyền](../docs/permission-model.html)
* [Chế độ Bridge](../docs/features/bridge-mode.html)
* [Khắc phục sự cố](../docs/troubleshooting.html)
* [Đánh giá](../docs/features/evals.html)
* [Taste](../docs/taste.html)

## Gỡ lỗi

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## Ghi chú nền tảng

### Windows

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

Tệp nhị phân `ripgrep` được biên dịch sẵn cho Windows có thể được đóng gói tại:

```text
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## Đóng góp

Đọc các tệp này trước khi đóng góp:

* [CONTRIBUTING.md](../CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
* [SECURITY.md](../SECURITY.md)
* [LICENSE.md](../LICENSE.md)

Không gửi mã độc quyền, mã nguồn sao chép, tài liệu bị rò rỉ, thông tin xác thực, khóa riêng tư hoặc nội dung bạn không có quyền cấp phép.

## Bảo mật

Không mở issue công khai cho lỗ hổng bảo mật.

Sử dụng quy trình báo cáo riêng tư được mô tả trong [SECURITY.md](../SECURITY.md).


## Changelog

<details>
<summary><strong>0.2.4 — 2026-06-08</strong></summary>

- **Peer-to-peer** — LAN discovery, task delegation, 14 AI tools
- **Taste tools** — taste_learn, taste_forget, taste_profile, taste_suggest
- **Autonomous agents** — agent loop, supervisor, task queue, Loop Lock
- **Workflow Rainbow** — per-character gradient

</details>

[Full changelog](../CHANGELOG.md)

## Giấy phép

Xem [LICENSE.md](../LICENSE.md).

Chỉ các sửa đổi và bổ sung gốc do người đóng góp tạo ra mới được cấp phép theo mô tả trong `LICENSE.md`.
