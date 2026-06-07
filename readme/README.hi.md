<p align="center">
  <img src="../assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>भाषा:</strong>
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
  <a href="README.ru.md">Русский</a> ·
  <a href="README.hi.md"><strong>हिन्दी</strong></a>
</p>

# Clew 🪽

Clew AI-सहायता प्राप्त सॉफ़्टवेयर विकास के लिए एक अनौपचारिक, अनुसंधान-उन्मुख CLI है।

यह प्रोजेक्ट स्रोत-निर्मित पुनर्निर्माण और विस्तार परियोजना है, जिसे स्थानीय विकास, डिबगिंग, स्व-होस्टेड वर्कफ़्लो और प्रदाता चयन के लिए डिज़ाइन किया गया है।

> **अस्वीकरण:** Anthropic, Claude और Claude Code उनके संबंधित मालिकों के ट्रेडमार्क हैं। कृपया इस रिपॉजिटरी का उपयोग, संशोधन, पुनर्वितरण या तैनाती करने से पहले [LICENSE.md](../LICENSE.md) पढ़ें।

## विशेषताएँ

- **बहु-प्रदाता रूटिंग** — Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot और अन्य का समर्थन
- **रनटाइम पर मॉडल बदलें** — सत्र के दौरान मॉडल या प्रदाता बदलने के लिए `/model` का उपयोग करें
- **टूल-संचालित वर्कफ़्लो** — फ़ाइल पढ़ना/लिखना, शेल कमांड, LSP, MCP टूल, ब्राउज़र ऑटोमेशन
- **प्लगइन हुक** — प्रॉम्प्ट, शेल निष्पादन, टूल कॉल आदि में हुक करें
- **डायनामिक स्किल्स** — प्रोजेक्ट और `.claude/skills/` से स्किल्स लोड करें
- **कोड समीक्षा** — `/code-review --fix` और `/simplify`
- **एजेंट और पर्यवेक्षक** — बैकग्राउंड एजेंट और बहु-चरणीय वर्कफ़्लो
- **शेड्यूल किए गए कार्य** — `/task` से एक बार या आवर्ती कार्य बनाएं
- **सत्र और ब्रिज मोड** — रिमोट वर्कफ़्लो के लिए

## त्वरित आरंभ

```bash
git clone https://github.com/JonusNattapong/ClewCode.git
cd ClewCode
bun install
bun run build
bun run start
```

डेवलपमेंट मोड: `bun run dev`

## सिस्टम आवश्यकताएँ

- Bun 1.3+, Node.js 18+, Git
- Windows / macOS / Linux / WSL2
- कम से कम एक समर्थित प्रदाता से API कुंजी

## लाइसेंस

[LICENSE.md](../LICENSE.md) देखें।
