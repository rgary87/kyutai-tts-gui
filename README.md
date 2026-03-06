# Kyutai TTS Local GUI

Small local web UI for the `kyutai-tts-gpu` API container.

## Features
- Text input (up to 4096 chars)
- Model selector (`tts-1`, `tts-1-hd`)
- Voice selector (including `dev1`, `dev3`)
- Output format selector
- Speed control
- Health check button (`/health`)
- Inline audio playback + download

## Run
From the project root:

```powershell
cd .\GUI
python -m http.server 5173
```

Open:

```text
http://localhost:5173
```

Default API URL in the UI is:

```text
http://localhost:8000
```

## Docker Deployment
From the `GUI` folder:

```powershell
docker compose up -d --build
```

Then open:

```text
http://localhost:5173
```

Stop it with:

```powershell
docker compose down
```

## Notes
- This is intended for local use only.
- Your API already allows CORS, so browser requests to `localhost:8000` work directly.
- Make sure the container is running and port `8000` is published.
