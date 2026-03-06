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
const generateAllBtn = document.getElementById("generateAllBtn");
const stopAllBtn = document.getElementById("stopAllBtn");
const statusEl = document.getElementById("status");
const timingEl = document.getElementById("timing");
const audioPlayer = document.getElementById("audioPlayer");
const downloadLink = document.getElementById("downloadLink");
const singleFavoriteBtn = document.getElementById("singleFavoriteBtn");
const voiceResults = document.getElementById("voiceResults");
const defaultSampleText = "Les chaussettes de l'archiduchesse sont-elles seches, archi-seches, ou archi-seches sous ses chaussures chics ?\n\nUn chasseur sachant chasser sans son chien est un bon chasseur ; mais ce chasseur-ci chasse-t-il aussi bien sans son chien que son chien chasse avec lui ?";

let currentAudioUrl = null;
const voiceCardAudioUrls = [];
const fallbackVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "dev1", "dev3"];
let availableVoiceIds = [...fallbackVoices];
const favoritesCookieName = "kyutai_favorite_voices";
let bulkStopRequested = false;
let bulkAbortController = null;
let bulkGenerationRunning = false;
let currentSingleVoice = "";

function readCookie(name) {
  const prefix = `${name}=`;
  const cookiePair = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookiePair ? cookiePair.slice(prefix.length) : null;
}

function getFavoriteVoices() {
  const rawValue = readCookie(favoritesCookieName);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue));
    return Array.isArray(parsed) ? [...new Set(parsed.filter(Boolean))] : [];
  } catch {
    return [];
  }
}

