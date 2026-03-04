#!/usr/bin/env bash
# Show current OpenClaw VPS connection info

CONFIG_DIR="$HOME/.openclaw"
TUNNEL_INFO="$CONFIG_DIR/tunnel-info.txt"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"

echo "========================================"
echo " OpenClaw VPS Info"
echo "========================================"

# Tunnel URL
if [ -f "$TUNNEL_INFO" ]; then
  echo " Address: $(cat "$TUNNEL_INFO")"
else
  # Try to get from journalctl
  URL=$(journalctl -u cloudflared-tunnel.service --no-pager -n 50 2>/dev/null \
    | grep -oP 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  if [ -n "$URL" ]; then
    echo " Address: $URL"
    echo "$URL" > "$TUNNEL_INFO"
  else
    echo " Address: (not available - check: journalctl -u cloudflared-tunnel.service -f)"
  fi
fi

# Token
if [ -f "$CONFIG_FILE" ] && command -v jq &>/dev/null; then
  echo " Token:   $(jq -r '.gateway.auth.token' "$CONFIG_FILE")"
else
  echo " Token:   (config not found at $CONFIG_FILE)"
fi

echo ""
echo " Services:"
systemctl is-active openclaw-gateway.service 2>/dev/null && echo "   openclaw-gateway: active" || echo "   openclaw-gateway: inactive"
systemctl is-active cloudflared-tunnel.service 2>/dev/null && echo "   cloudflared-tunnel: active" || echo "   cloudflared-tunnel: inactive"
echo "========================================"
