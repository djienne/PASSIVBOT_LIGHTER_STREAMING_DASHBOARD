# Streaming the Dashboard to YouTube with OBS

Short, practical guide tailored to this project. Assumes Windows 11 + Chrome.

## Prerequisites

- **Dashboard running.** Use `docker compose up --build` for the portable production runtime, or `bash scripts/run_dev.sh` for local Vite development. The Docker `/stream` route (`http://127.0.0.1:8787/stream`) is the OBS-ready layout; local dev serves it at `http://127.0.0.1:5173/stream`.
- **OBS Studio 30+** installed → https://obsproject.com/ (free).
- **YouTube account** with Live Streaming enabled. YouTube requires a **24-hour verification wait** the first time — do that step once, in advance, the day before you plan to go live:
  1. https://www.youtube.com/verify → verify phone number.
  2. https://www.youtube.com/live_dashboard → "Enable live streaming".
  3. Wait 24 h. (First-time gate only.)

## Step 1 — Grab your YouTube stream key

1. Go to YouTube Studio → **Create → Go live** (top-right camera icon) → **Stream**.
2. Fill in **Title**, **Category** (pick "Science & technology" or "Gaming" depending on angle), and set visibility (Unlisted is great for test runs).
3. Thumbnail: 1280×720. You can export one from the `/stream` route (take a screenshot).
4. Under **Stream settings** copy **Stream key** (`Copy` button). Keep it private — anyone with the key can publish to your channel.
   - Also note the **Stream URL**: usually `rtmp://a.rtmp.youtube.com/live2`.

## Step 2 — Point OBS at YouTube

In OBS: **Settings → Stream**
- **Service**: `YouTube - RTMPS`
- **Server**: `Primary YouTube ingest server`
- **Stream Key**: paste the key from Step 1.
- Click **OK**.

## Step 3 — OBS video / output settings