function saveFavoriteVoices(favoriteVoiceIds) {
  const sanitized = [...new Set(favoriteVoiceIds.filter(Boolean))];
  document.cookie = `${favoritesCookieName}=${encodeURIComponent(JSON.stringify(sanitized))}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function isFavoriteVoice(voiceId) {
  return getFavoriteVoices().includes(voiceId);
}

function toggleFavoriteVoice(voiceId) {
  const favorites = new Set(getFavoriteVoices());
  if (favorites.has(voiceId)) {
    favorites.delete(voiceId);
  } else {
    favorites.add(voiceId);
  }
  saveFavoriteVoices([...favorites]);
}

function sortVoiceIdsByFavorites(voiceIds) {
  const uniqueVoiceIds = [...new Set(voiceIds.filter(Boolean))];
  const favorites = new Set(getFavoriteVoices());
  const favoriteIds = [];
  const regularIds = [];

  uniqueVoiceIds.forEach((voiceId) => {
    if (favorites.has(voiceId)) {
      favoriteIds.push(voiceId);
    } else {
      regularIds.push(voiceId);
    }
  });

  return [...favoriteIds, ...regularIds];
}

function shuffleArray(values) {
  const items = [...values];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function getBulkGenerationVoices(voiceIds) {
  const uniqueVoiceIds = [...new Set(voiceIds.filter(Boolean))];
  const favorites = new Set(getFavoriteVoices());
  const favoriteVoices = [];
  const regularVoices = [];

  uniqueVoiceIds.forEach((voiceId) => {
    if (favorites.has(voiceId)) {
      favoriteVoices.push(voiceId);
    } else {
      regularVoices.push(voiceId);
    }
  });

  return [...shuffleArray(favoriteVoices), ...shuffleArray(regularVoices)];
}

function renderVoiceOptionLabel(voiceId) {
  return `${isFavoriteVoice(voiceId) ? "★" : "☆"} ${voiceId}`;
}

function pickRandomVoiceId(voiceIds) {
  if (!voiceIds.length) {
    return "";
  }
  const randomIndex = Math.floor(Math.random() * voiceIds.length);
  return voiceIds[randomIndex];
}

function updateVoiceCardFavoriteUI(card, starButton, voiceId) {
  const favorite = isFavoriteVoice(voiceId);
  card.classList.toggle("favorite", favorite);
  starButton.classList.toggle("active", favorite);
  starButton.setAttribute("aria-pressed", String(favorite));
  starButton.title = favorite ? "Remove favorite" : "Mark as favorite";
  starButton.textContent = favorite ? "★" : "☆";
}

function updateSingleFavoriteButton() {
  if (!currentSingleVoice) {
    singleFavoriteBtn.disabled = true;
    singleFavoriteBtn.classList.remove("active");
    singleFavoriteBtn.setAttribute("aria-pressed", "false");
    singleFavoriteBtn.title = "Generate a single voice first";
    singleFavoriteBtn.textContent = "☆";
    return;
  }

  const favorite = isFavoriteVoice(currentSingleVoice);
  singleFavoriteBtn.disabled = false;
  singleFavoriteBtn.classList.toggle("active", favorite);
  singleFavoriteBtn.setAttribute("aria-pressed", String(favorite));
  singleFavoriteBtn.title = favorite
    ? `Remove ${currentSingleVoice} from favorites`
    : `Add ${currentSingleVoice} to favorites`;
  singleFavoriteBtn.textContent = favorite ? "★" : "☆";
}

function refreshFavoriteDependentUI(preferredVoice) {
  const preservedVoice = preferredVoice || voiceSelect.value;
  populateVoiceSelect(availableVoiceIds, preservedVoice);
  reorderVoiceCards();

  Array.from(voiceResults.querySelectorAll(".voice-card")).forEach((card) => {
    const voiceId = card.dataset.voiceId || "";
    const starButton = card.querySelector(".favorite-star");
    if (voiceId && starButton) {
      updateVoiceCardFavoriteUI(card, starButton, voiceId);
    }
  });

  updateSingleFavoriteButton();
}

function reorderVoiceCards() {
  const cards = Array.from(voiceResults.querySelectorAll(".voice-card"));
  const favorites = new Set(getFavoriteVoices());

  cards.sort((left, right) => {
    const leftVoice = left.dataset.voiceId || "";
    const rightVoice = right.dataset.voiceId || "";
    const leftIsFavorite = favorites.has(leftVoice) ? 1 : 0;
    const rightIsFavorite = favorites.has(rightVoice) ? 1 : 0;

    if (leftIsFavorite !== rightIsFavorite) {
      return rightIsFavorite - leftIsFavorite;
    }
    return leftVoice.localeCompare(rightVoice);
  });

  cards.forEach((card) => voiceResults.appendChild(card));
}

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.className = tone ? `status ${tone}` : "status";
}

function sanitizeBaseUrl(rawUrl) {
  return rawUrl.trim().replace(/\/$/, "");
}

function formatDownloadTimestamp(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

function updateCharCount() {
  charCount.textContent = String(textInput.value.length);
}

function clearDefaultTextOnClick() {
  if (textInput.value === defaultSampleText) {
    textInput.value = "";
    updateCharCount();
  }
}

function restoreDefaultTextOnBlur() {
  if (!textInput.value.trim()) {
    textInput.value = defaultSampleText;
    updateCharCount();
  }
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
  currentSingleVoice = "";
  updateSingleFavoriteButton();
}

function clearVoiceResults() {
  while (voiceCardAudioUrls.length) {
    URL.revokeObjectURL(voiceCardAudioUrls.pop());
  }
  voiceResults.innerHTML = "";
}

function setActionButtonsDisabled(disabled) {
  speakBtn.disabled = disabled;
  healthBtn.disabled = disabled;
  generateAllBtn.disabled = disabled;
}

function setStopButtonState(enabled) {
  stopAllBtn.disabled = !enabled;
}

function stopBulkGeneration() {
  if (!bulkGenerationRunning) {
    return;
  }

  bulkStopRequested = true;
  if (bulkAbortController) {
    bulkAbortController.abort();
  }
  setStatus("Stopping bulk generation...", "warn");
}

function createVoiceCard(voiceId) {
  const card = document.createElement("article");
  card.className = "voice-card";
  card.dataset.voiceId = voiceId;

  const head = document.createElement("div");
  head.className = "voice-card-head";

  const title = document.createElement("h3");
  title.textContent = voiceId;

  const starButton = document.createElement("button");
  starButton.type = "button";
  starButton.className = "favorite-star";

  updateVoiceCardFavoriteUI(card, starButton, voiceId);
  starButton.addEventListener("click", () => {
    toggleFavoriteVoice(voiceId);
    refreshFavoriteDependentUI(voiceSelect.value || voiceId);
  });

  head.appendChild(title);
  head.appendChild(starButton);

  const state = document.createElement("p");
  state.className = "voice-state";
  state.textContent = "Queued...";

  card.appendChild(head);
  card.appendChild(state);
  voiceResults.appendChild(card);

  return { card, state };
}

function populateVoiceSelect(voiceIds, preferredVoice = "alloy") {
  const sortedVoiceIds = sortVoiceIdsByFavorites(voiceIds);
  const favoriteDefault = sortedVoiceIds.find((voiceId) => isFavoriteVoice(voiceId));
  const randomDefault = favoriteDefault ? "" : pickRandomVoiceId(sortedVoiceIds);
  const selectedVoice = sortedVoiceIds.includes(voiceSelect.value)
    ? voiceSelect.value
    : (favoriteDefault || randomDefault || preferredVoice);

  voiceSelect.innerHTML = "";
  sortedVoiceIds.forEach((voiceId) => {
    const option = document.createElement("option");
    option.value = voiceId;
    option.textContent = renderVoiceOptionLabel(voiceId);
    if (voiceId === selectedVoice) {
      option.selected = true;
    }
    voiceSelect.appendChild(option);
  });
}

async function loadVoices() {
  const baseUrl = sanitizeBaseUrl(apiBaseUrlInput.value);
  if (!baseUrl) {
    availableVoiceIds = [...fallbackVoices];
    populateVoiceSelect(fallbackVoices);
    return;
  }

  voiceSelect.disabled = true;

  try {
    const response = await fetch(`${baseUrl}/v1/voices`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const voiceIds = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data.map((entry) => (typeof entry === "string" ? entry : entry?.id || entry?.name))
        : [];

    if (!voiceIds.length) {
      throw new Error("No voices returned by API");
    }

    availableVoiceIds = [...new Set(voiceIds.filter(Boolean))];
    populateVoiceSelect(voiceIds);
  } catch (error) {
    console.warn(`Failed to load voices from API: ${error.message}`);
    availableVoiceIds = [...fallbackVoices];
    populateVoiceSelect(fallbackVoices);
  } finally {
    voiceSelect.disabled = false;
  }
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

  setActionButtonsDisabled(true);
  resetAudio();
  clearVoiceResults();
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
    const timestamp = formatDownloadTimestamp();
    const filename = `${timestamp}_${modelSelect.value}_${payload.voice}.${format}`;
    downloadLink.href = currentAudioUrl;
    downloadLink.download = filename;
    downloadLink.classList.remove("disabled");
    currentSingleVoice = payload.voice;
    updateSingleFavoriteButton();

    timingEl.textContent = `API generation: ${generationSeconds} | Round-trip: ${(elapsedMs / 1000).toFixed(2)}s`;
    setStatus("Speech generated. You can play or download it.", "ok");
  } catch (error) {
    setStatus(`Generation failed: ${error.message}`, "error");
  } finally {
    setActionButtonsDisabled(false);
  }
}

async function generateForAllVoices() {
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

  const visibleVoiceIds = Array.from(voiceSelect.options)
    .map((option) => option.value)
    .filter(Boolean);
  const voices = getBulkGenerationVoices(visibleVoiceIds);

  if (!voices.length) {
    setStatus("No voices available to generate.", "warn");
    return;
  }

  setActionButtonsDisabled(true);
  setStopButtonState(true);
  bulkStopRequested = false;
  bulkGenerationRunning = true;
  resetAudio();
  clearVoiceResults();

  const startedAt = performance.now();
  let successCount = 0;

  setStatus(`Generating ${voices.length} voices...`, "warn");

  try {
    for (let index = 0; index < voices.length; index += 1) {
      if (bulkStopRequested) {
        break;
      }

      const voiceId = voices[index];
      const { card, state } = createVoiceCard(voiceId);
      state.textContent = `Generating (${index + 1}/${voices.length})...`;

      const payload = {
        model: modelSelect.value,
        input: text,
        voice: voiceId,
        response_format: responseFormatSelect.value,
        speed: Number(speedInput.value)
      };

      try {
        bulkAbortController = new AbortController();
        const response = await fetch(`${baseUrl}/v1/audio/speech`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: bulkAbortController.signal
        });
        bulkAbortController = null;

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`HTTP ${response.status}: ${detail}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        voiceCardAudioUrls.push(url);

        const player = document.createElement("audio");
        player.controls = true;
        player.preload = "none";
        player.src = url;

        const link = document.createElement("a");
        link.className = "download";
        link.href = url;
        const timestamp = formatDownloadTimestamp();
        link.download = `${timestamp}_${modelSelect.value}_${voiceId}.${responseFormatSelect.value}`;
        link.textContent = "Download";

        state.textContent = "Ready";
        state.classList.add("ok");
        card.appendChild(player);
        card.appendChild(link);

        successCount += 1;
      } catch (error) {
        bulkAbortController = null;
        if (bulkStopRequested || error.name === "AbortError") {
          state.textContent = "Stopped";
          state.classList.add("warn");
          break;
        }

        state.textContent = `Failed: ${error.message}`;
        state.classList.add("error");
      }
    }

    const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(2);
    timingEl.textContent = `Bulk round-trip: ${elapsedSeconds}s`;
    if (bulkStopRequested) {
      setStatus(`Stopped after ${successCount}/${voices.length} voices.`, successCount ? "warn" : "error");
    } else {
      setStatus(`Generated ${successCount}/${voices.length} voices.`, successCount ? "ok" : "error");
    }
    reorderVoiceCards();
  } finally {
    bulkAbortController = null;
    bulkGenerationRunning = false;
    setStopButtonState(false);
    setActionButtonsDisabled(false);
  }
}

