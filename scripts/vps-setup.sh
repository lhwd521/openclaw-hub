#!/usr/bin/env bash
set -euo pipefail

# =====================================================
# OpenClaw VPS One-Click Setup Script
# Installs OpenClaw gateway + Cloudflare Quick Tunnel
# Usage: bash vps-setup.sh [--vercel-origin https://your-app.vercel.app]
# =====================================================

VERCEL_ORIGIN="*"
OPENCLAW_PORT=18789
CONFIG_DIR="$HOME/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
TUNNEL_INFO="$CONFIG_DIR/tunnel-info.txt"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vercel-origin)
      VERCEL_ORIGIN="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: bash vps-setup.sh [--vercel-origin https://your-app.vercel.app]"
      exit 1
      ;;
  esac
done

echo "========================================"
echo " OpenClaw VPS Setup"
echo "========================================"
echo ""

# --- 1. Install dependencies ---

install_nodejs() {
  if command -v node &>/dev/null; then
    NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VER" -ge 22 ]; then
      echo "[OK] Node.js $(node -v) already installed"
      return
    fi
  fi

  echo "[*] Installing Node.js 22..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo dnf install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo yum install -y nodejs
  else
    echo "[!] Could not detect package manager. Please install Node.js 22+ manually."
    exit 1
  fi
  echo "[OK] Node.js $(node -v) installed"
}

install_pnpm() {
  if command -v pnpm &>/dev/null; then
    echo "[OK] pnpm already installed"
    return
  fi
  echo "[*] Installing pnpm..."
  npm install -g pnpm
  echo "[OK] pnpm installed"
}

install_openclaw() {
  if command -v openclaw &>/dev/null; then
    echo "[OK] openclaw already installed"
    return
  fi
  echo "[*] Installing openclaw..."
  pnpm install -g openclaw
  echo "[OK] openclaw installed"
}

install_cloudflared() {
  if command -v cloudflared &>/dev/null; then
    echo "[OK] cloudflared already installed"
    return
  fi
  echo "[*] Installing cloudflared..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
    sudo apt-get update
    sudo apt-get install -y cloudflared
  else
    # Fallback: download binary directly
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64) CF_ARCH="amd64" ;;
      aarch64) CF_ARCH="arm64" ;;
      armv7l) CF_ARCH="arm" ;;
      *) echo "[!] Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" -o /tmp/cloudflared
    sudo install -m 755 /tmp/cloudflared /usr/local/bin/cloudflared
    rm -f /tmp/cloudflared
  fi
  echo "[OK] cloudflared installed"
}

echo "[1/4] Installing dependencies..."
install_nodejs
install_pnpm
install_openclaw
install_cloudflared
echo ""

# --- 2. Generate gateway token ---

echo "[2/4] Generating configuration..."
mkdir -p "$CONFIG_DIR"

GATEWAY_TOKEN=$(openssl rand -hex 24)

# Build allowed origins
if [ "$VERCEL_ORIGIN" = "*" ]; then
  ORIGINS='["*"]'
else
  ORIGINS="[\"$VERCEL_ORIGIN\"]"
fi

# Check if gateway is already running on the target port
EXISTING_GW=$(ss -tlnp 2>/dev/null | grep ":${OPENCLAW_PORT} " || true)
if [ -n "$EXISTING_GW" ]; then
  echo "[!] Port ${OPENCLAW_PORT} is already in use by an existing gateway."
  echo "    Will update config for existing gateway instead of starting a new one."
  SKIP_GW_SERVICE=true

  # Read existing token if available
  if [ -f "$CONFIG_FILE" ]; then
    OLD_TOKEN=$(grep -o '"token": *"[^"]*"' "$CONFIG_FILE" | head -1 | sed 's/.*: *"//;s/"//' || true)
    if [ -n "$OLD_TOKEN" ]; then
      GATEWAY_TOKEN="$OLD_TOKEN"
      echo "    Keeping existing token."
    fi
  fi
else
  SKIP_GW_SERVICE=false
fi

cat > "$CONFIG_FILE" << JSONEOF
{
  "gateway": {
    "mode": "local",
    "port": ${OPENCLAW_PORT},
    "auth": {
      "mode": "token",
      "token": "${GATEWAY_TOKEN}"
    },
    "controlUi": {
      "enabled": true,
      "allowedOrigins": ${ORIGINS},
      "dangerouslyDisableDeviceAuth": true,
      "allowInsecureAuth": true
    }
  }
}
JSONEOF

echo "[OK] Config written to $CONFIG_FILE"
echo ""

# --- 3. Create systemd services ---

echo "[3/4] Setting up services..."

CLOUDFLARED_BIN=$(command -v cloudflared)
RUN_USER=$(whoami)

if [ "$SKIP_GW_SERVICE" = false ]; then
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
  sleep 3
  echo "[OK] Gateway service started"
else
  # Restart existing gateway to pick up new config
  echo "[*] Restarting existing gateway to load new config..."
  openclaw gateway stop 2>/dev/null || true
  sleep 2
  nohup openclaw gateway > /tmp/openclaw-gateway.log 2>&1 &
  sleep 3

  # Verify it came back up
  if ss -tlnp 2>/dev/null | grep -q ":${OPENCLAW_PORT} "; then
    echo "[OK] Existing gateway restarted with new config"
  else
    echo "[!] Gateway did not restart. Check: cat /tmp/openclaw-gateway.log"
  fi
fi

# cloudflared-tunnel.service with restart limits to avoid rate-limiting
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null << SVCEOF
[Unit]
Description=Cloudflare Quick Tunnel for OpenClaw
After=network.target

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

echo "[OK] Tunnel service started"
echo ""

# --- 4. Capture tunnel URL ---

echo "[4/4] Waiting for tunnel URL..."

TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(journalctl -u cloudflared-tunnel.service --no-pager -n 50 2>/dev/null \
    | grep -oP 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
  echo "[!] Could not detect tunnel URL yet. It may still be starting."
  echo "    Check: journalctl -u cloudflared-tunnel.service -f"
  echo ""
  echo "    If you see '429 Too Many Requests', wait 10-15 minutes then run:"
  echo "    sudo systemctl restart cloudflared-tunnel.service"
  echo "    journalctl -u cloudflared-tunnel.service -f"
  TUNNEL_URL="(pending - see above)"
fi

echo "$TUNNEL_URL" > "$TUNNEL_INFO"

echo ""
echo "========================================"
echo " OpenClaw is ready!"
echo ""
echo " Address: $TUNNEL_URL"
echo " Token:   $GATEWAY_TOKEN"
echo ""
echo " View current info anytime:"
echo "   cat $TUNNEL_INFO     # tunnel URL"
echo "   grep token $CONFIG_FILE  # token"
echo ""
echo " If tunnel URL shows 'pending', wait 10 min then:"
echo "   sudo systemctl restart cloudflared-tunnel.service"
echo "   journalctl -u cloudflared-tunnel.service -f"
echo ""
echo " (URL changes after VPS restart, token stays the same)"
echo "========================================"
