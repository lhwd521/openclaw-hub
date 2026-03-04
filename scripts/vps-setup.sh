#!/usr/bin/env bash
set -euo pipefail

# =====================================================
# OpenClaw Hub - VPS Gateway + Tunnel Setup Script
# Configures OpenClaw gateway and starts HTTPS tunnel
# Requires: OpenClaw already installed on the VPS
#
# Usage:
#   bash vps-setup.sh --ngrok YOUR_NGROK_TOKEN
#   bash vps-setup.sh --cloudflare
# =====================================================

OPENCLAW_PORT=18789
CONFIG_DIR="$HOME/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
TUNNEL_INFO="$CONFIG_DIR/tunnel-info.txt"

TUNNEL_MODE=""
NGROK_TOKEN=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ngrok)
      TUNNEL_MODE="ngrok"
      NGROK_TOKEN="$2"
      shift 2
      ;;
    --cloudflare|--cf)
      TUNNEL_MODE="cloudflare"
      shift
      ;;
    *)
      echo "Usage:"
      echo "  bash vps-setup.sh --ngrok YOUR_NGROK_TOKEN"
      echo "  bash vps-setup.sh --cloudflare"
      exit 1
      ;;
  esac
done

if [ -z "$TUNNEL_MODE" ]; then
  echo "Usage:"
  echo "  bash vps-setup.sh --ngrok YOUR_NGROK_TOKEN    (recommended)"
  echo "  bash vps-setup.sh --cloudflare                (no registration)"
  exit 1
fi

# === Install dependencies ===

install_ngrok() {
  if command -v ngrok &>/dev/null; then return; fi
  echo "[*] Installing ngrok..."
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  NG_ARCH="amd64" ;;
    aarch64) NG_ARCH="arm64" ;;
    armv7l)  NG_ARCH="arm" ;;
    *) echo "[!] Unsupported architecture: $ARCH"; exit 1 ;;
  esac
  curl -sSL "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-${NG_ARCH}.tgz" | sudo tar xz -C /usr/local/bin
}

install_cloudflared() {
  if command -v cloudflared &>/dev/null; then return; fi
  echo "[*] Installing cloudflared..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
    sudo apt-get update && sudo apt-get install -y cloudflared
  else
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64)  CF_ARCH="amd64" ;;
      aarch64) CF_ARCH="arm64" ;;
      armv7l)  CF_ARCH="arm" ;;
      *) echo "[!] Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" -o /tmp/cloudflared
    sudo install -m 755 /tmp/cloudflared /usr/local/bin/cloudflared
    rm -f /tmp/cloudflared
  fi
}

# === Check OpenClaw is installed ===

if ! command -v openclaw &>/dev/null; then
  echo "[!] OpenClaw is not installed. Please install it first before running this script."
  echo "    Visit: https://openclaw.sh"
  exit 1
fi
echo "[OK] OpenClaw found: $(openclaw --version 2>/dev/null || echo 'unknown version')"

# === Install tunnel dependency ===

if [ "$TUNNEL_MODE" = "ngrok" ]; then
  install_ngrok
else
  install_cloudflared
fi

# === Configure OpenClaw gateway using official commands ===

mkdir -p "$CONFIG_DIR"

# Stop any existing gateway/tunnel
pkill -f "openclaw-gatewa" 2>/dev/null || true
pkill -f "openclaw gateway" 2>/dev/null || true
sudo systemctl stop openclaw-gateway.service 2>/dev/null || true
sudo systemctl stop cloudflared-tunnel.service 2>/dev/null || true
sudo systemctl stop ngrok-tunnel.service 2>/dev/null || true
sleep 2

# Reuse existing token if available, otherwise generate new one
GATEWAY_TOKEN=""
if [ -f "$CONFIG_FILE" ]; then
  GATEWAY_TOKEN=$(grep -o '"token": *"[^"]*"' "$CONFIG_FILE" | head -1 | sed 's/.*: *"//;s/"//' || true)
fi
if [ -z "$GATEWAY_TOKEN" ]; then
  GATEWAY_TOKEN=$(openssl rand -hex 24)
fi

# Use openclaw config set for each setting (official way, avoids schema issues)
openclaw config set gateway.mode local 2>/dev/null || true
openclaw config set gateway.port ${OPENCLAW_PORT} 2>/dev/null || true
openclaw config set gateway.auth.mode token 2>/dev/null || true
openclaw config set gateway.auth.token "${GATEWAY_TOKEN}" 2>/dev/null || true
openclaw config set gateway.controlUi.enabled true 2>/dev/null || true
openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true 2>/dev/null || true
openclaw config set gateway.controlUi.allowInsecureAuth true 2>/dev/null || true
openclaw config set gateway.trustedProxies '["127.0.0.1/32","::1/128"]' 2>/dev/null || true

# Set allowedOrigins - try via config set, fallback to node edit
openclaw config set gateway.controlUi.allowedOrigins '["*"]' 2>/dev/null || \
  node -e 'var fs=require("fs"),f="/root/.openclaw/openclaw.json";try{var c=JSON.parse(fs.readFileSync(f,"utf8"));c.gateway=c.gateway||{};c.gateway.controlUi=c.gateway.controlUi||{};c.gateway.controlUi.allowedOrigins=["*"];fs.writeFileSync(f,JSON.stringify(c,null,2));console.log("[OK] allowedOrigins set via node")}catch(e){console.error(e)}' || true

echo "[OK] Gateway configured"

# === Start OpenClaw Gateway ===

RUN_USER=$(whoami)
OPENCLAW_BIN=$(command -v openclaw)

