<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Ngôn ngữ:</strong>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">中文 (简体)</a> ·
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

Clew là CLI không chính thức dành cho nghiên cứu phát triển phần mềm với sự hỗ trợ của AI.

Dự án này là bản tái thiết và mở rộng từ mã nguồn, được thiết kế cho phát triển cục bộ, gỡ lỗi, quy trình làm việc tự quản và lựa chọn nhà cung cấp AI.

> **Tuyên bố miễn trừ:** Anthropic, Claude và Claude Code là nhãn hiệu của chủ sở hữu tương ứng. Vui lòng đọc [LICENSE.md](../LICENSE.md) trước khi sử dụng, sửa đổi, phân phối lại hoặc triển khai kho lưu trữ này.

## Tính năng

- **Định tuyến đa nhà cung cấp** — Hỗ trợ Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot, v.v.
- **Chuyển đổi mô hình khi đang chạy** — Dùng `/model` để chuyển đổi mô hình hoặc nhà cung cấp trong phiên làm việc
- **Quy trình làm việc dựa trên công cụ** — Đọc/ghi file, lệnh shell, LSP, công cụ MCP, tự động hóa trình duyệt
- **Plugin hooks** — Móc vào prompt, thực thi shell, gọi công cụ, v.v.
- **Kỹ năng động** — Tải kỹ năng từ dự án và `.claude/skills/`
- **Đánh giá mã** — `/code-review --fix` và `/simplify`
- **Tác nhân và giám sát** — Tác nhân nền và quy trình làm việc đa bước
- **Tác vụ theo lịch** — Tạo tác vụ một lần hoặc định kỳ với `/task`
- **Phiên làm việc và chế độ cầu nối** — Cho quy trình làm việc từ xa

## Bắt đầu nhanh

```bash
git clone https://github.com/JonusNattapong/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

Chế độ phát triển: `bun run dev`

## Yêu cầu hệ thống

- Bun 1.3+, Node.js 18+, Git
- Windows / macOS / Linux / WSL2
- Khóa API từ ít nhất một nhà cung cấp được hỗ trợ

## Giấy phép

Xem [LICENSE.md](../LICENSE.md).
