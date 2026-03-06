const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const modelSelect = document.getElementById("model");
const voiceSelect = document.getElementById("voice");
const responseFormatSelect = document.getElementById("responseFormat");
const speedInput = document.getElementById("speed");
const speedValue = document.getElementById("speedValue");
const textInput = document.getElementById("textInput");
const charCount = document.getElementById("charCount");
const healthBtn = document.getElementById("healthBtn");
const speakBtn = document.getElementById("speakBtn");
const statusEl = document.getElementById("status");
const timingEl = document.getElementById("timing");
const audioPlayer = document.getElementById("audioPlayer");
const downloadLink = document.getElementById("downloadLink");

let currentAudioUrl = null;

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.className = tone ? `status ${tone}` : "status";
}

function sanitizeBaseUrl(rawUrl) {
  return rawUrl.trim().replace(/\/$/, "");
}

function updateCharCount() {
  charCount.textContent = String(textInput.value.length);
}

function updateSpeedLabel() {
  speedValue.textContent = `${Number(speedInput.value).toFixed(2)}x`;
}

function resetAudio() {
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
  downloadLink.href = "#";
  downloadLink.classList.add("disabled");
  timingEl.textContent = "";
}

async function checkHealth() {
  const baseUrl = sanitizeBaseUrl(apiBaseUrlInput.value);
  if (!baseUrl) {
    setStatus("Enter a valid API URL.", "warn");
    return;
  }

  healthBtn.disabled = true;
  setStatus("Checking API health...", "warn");

  try {
    const response = await fetch(`${baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const modelState = data.model_loaded ? "model ready" : "model loading";
    const device = data.device || "unknown device";
    setStatus(`Healthy: ${modelState} on ${device}.`, data.model_loaded ? "ok" : "warn");
  } catch (error) {
    setStatus(`Health check failed: ${error.message}`, "error");
  } finally {
    healthBtn.disabled = false;
  }
}

async function generateSpeech() {
  const baseUrl = sanitizeBaseUrl(apiBaseUrlInput.value);
  const text = textInput.value.trim();

  if (!baseUrl) {
    setStatus("Enter a valid API URL.", "warn");
    return;
  }

  if (!text) {
    setStatus("Text cannot be empty.", "warn");
    return;
  }

  if (text.length > 4096) {
    setStatus("Text exceeds 4096 character limit.", "warn");
    return;
  }

  speakBtn.disabled = true;
  healthBtn.disabled = true;
  resetAudio();
  setStatus("Generating speech...", "warn");

  const payload = {
    model: modelSelect.value,
    input: text,
    voice: voiceSelect.value,
    response_format: responseFormatSelect.value,
    speed: Number(speedInput.value)
  };

  try {
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }

    const blob = await response.blob();
    const elapsedMs = performance.now() - startedAt;
    const generationHeader = response.headers.get("X-Generation-Time");
    const generationSeconds = generationHeader ? `${Number(generationHeader).toFixed(2)}s` : "n/a";

    currentAudioUrl = URL.createObjectURL(blob);
    audioPlayer.src = currentAudioUrl;
    audioPlayer.load();

    const format = responseFormatSelect.value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `kyutai_tts_${timestamp}.${format}`;
    downloadLink.href = currentAudioUrl;
    downloadLink.download = filename;
    downloadLink.classList.remove("disabled");

    timingEl.textContent = `API generation: ${generationSeconds} | Round-trip: ${(elapsedMs / 1000).toFixed(2)}s`;
    setStatus("Speech generated. You can play or download it.", "ok");
  } catch (error) {
    setStatus(`Generation failed: ${error.message}`, "error");
  } finally {
    speakBtn.disabled = false;
    healthBtn.disabled = false;
  }
}

speedInput.addEventListener("input", updateSpeedLabel);
textInput.addEventListener("input", updateCharCount);
healthBtn.addEventListener("click", checkHealth);
speakBtn.addEventListener("click", generateSpeech);

window.addEventListener("beforeunload", () => {
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
  }
});

updateSpeedLabel();
updateCharCount();
setStatus("Idle.");