**Settings → Video**
- Base (Canvas) Resolution: `1920x1080`
- Output (Scaled) Resolution: `1920x1080`
- Common FPS: `30` (the dashboard doesn't need 60; 30 halves bandwidth + CPU)

**Settings → Output** (Advanced mode is fine)
- Output Mode: `Advanced`
- Encoder: **NVIDIA NVENC H.264** if you have an NVIDIA GPU; otherwise `x264`.
- Rate Control: `CBR`
- Bitrate: `4500 Kbps` (good for 1080p30) — bump to `6000` if bandwidth allows and you want cleaner candles.
- Keyframe Interval: `2` seconds (YouTube requires this).
- Preset (x264): `veryfast`. NVENC preset: `Quality` or `P5`.
- Profile: `high`.

**Settings → Audio**
- Sample Rate: `48 kHz`
- Channels: `Stereo`
- Add a **mic** (`Mic/Aux → Properties`) if you plan to commentate. For silent stream, disable all audio inputs — YouTube still requires the audio track but you can mute it.

## Step 4 — Build an OBS scene

1. In the **Scenes** panel (bottom-left) → click `+` → name it `Passivbot Live`.
2. In **Sources** → `+` → **Window Capture** (`Display Capture` is the fallback).
3. Name it `Dashboard`.
4. In the dialog:
   - **Window**: select the Chrome window running `/stream` (title should be "Passivbot · Lighter HYPE").
   - **Capture Method**: `Windows 10 (1903 and up)` — the GPU-accelerated path.
   - **Capture Cursor**: **off** (`/stream` hides the cursor already, but leave this off as a belt-and-suspenders).
   - Tick **Client Area** to crop out the title bar.
5. Click OK. Right-click the source → **Transform → Fit to screen** so it snaps to the 1920×1080 canvas edge-to-edge.

## Step 5 — (Optional) Overlays

- **Text (GDI+)** source for a "Live · real funds" label in a corner.
- **Image** source for a sponsor/channel watermark (bottom-right 200×50 PNG works well).
- Add an **audio VU meter** via OBS's built-in audio mixer if commentating, so chat can see you're live.

## Step 6 — Go live

1. Preview the scene in OBS — the dashboard should fill the canvas, no gray bars.
2. Click **Start Streaming** (bottom-right).
3. Back in **YouTube Studio → Go live** you should see the ingest go green within ~10 s.
4. Click **Go Live** on YouTube to actually publish to viewers.
5. Hit **End Stream** on YouTube when done, then **Stop Streaming** in OBS.

YouTube will auto-save the stream as a VOD on your channel — trim the idle tails from YouTube Studio if you want a cleaner recording.

## Tips specific to this dashboard

- **Keep the /stream route, not the dev dashboard.** `/stream` is the fixed 1920×1080 layout with no scrollbars and no cursor — perfect for Window Capture.
- **Run kiosk Chrome via `scripts/run_stream.ps1`.** Without `--app=…`, Chrome's address bar shows up in Window Capture.
- **Start OBS *before* Chrome** so the window list sees the kiosk window. If you open OBS first and then Chrome, click "Refresh" in the Window source dropdown.
- **Candle colors read clean on YouTube's compressor** because the theme is high-contrast dark. Avoid red/green tweaks below ~50% saturation — they smear.
- **Watch the health footer during the stream.** If "browser ↔ backend" flips to `closed`, OBS will still show a frozen dashboard — add an OBS **Stats** overlay so you notice.
- **Latency chip** (`Tokyo ↔ Lighter · 1.xx ms`) is a nice constant in the header — good b-roll for "showing off" during voiceover.
- **Remote bot restarts are okay.** The dashboard container keeps running while the remote Passivbot Docker container stops or restarts. It retries SSH reads and repopulates fill-derived panels when `/home/ubuntu/passivbot_lighter/caches/lighter/lighter_01_pnls.json` has data again.

## 24/7 auto-start (dedicated streaming PC)

If you're leaving the box running continuously:

1. **Dashboard container** via Docker Compose with `restart: unless-stopped`.
2. **`scripts/run_stream.ps1`** as a Task Scheduler "At logon" task.
3. **OBS**: Settings → General → check **"Automatically start streaming when OBS launches"** and "Automatically start recording when OBS launches" (optional, for archival).
4. Add OBS to Windows startup (Task Scheduler "At logon" → `C:\Program Files\obs-studio\bin\64bit\obs64.exe` with `--minimize-to-tray --startstreaming`).

Chain: boot -> Docker restarts dashboard -> logon triggers kiosk Chrome + OBS -> OBS auto-streams.

## Minimum bandwidth checklist

- **4.5 Mbps upload** for 1080p30 H.264. Run https://fast.com once on the actual streaming PC — Wi-Fi can easily halve that.
- Wired Ethernet beats Wi-Fi. If only Wi-Fi, drop to **720p30 @ 2500 Kbps** (Video → Output Scale 1280×720) — the dashboard still reads fine at that res.

## Troubleshooting

| Symptom | Fix |
|---|---|
| OBS preview is a black rectangle | Window Capture → switch method to `Windows 10` or `BitBlt`. Some Chrome flags hide it from `BitBlt` only. |
| Viewers see the stream freeze periodically | Check **Stats** (View → Stats). If `Dropped Frames (network)` > 1 %, lower bitrate. If `Rendering lag` > 0, lower OBS preview FPS or switch to NVENC. |
| Chart candles flicker/blur on playback | Bump bitrate to 6000 kbps, or switch encoder to NVENC if on x264. |
| YouTube says "No data received" for > 60 s | OBS isn't streaming. Restart OBS; re-check **Stream key** (regenerate on YouTube if unsure). |
| Latency chip stuck on one value | Expected — it probes every 5 min. The age counter ticks live. |
| Fill/PnL panels are empty after remote bot restart | Expected until the bot writes fresh fills. Previously ingested fills remain if the dashboard Docker volume was not removed. |
| SSH works but remote Docker reads fail | If bot files exist only inside the remote container, set `REMOTE_DOCKER_CONTAINER` to the stable container name and make sure the SSH user can run `docker exec`. |

## Copy-paste quick start

```text
1. YouTube Studio → Go live → copy Stream Key.
2. OBS Settings → Stream → Service "YouTube - RTMPS" → paste key.
3. OBS Settings → Video → 1920x1080 base + output @ 30 fps.
4. OBS Settings → Output → NVENC (or x264 veryfast), CBR 4500 Kbps, keyframe 2 s.
5. Start the dashboard: `bash scripts/run_dev.sh` (or the 24/7 service).
6. Open Chrome at http://127.0.0.1:8787/stream for Docker, or http://127.0.0.1:5173/stream for local dev (kiosk mode if possible).
7. OBS Sources → Window Capture → pick the Chrome window → Fit to screen.
8. OBS → Start Streaming. YouTube → Go Live.
```