speedInput.addEventListener("input", updateSpeedLabel);
textInput.addEventListener("input", updateCharCount);
textInput.addEventListener("click", clearDefaultTextOnClick);
textInput.addEventListener("blur", restoreDefaultTextOnBlur);
healthBtn.addEventListener("click", checkHealth);
speakBtn.addEventListener("click", generateSpeech);
generateAllBtn.addEventListener("click", generateForAllVoices);
stopAllBtn.addEventListener("click", stopBulkGeneration);
singleFavoriteBtn.addEventListener("click", () => {
  if (!currentSingleVoice) {
    return;
  }
  toggleFavoriteVoice(currentSingleVoice);
  refreshFavoriteDependentUI(currentSingleVoice);
});
apiBaseUrlInput.addEventListener("change", loadVoices);
apiBaseUrlInput.addEventListener("blur", loadVoices);

window.addEventListener("beforeunload", () => {
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
  }
  while (voiceCardAudioUrls.length) {
    URL.revokeObjectURL(voiceCardAudioUrls.pop());
  }
  if (bulkAbortController) {
    bulkAbortController.abort();
  }
});

updateSpeedLabel();
textInput.value = defaultSampleText;
updateCharCount();
loadVoices();
updateSingleFavoriteButton();
setStopButtonState(false);
setStatus("Idle.");
