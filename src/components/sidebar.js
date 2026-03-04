// Sidebar component

import { store } from "../store.js";
import { connectionManager } from "../main.js";

export function renderSidebar(sidebarEl) {
  const state = store.getState();

  sidebarEl.innerHTML = `
    <div class="sidebar-header">
      <h2>OpenClaw Hub</h2>
    </div>
    <div class="sidebar-user">
      <span>${escapeHtml(state.username)}</span>
      <button class="btn btn-sm" id="logout-btn">Logout</button>
    </div>
    <div class="sidebar-connections" id="sidebar-connections"></div>
    <div class="sidebar-nav" id="sidebar-nav"></div>
  `;

  // Render connection list
  const connList = sidebarEl.querySelector("#sidebar-connections");
  for (const conn of state.connections) {
    const status = state.connectionStatuses[conn.id] || "disconnected";
    const isActive = state.activeConnectionId === conn.id;
    const busy = state.isBusy[conn.id] || false;

    const item = document.createElement("div");
    item.className = `connection-item${isActive ? " active" : ""}`;
    item.dataset.id = conn.id;
    item.innerHTML = `
      <span class="status-dot ${status}"></span>
      <span class="connection-name">${escapeHtml(conn.name)}${busy ? " (busy)" : ""}</span>
    `;
    item.addEventListener("click", () => {
      store.setActiveConnection(conn.id);
      if (state.connectionStatuses[conn.id] !== "connected") {
        connectionManager.connect(conn.id);
      }
    });
    connList.appendChild(item);
  }

  if (state.connections.length === 0) {
    connList.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px">No connections yet</div>';
  }

  // Navigation items
  const nav = sidebarEl.querySelector("#sidebar-nav");
  const pages = [
    { id: "connections", label: "Connections", icon: "M" },
    { id: "chat", label: "Chat", icon: "C" },
    { id: "status", label: "Status", icon: "S" },
    { id: "cron", label: "Cron Jobs", icon: "T" },
  ];

  for (const page of pages) {
    const item = document.createElement("div");
    item.className = `nav-item${state.activePage === page.id ? " active" : ""}`;
    item.innerHTML = `<span style="width:20px;text-align:center;font-weight:600;font-size:12px;color:var(--text-muted)">${page.icon}</span> ${page.label}`;
    item.addEventListener("click", () => {
      store.setActivePage(page.id);
    });
    nav.appendChild(item);
  }

  // Logout
  sidebarEl.querySelector("#logout-btn").addEventListener("click", () => {
    connectionManager.disconnectAll();
    store.logout();
  });
}

// Toast notification helper
let toastTimer = null;
export function showToast(message, type = "info") {
  // Remove existing
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  clearTimeout(toastTimer);

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  toastTimer = setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
