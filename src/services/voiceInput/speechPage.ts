export function speechPageHtml(lang = 'th-TH'): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Voice Input</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0f0f13;
    color: #c8c8d0;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 20px;
  }
  .card {
    background: #19191f;
    border: 1px solid #2mesh35;
    border-radius: 16px;
    padding: 40px 48px 32px;
    width: 100%; max-width: 460px;
    display: flex; flex-direction: column; align-items: center; gap: 24px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.4);
  }
  .logo-wrap {
    width: 72px; height: 72px;
    display: flex; align-items: center; justify-content: center;
  }
  .logo-wrap svg {
    width: 56px; height: auto;
    opacity: 0.45;
    transition: opacity 0.3s;
    display: block;
  }
  .logo-wrap.active svg { opacity: 1; }
  .logo-wrap.done svg { opacity: 0.8; }
  .logo-ring {
    position: absolute;
    width: 80px; height: 80px;
    border-radius: 50%;
    border: 2px solid #2mesh35;
    transition: all 0.3s ease;
  }
  .logo-ring.active {
    border-color: #7c5cfc;
    box-shadow: 0 0 30px rgba(124,92,252,0.25);
    animation: ring-pulse 1.2s ease-in-out infinite;
  }
  .logo-ring.done {
    border-color: #34d399;
    box-shadow: 0 0 30px rgba(52,211,153,0.2);
  }

  @keyframes ring-pulse {
    0% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.06); opacity: 1; }
    100% { transform: scale(1); opacity: 0.6; }
  }

  .wave {
    display: flex; align-items: center; gap: 3px; height: 36px;
    opacity: 0; transition: opacity 0.3s;
  }
  .wave.active { opacity: 1; }
  .wave .b {
    width: 3px; border-radius: 2px;
    background: #7c5cfc;
    height: 4px;
    animation: wa 0.55s ease-in-out infinite alternate;
  }
  .wave .b:nth-child(1) { animation-delay: 0s; }
  .wave .b:nth-child(2) { animation-delay: 0.08s; }
  .wave .b:nth-child(3) { animation-delay: 0.16s; }
  .wave .b:nth-child(4) { animation-delay: 0.24s; }
  .wave .b:nth-child(5) { animation-delay: 0.10s; }
  .wave .b:nth-child(6) { animation-delay: 0.18s; }
  .wave .b:nth-child(7) { animation-delay: 0.05s; }
  .wave .b:nth-child(8) { animation-delay: 0.22s; }
  .wave .b:nth-child(9) { animation-delay: 0.12s; }
  .wave .b:nth-child(10) { animation-delay: 0.28s; }
  @keyframes wa {
    0% { height: 4px; }
    100% { height: 28px; }
  }

  .status {
    font-size: 14px; font-weight: 500;
    color: #888; text-align: center;
    min-height: 20px; letter-spacing: 0.01em;
  }
  .status.active { color: #7c5cfc; }
  .status.done { color: #34d399; }

  .result-box {
    width: 100%;
    background: #0f0f13;
    border: 1px solid #2mesh35;
    border-radius: 10px;
    padding: 14px 18px;
    min-height: 52px;
    font-size: 17px; line-height: 1.6;
    color: #eee;
    text-align: center;
    word-wrap: break-word;
    transition: border-color 0.3s;
  }
  .result-box.done { border-color: #34d399; }
  .result-box.recording { border-color: #7c5cfc; }

  .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .btn {
    padding: 10px 28px;
    border: none; border-radius: 10px;
    font-size: 14px; font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }
  .btn:active { transform: scale(0.97); }
  .btn-primary {
    background: #7c5cfc; color: #fff;
  }
  .btn-primary:hover { background: #6a4ae8; }
  .btn-primary:disabled { background: #2mesh35; color: #555; cursor: default; }
  .btn-secondary {
    background: #2mesh35; color: #999;
  }
  .btn-secondary:hover { background: #35354a; color: #ccc; }

  .lang-wrap {
    display: flex; gap: 6px; align-items: center;
    margin-top: 4px;
  }
  .lang-wrap label {
    font-size: 12px; color: #555;
  }
  .lang-wrap select {
    background: #0f0f13; color: #aaa;
    border: 1px solid #2mesh35; border-radius: 6px;
    padding: 6px 12px; font-size: 13px;
    font-family: inherit;
  }
  .hint {
    font-size: 12px; color: #444;
    text-align: center;
  }
</style>
</head>
<body>
<div class="card">
  <div style="position:relative;display:flex;align-items:center;justify-content:center">
    <div class="logo-ring" id="ring"></div>
    <div class="logo-wrap" id="logoWrap">
      <svg viewBox="-10 0 200 190" xmlns="http://www.w3.org/2000/svg" style="image-rendering:crisp-edges">
        <rect fill="#8b5cf6" x="45" y="0" width="15" height="15"/>
        <rect fill="#8b5cf6" x="120" y="0" width="15" height="15"/>
        <rect fill="#8b5cf6" x="30" y="15" width="120" height="15"/>
        <rect fill="#8b5cf6" x="30" y="30" width="120" height="30"/>
        <rect fill="#000000" x="45" y="30" width="90" height="30"/>
        <rect fill="#8b5cf6" x="30" y="60" width="120" height="15"/>
        <rect fill="#8b5cf6" x="0" y="75" width="180" height="15"/>
        <rect fill="#8b5cf6" x="0" y="90" width="180" height="15"/>
        <rect fill="#8b5cf6" x="30" y="105" width="120" height="15"/>
        <rect fill="#8b5cf6" x="30" y="120" width="120" height="15"/>
        <rect fill="#8b5cf6" x="30" y="135" width="15" height="45"/>
        <rect fill="#8b5cf6" x="60" y="135" width="15" height="45"/>
        <rect fill="#8b5cf6" x="105" y="135" width="15" height="45"/>
        <rect fill="#8b5cf6" x="135" y="135" width="15" height="45"/>
      </svg>
    </div>
  </div>

  <div class="wave" id="wave">
    <div class="b"></div><div class="b"></div><div class="b"></div>
    <div class="b"></div><div class="b"></div><div class="b"></div>
    <div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div>
  </div>

  <div class="status" id="status">Press record to start</div>

  <div class="result-box" id="result"></div>

  <div class="row">
    <button class="btn btn-primary" id="recordBtn">Record</button>
    <button class="btn btn-primary" id="sendBtn" disabled>Send</button>
  </div>

  <div class="lang-wrap">
    <label>Language</label>
    <select id="lang">
      <option value="th-TH" ${lang === 'th-TH' ? 'selected' : ''}>ไทย</option>
      <option value="en-US" ${lang === 'en-US' ? 'selected' : ''}>English</option>
      <option value="ja-JP" ${lang === 'ja-JP' ? 'selected' : ''}>日本語</option>
      <option value="zh-CN" ${lang === 'zh-CN' ? 'selected' : ''}>中文</option>
      <option value="ko-KR" ${lang === 'ko-KR' ? 'selected' : ''}>한국어</option>
      <option value="vi-VN" ${lang === 'vi-VN' ? 'selected' : ''}>Tiếng Việt</option>
      <option value="fr-FR" ${lang === 'fr-FR' ? 'selected' : ''}>Français</option>
      <option value="de-DE" ${lang === 'de-DE' ? 'selected' : ''}>Deutsch</option>
      <option value="es-ES" ${lang === 'es-ES' ? 'selected' : ''}>Español</option>
    </select>
  </div>

  <div class="hint" id="hint">Click Record, speak, then Send</div>
</div>

<script>
  const BASE = '';
  const ring = document.getElementById('ring');
  const logoWrap = document.getElementById('logoWrap');
  const wave = document.getElementById('wave');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const hint = document.getElementById('hint');
  const recordBtn = document.getElementById('recordBtn');
  const sendBtn = document.getElementById('sendBtn');
  const lang = document.getElementById('lang');

  let transcript = '';
  let recording = false;
  let recognition = null;

  async function sendResult(text) {
    try { await fetch(BASE + '/result', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text}) }); } catch {}
  }

  function setUI(state) {
    ring.className = 'logo-ring' + (state ? ' ' + state : '');
    logoWrap.className = 'logo-wrap' + (state ? ' ' + state : '');
    wave.className = 'wave' + (state === 'active' ? ' active' : '');
    status.className = 'status' + (state ? ' ' + state : '');
    result.className = 'result-box' + (state === 'active' ? ' recording' : '') + (state === 'done' ? ' done' : '');
  }

  function startRec() {
    if (recognition) recognition.abort();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { status.textContent = 'Speech recognition not supported'; return; }

    recording = true;
    recordBtn.textContent = 'Stop';
    sendBtn.disabled = true;
    transcript = '';
    result.textContent = '';
    setUI('active');
    status.textContent = lang.value === 'th-TH' ? 'Listening...' : 'Listening...';
    hint.textContent = lang.value === 'th-TH' ? 'Speak clearly' : 'Speak clearly';

    const rec = new SR();
    recognition = rec;
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = lang.value;

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcript += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      result.textContent = transcript + interim;
    };

    rec.onend = () => {
      if (transcript.trim()) {
        setUI('done');
        status.textContent = 'Done';
        hint.textContent = 'Review then Send';
        sendBtn.disabled = false;
        recordBtn.textContent = 'Record';
        recording = false;
        sendResult(transcript.trim());
      } else if (recording) {
        rec.start();
      } else {
        setUI('');
        status.textContent = 'No speech';
        recordBtn.textContent = 'Record';
      }
    };

    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      if (e.error === 'no-speech') {
        if (recording) setTimeout(() => rec.start(), 200);
        return;
      }
      if (e.error === 'not-allowed') {
        status.textContent = 'Microphone access denied';
        recording = false;
        recordBtn.textContent = 'Record';
        setUI('');
        return;
      }
      status.textContent = 'Error: ' + e.error;
      recording = false;
      recordBtn.textContent = 'Record';
    };

    try { rec.start(); } catch (e) {
      status.textContent = 'Error: ' + e.message;
      recording = false;
      recordBtn.textContent = 'Record';
    }
  }

  function stopRec() {
    recording = false;
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
    recordBtn.textContent = 'Record';
    setUI('');
    if (!transcript.trim()) {
      status.textContent = 'Stopped';
      hint.textContent = 'Click Record to start';
    }
  }

  recordBtn.addEventListener('click', () => {
    recording ? stopRec() : startRec();
  });

  sendBtn.addEventListener('click', async () => {
    if (transcript.trim()) {
      await sendResult(transcript.trim());
      status.textContent = 'Sent ✓';
      hint.textContent = 'Switch to terminal and run /voice check';
      sendBtn.disabled = true;
    }
  });

  lang.addEventListener('change', () => {
    if (recording) { stopRec(); startRec(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stopRec();
    if (e.key === 'Enter' && !sendBtn.disabled) sendBtn.click();
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'SELECT') {
      recording ? stopRec() : startRec();
    }
  });
</script>
</div>
</body>
</html>`;
}
