// Status page - busy/idle state + online users

import { store } from "../store.js";
import { connectionManager } from "../main.js";

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
        <h3>No connection selected</h3>
        <p>Select a VPS from the sidebar to view its status.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>Status - ${escapeHtml(conn.name)}</h1>
      <button class="btn btn-sm" id="refresh-status">Refresh</button>
    </div>
    <div class="page-body">
      <div class="status-grid" id="status-grid">
        <div class="status-card">
          <h3>Connection</h3>
          <div class="status-value ${isConnected ? "idle" : ""}" id="conn-status">
            ${isConnected ? "Connected" : "Disconnected"}
          </div>
        </div>
        <div class="status-card">
          <h3>Agent Status</h3>
          <div class="status-value" id="busy-status">Loading...</div>
        </div>
        <div class="status-card" style="grid-column: span 2">
          <h3>Online Users</h3>
          <ul class="user-list" id="user-list">
            <li style="color:var(--text-muted)">Loading...</li>
          </ul>
        </div>
        <div class="status-card" style="grid-column: span 2">
          <h3>Health Details</h3>
          <pre id="health-details" style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;max-height:300px;overflow:auto">Loading...</pre>
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
    busyEl.textContent = busy ? "Busy" : "Idle";
  }

  // Update online users from presence snapshot
  const userListEl = document.getElementById("user-list");
  const presenceUsers = state.onlineUsers[connId] || [];
  if (userListEl) {
    if (presenceUsers.length === 0) {
      userListEl.innerHTML = '<li style="color:var(--text-muted)">No users detected</li>';
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
    if (detailsEl) detailsEl.textContent = "Failed to fetch health info";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
