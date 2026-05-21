# Streaming the Dashboard to YouTube with OBS

Short, practical guide tailored to this project. Assumes Windows 11, Chrome, Docker Desktop, and OBS.

## Prerequisites

- **Dashboard running.** For the portable runtime, use `docker compose up -d --build`. The Docker stream route is `http://127.0.0.1:8787/stream`. For local Vite development, use `bash scripts/run_dev.sh` and open `http://127.0.0.1:5173/stream`.
- **OBS Studio 30+** installed: https://obsproject.com/
- **YouTube account** with Live Streaming enabled. If this is a new streaming account, enable live streaming in YouTube Studio ahead of time because YouTube may require account verification or a waiting period.

## Step 1 - Grab your YouTube stream key

1. Go to YouTube Studio, then **Create > Go live > Stream**.
2. Fill in the title, category, and visibility. Use Unlisted for test runs.
3. Thumbnail: `1280x720`. You can export one from the `/stream` route by taking a screenshot.
4. Under **Stream settings**, copy the **Stream key**. Keep it private; anyone with the key can publish to your channel.
5. Also note the stream URL, usually `rtmp://a.rtmp.youtube.com/live2` or the RTMPS equivalent selected by OBS.

## Step 2 - Point OBS at YouTube

In OBS: **Settings > Stream**

- **Service**: `YouTube - RTMPS`
- **Server**: `Primary YouTube ingest server`
- **Stream Key**: paste the key from Step 1.
- Click **OK**.

## Step 3 - OBS video and output settings

**Settings > Video**

- Base (Canvas) Resolution: `1920x1080`
- Output (Scaled) Resolution: `1920x1080`
- Common FPS: `30`

**Settings > Output** (Advanced mode is fine)

- Output Mode: `Advanced`
- Encoder: **NVIDIA NVENC H.264** if available; otherwise `x264`.
- Rate Control: `CBR`
- Bitrate: `4500 Kbps` for 1080p30; use `6000 Kbps` if bandwidth allows and you want cleaner candles.
- Keyframe Interval: `2` seconds.
- Preset (x264): `veryfast`. NVENC preset: `Quality` or `P5`.
- Profile: `high`.

**Settings > Audio**

- Sample Rate: `48 kHz`
- Channels: `Stereo`
- Add a mic if you plan to commentate. For a silent stream, disable or mute audio inputs.

## Step 4 - Build an OBS scene

1. In the **Scenes** panel, click `+` and name the scene `Passivbot Live`.
2. In **Sources**, click `+` and choose **Window Capture**. Use **Display Capture** only as a fallback.
3. Name the source `Dashboard`.
4. In the capture dialog:
   - **Window**: select the Chrome window running `/stream`.
   - **Capture Method**: `Windows 10 (1903 and up)`.
   - **Capture Cursor**: off.
   - **Client Area**: on, so the browser title bar is cropped out.
5. Click OK, then right-click the source and choose **Transform > Fit to screen**.

## Step 5 - Optional overlays

- **Text (GDI+)** source for a small "Live / real funds" label.
- **Image** source for a sponsor or channel watermark.
- An OBS audio meter is useful if you commentate, so chat can see that audio is live.

## Step 6 - Go live

1. Preview the scene in OBS. The dashboard should fill the canvas without gray bars.
2. Click **Start Streaming** in OBS.
3. In YouTube Studio, wait for ingest status to turn healthy.
4. Click **Go Live** on YouTube.
5. When done, click **End Stream** on YouTube, then **Stop Streaming** in OBS.

YouTube will normally save the stream as a VOD on your channel. Trim idle time in YouTube Studio if needed.

## Tips specific to this dashboard

- **Use `/stream`, not the normal dashboard.** `/stream` is fixed at `1920x1080`, hides the cursor, and is intended for Window Capture.
- **Run kiosk Chrome via `scripts/run_stream.ps1`.** Without `--app=...`, Chrome's address bar can appear in Window Capture.
- **Start OBS before Chrome** if the kiosk window does not appear in the OBS window list. You can also refresh the Window Capture dropdown.
- **Watch the health footer.** If browser-to-backend status flips to `closed`, OBS can keep showing a frozen dashboard.
- **Latency updates are periodic.** The VPS latency probe samples every few minutes; the age counter should keep ticking live.
- **Remote bot restarts are okay.** The dashboard container keeps running while the remote Passivbot Docker container stops or restarts. It retries SSH reads and repopulates fill-derived panels when `/home/ubuntu/passivbot_lighter/caches/lighter/lighter_01_pnls.json` has data again.

## 24/7 auto-start notes

For a dedicated streaming PC:

1. Run the dashboard with Docker Compose and `restart: unless-stopped`.
2. Add `scripts/run_stream.ps1` as a Task Scheduler "At logon" task.
3. Configure OBS to start streaming automatically only if you are comfortable with unattended publishing.
4. Optionally add OBS to Windows startup with `--minimize-to-tray --startstreaming`.

Chain: boot -> Docker restarts dashboard -> logon starts kiosk Chrome and OBS -> OBS streams.

## Minimum bandwidth checklist

- Use at least `4.5 Mbps` upload for 1080p30 H.264 at `4500 Kbps`.
- Wired Ethernet is strongly preferred.
- If upload bandwidth is unstable, use 720p30 at around `2500 Kbps`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| OBS preview is black | Switch Window Capture method to `Windows 10` or `BitBlt`, or use Display Capture as a fallback. |
| Viewers see periodic freezes | Check OBS **Stats**. If dropped network frames rise, lower bitrate. If rendering lag rises, lower preview load or switch encoder. |
| Chart candles blur on playback | Increase bitrate if bandwidth allows, or use NVENC instead of x264. |
| YouTube says "No data received" | Confirm OBS is streaming and the stream key is correct. Regenerate the key if unsure. |
| Latency chip looks stale | Expected if the sample age is only a few minutes. It probes periodically, not every second. |
| Fill/PnL panels are empty after a remote bot restart | Expected until the bot writes fresh fills. Previously ingested fills remain if the dashboard Docker volume was not removed. |
| SSH works but remote Docker reads fail | If bot files exist only inside the remote container, set `REMOTE_DOCKER_CONTAINER` to the stable container name and make sure the SSH user can run `docker exec`. |

## Copy-paste quick start

```text
1. Start the dashboard: docker compose up -d --build
2. Open Chrome at http://127.0.0.1:8787/stream, preferably via scripts/run_stream.ps1
3. YouTube Studio > Go live > copy Stream Key
4. OBS Settings > Stream > Service "YouTube - RTMPS" > paste key
5. OBS Settings > Video > 1920x1080 base and output at 30 fps
6. OBS Settings > Output > NVENC or x264 veryfast, CBR 4500 Kbps, keyframe 2 s
7. OBS Sources > Window Capture > pick the Chrome window > Fit to screen
8. OBS > Start Streaming. YouTube > Go Live.
```
