// Status page - busy/idle state + online users

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { t } from "../i18n.js";

let statusInterval = null;

export function renderStatus(container) {
  clearInterval(statusInterval);

  const state = store.getState();
  const connId = state.activeConnectionId;
  const conn = connId ? store.getConnection(connId) : null;
  const client = connId ? connectionManager.getClient(connId) : null;
  const isConnected = state.connectionStatuses[connId] === "connected";

  if (!connId || !conn) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>${t("status.no_connection")}</h3>
        <p>${t("status.no_connection_desc")}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>${t("status.title")} - ${escapeHtml(conn.name)}</h1>
      <button class="btn btn-sm" id="refresh-status">${t("status.refresh")}</button>
    </div>
    <div class="page-body">
      <div class="status-grid" id="status-grid">
        <div class="status-card">
          <h3>${t("status.connection")}</h3>
          <div class="status-value ${isConnected ? "idle" : ""}" id="conn-status">
            ${isConnected ? t("status.connected") : t("status.disconnected")}
          </div>
        </div>
        <div class="status-card">
          <h3>${t("status.agent")}</h3>
          <div class="status-value" id="busy-status">${t("status.loading")}</div>
        </div>
        <div class="status-card" style="grid-column: span 2">
          <h3>${t("status.online_users")}</h3>
          <ul class="user-list" id="user-list">
            <li style="color:var(--text-muted)">${t("status.loading")}</li>
          </ul>
        </div>
        <div class="status-card" style="grid-column: span 2">
          <h3>${t("status.health")}</h3>
          <pre id="health-details" style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;max-height:300px;overflow:auto">${t("status.loading")}</pre>
        </div>
      </div>
    </div>
  `;

  container.querySelector("#refresh-status").addEventListener("click", () => {
    refreshStatus(client, connId);
  });

  if (isConnected && client) {
    refreshStatus(client, connId);
    statusInterval = setInterval(() => refreshStatus(client, connId), 30000);
  }
}

export function cleanupStatus() {
  clearInterval(statusInterval);
  statusInterval = null;
}

async function refreshStatus(client, connId) {
  if (!client) return;
  const state = store.getState();

  // Update busy status
  const busyEl = document.getElementById("busy-status");
  const busy = state.isBusy[connId];
  if (busyEl) {
    busyEl.className = `status-value ${busy ? "busy" : "idle"}`;
    busyEl.textContent = busy ? t("status.busy") : t("status.idle");
  }

  // Update online users from presence snapshot
  const userListEl = document.getElementById("user-list");
  const presenceUsers = state.onlineUsers[connId] || [];
  if (userListEl) {
    if (presenceUsers.length === 0) {
      userListEl.innerHTML = `<li style="color:var(--text-muted)">${t("status.no_users")}</li>`;
    } else {
      userListEl.innerHTML = presenceUsers
        .map(
          (u) => `
        <li>
          <span class="status-dot connected"></span>
          ${escapeHtml(u.displayName || u.host || u.mode || "Unknown")}
          <span style="color:var(--text-muted);margin-left:auto;font-size:11px">${u.mode || ""} / ${u.platform || ""}</span>
        </li>
      `
        )
        .join("");
    }
  }

  // Fetch health
  try {
    const health = await client.getHealth(true);
    const detailsEl = document.getElementById("health-details");
    if (detailsEl) {
      detailsEl.textContent = JSON.stringify(health, null, 2);
    }
  } catch {
    const detailsEl = document.getElementById("health-details");
    if (detailsEl) detailsEl.textContent = t("status.health_fail");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
