# 24/7 stream mode launcher for Windows.
# Assumes:
#   - backend is installed as an NSSM service ("LighterDashboard") or run directly
#   - frontend has been `npm run build`-ed and is served by a static server, or `npm run preview`
#   - Chrome is installed
#
# Behavior:
#   1. Ensure backend is reachable on 127.0.0.1:8787 (start the NSSM service if stopped).
#   2. Ensure a served frontend is reachable on 127.0.0.1:5173 (or configured $FRONTEND_URL).
#   3. Launch Chrome in kiosk-mode pointed at /stream.

param(
  [string]$FrontendUrl = "http://127.0.0.1:5173/stream",
  [string]$BackendHealthUrl = "http://127.0.0.1:8787/api/health",
  [string]$ServiceName = "LighterDashboard",
  [string]$ChromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
)

function Wait-Http($url, $timeoutSec = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $url
      if ($res.StatusCode -eq 200) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  return $false
}

# Start the backend service if it exists and isn't running.
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  if ((Get-Service -Name $ServiceName).Status -ne "Running") {
    Start-Service -Name $ServiceName
  }
}

Write-Host "waiting for backend $BackendHealthUrl ..."
if (-not (Wait-Http -url $BackendHealthUrl -timeoutSec 60)) {
  Write-Warning "backend not reachable after 60s; launching UI anyway so stale banner is visible"
}

Write-Host "waiting for frontend $FrontendUrl ..."
if (-not (Wait-Http -url $FrontendUrl -timeoutSec 60)) {
  Write-Warning "frontend not reachable after 60s"
}

# Launch Chrome kiosk
if (-not (Test-Path $ChromeExe)) {
  Write-Error "chrome not found at $ChromeExe — set -ChromeExe"
  exit 1
}

$tmpProfile = Join-Path $env:LOCALAPPDATA "LighterDashboard\chrome-profile"
New-Item -ItemType Directory -Force -Path $tmpProfile | Out-Null

& "$ChromeExe" `
  --kiosk `
  --start-fullscreen `
  --disable-infobars `
  --no-first-run `
  --noerrdialogs `
  --disable-session-crashed-bubble `
  --disable-features=TranslateUI `
  --autoplay-policy=no-user-gesture-required `
  --disable-backgrounding-occluded-windows `
  --disable-renderer-backgrounding `
  --user-data-dir="$tmpProfile" `
  --app="$FrontendUrl"