sudo tee /etc/systemd/system/openclaw-gateway.service > /dev/null << SVCEOF
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=${RUN_USER}
ExecStart=${OPENCLAW_BIN} gateway
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5
Environment=HOME=${HOME}
WorkingDirectory=${HOME}

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable openclaw-gateway.service
sudo systemctl restart openclaw-gateway.service
sleep 5

# Verify gateway is up
if ! ss -tlnp 2>/dev/null | grep -q ":${OPENCLAW_PORT} "; then
  echo "[!] Gateway failed to start. Check: journalctl -u openclaw-gateway.service -n 20"
  exit 1
fi
echo "[OK] Gateway running on port ${OPENCLAW_PORT}"

# === Start Tunnel ===

TUNNEL_URL=""

if [ "$TUNNEL_MODE" = "ngrok" ]; then
  # --- ngrok ---
  ngrok config add-authtoken "$NGROK_TOKEN" 2>/dev/null

  NGROK_BIN=$(command -v ngrok)

  sudo tee /etc/systemd/system/ngrok-tunnel.service > /dev/null << SVCEOF
[Unit]
Description=ngrok Tunnel for OpenClaw
After=network.target

[Service]
Type=simple
User=${RUN_USER}
ExecStart=${NGROK_BIN} http ${OPENCLAW_PORT} --log stderr
Restart=on-failure
RestartSec=30
StartLimitIntervalSec=600
StartLimitBurst=5
Environment=HOME=${HOME}

[Install]
WantedBy=multi-user.target
SVCEOF

  sudo systemctl daemon-reload
  sudo systemctl enable ngrok-tunnel.service
  sudo systemctl restart ngrok-tunnel.service
  sleep 5

  # Get tunnel URL from ngrok API
  for i in $(seq 1 15); do
    TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
      | grep -o '"public_url":"https://[^"]*"' \
      | head -1 \
      | sed 's/"public_url":"//;s/"//' || true)
    if [ -n "$TUNNEL_URL" ]; then
      break
    fi
    sleep 2
  done

else
  # --- cloudflared ---
  # Use --no-tls-verify and write a config to strip proxy headers
  CLOUDFLARED_BIN=$(command -v cloudflared)

  # Create cloudflared config that disables proxy protocol headers
  mkdir -p "$HOME/.cloudflared"
  cat > "$HOME/.cloudflared/config.yml" << CFEOF
url: http://localhost:${OPENCLAW_PORT}
no-tls-verify: false
CFEOF

  sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null << SVCEOF
[Unit]
Description=Cloudflare Quick Tunnel for OpenClaw
After=openclaw-gateway.service
Wants=openclaw-gateway.service

[Service]
Type=simple
User=${RUN_USER}
ExecStart=${CLOUDFLARED_BIN} tunnel --url http://localhost:${OPENCLAW_PORT}
Restart=on-failure
RestartSec=30
StartLimitIntervalSec=600
StartLimitBurst=5
Environment=HOME=${HOME}

[Install]
WantedBy=multi-user.target
SVCEOF

  sudo systemctl daemon-reload
  sudo systemctl enable cloudflared-tunnel.service
  sudo systemctl restart cloudflared-tunnel.service

  for i in $(seq 1 30); do
    TUNNEL_URL=$(journalctl -u cloudflared-tunnel.service --no-pager -n 50 2>/dev/null \
      | grep -oP 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
    if [ -n "$TUNNEL_URL" ]; then
      break
    fi
    sleep 2
  done
fi

# === Output result ===

if [ -z "$TUNNEL_URL" ]; then
  echo ""
  echo "[!] Tunnel not ready yet. Run this to check:"
  if [ "$TUNNEL_MODE" = "ngrok" ]; then
    echo "  curl -s http://localhost:4040/api/tunnels | grep -o 'public_url\":\"https://[^\"]*'"
  else
    echo "  journalctl -u cloudflared-tunnel.service -f"
  fi
  echo ""
  echo "Token: $GATEWAY_TOKEN"
  exit 1
fi

echo "$TUNNEL_URL" > "$TUNNEL_INFO"

echo ""
echo "========================================"
echo ""
echo "  Address: $TUNNEL_URL"
echo "  Token:   $GATEWAY_TOKEN"
echo ""
echo "========================================"
echo ""
echo "  View info anytime: bash ~/.openclaw/show-info.sh"
echo "  (URL changes after VPS restart, token stays the same)"
echo ""

# Save a show-info helper
cat > "$CONFIG_DIR/show-info.sh" << 'SHOWEOF'
#!/usr/bin/env bash
TUNNEL_URL=""
# Try ngrok first
if systemctl is-active ngrok-tunnel.service &>/dev/null; then
  TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | grep -o '"public_url":"https://[^"]*"' | head -1 | sed 's/"public_url":"//;s/"//' || true)
fi
# Try cloudflared
if [ -z "$TUNNEL_URL" ] && systemctl is-active cloudflared-tunnel.service &>/dev/null; then
  TUNNEL_URL=$(journalctl -u cloudflared-tunnel.service --no-pager -n 50 2>/dev/null \
    | grep -oP 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
fi
# Fallback to saved
if [ -z "$TUNNEL_URL" ] && [ -f "$HOME/.openclaw/tunnel-info.txt" ]; then
  TUNNEL_URL=$(cat "$HOME/.openclaw/tunnel-info.txt")
fi
TOKEN=$(grep -o '"token": *"[^"]*"' "$HOME/.openclaw/openclaw.json" 2>/dev/null | head -1 | sed 's/.*: *"//;s/"//' || echo "(not found)")
echo ""
echo "  Address: ${TUNNEL_URL:-(not available)}"
echo "  Token:   $TOKEN"
echo ""
SHOWEOF
chmod +x "$CONFIG_DIR/show-info.sh"
