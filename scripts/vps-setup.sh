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

install_jq() {
  if command -v jq &>/dev/null; then
    return
  fi
  echo "[*] Installing jq..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y jq
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y jq
  elif command -v yum &>/dev/null; then
    sudo yum install -y jq
  fi
}

echo "[1/4] Installing dependencies..."
install_nodejs
install_pnpm
install_openclaw
install_cloudflared
install_jq
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

cat > "$CONFIG_FILE" << JSONEOF
{
  "gateway": {
    "port": ${OPENCLAW_PORT},
    "bindMode": "loopback",
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

echo "[3/4] Setting up systemd services..."

OPENCLAW_BIN=$(command -v openclaw)
CLOUDFLARED_BIN=$(command -v cloudflared)
RUN_USER=$(whoami)

# openclaw-gateway.service
sudo tee /etc/systemd/system/openclaw-gateway.service > /dev/null << SVCEOF
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=${RUN_USER}
ExecStart=${OPENCLAW_BIN} gateway
Restart=on-failure
RestartSec=5
Environment=HOME=${HOME}
WorkingDirectory=${HOME}

[Install]
WantedBy=multi-user.target
SVCEOF

# cloudflared-tunnel.service
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null << SVCEOF
[Unit]
Description=Cloudflare Quick Tunnel for OpenClaw
After=openclaw-gateway.service
Requires=openclaw-gateway.service

[Service]
Type=simple
User=${RUN_USER}
ExecStart=${CLOUDFLARED_BIN} tunnel --url http://localhost:${OPENCLAW_PORT}
Restart=on-failure
RestartSec=5
Environment=HOME=${HOME}

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable openclaw-gateway.service
sudo systemctl enable cloudflared-tunnel.service
sudo systemctl restart openclaw-gateway.service
# Give gateway a moment to start
sleep 3
sudo systemctl restart cloudflared-tunnel.service

echo "[OK] Services started"
echo ""

# --- 4. Capture tunnel URL ---

echo "[4/4] Waiting for tunnel URL..."

TUNNEL_URL=""
for i in $(seq 1 30); do
  # cloudflared logs the assigned URL to stderr/journal
  TUNNEL_URL=$(journalctl -u cloudflared-tunnel.service --no-pager -n 50 2>/dev/null \
    | grep -oP 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
  echo "[!] Could not detect tunnel URL yet. It may still be starting."
  echo "    Run: journalctl -u cloudflared-tunnel.service -f"
  echo "    Or:  bash scripts/vps-show-info.sh"
  TUNNEL_URL="(pending - check journalctl)"
fi

echo "$TUNNEL_URL" > "$TUNNEL_INFO"

echo ""
echo "========================================"
echo " OpenClaw is ready!"
echo ""
echo " Address: $TUNNEL_URL"
echo " Token:   $GATEWAY_TOKEN"
echo ""
echo " View current info: bash scripts/vps-show-info.sh"
echo " (URL may change after VPS restart)"
echo "========================================"
