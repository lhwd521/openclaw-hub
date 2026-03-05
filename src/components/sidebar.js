// Sidebar component

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { t, toggleLang } from "../i18n.js";

export function renderSidebar(sidebarEl) {
  const state = store.getState();

  sidebarEl.innerHTML = `
    <div class="sidebar-header">
      <h2>${t("app.title")}</h2>
      <button class="btn btn-sm" id="lang-toggle-btn">${t("lang.toggle")}</button>
    </div>
    <div class="sidebar-user">
      <span>${escapeHtml(state.username)}</span>
      <button class="btn btn-sm" id="logout-btn">${t("sidebar.logout")}</button>
    </div>
    <div class="sidebar-connections" id="sidebar-connections"></div>
    <div class="sidebar-nav" id="sidebar-nav"></div>
  `;

  // Language toggle
  sidebarEl.querySelector("#lang-toggle-btn").addEventListener("click", () => {
    toggleLang();
    store.update({}); // trigger re-render
  });

  // Render connection list
  const connList = sidebarEl.querySelector("#sidebar-connections");
  for (const conn of state.connections) {
    const status = state.connectionStatuses[conn.id] || "disconnected";
    const isActive = state.activeConnectionId === conn.id;
    const busy = state.isBusy[conn.id] || false;
    const onlineUsers = (state.onlineUsers[conn.id] || []).filter((u) => u.reason !== "disconnect" && u.reason !== "self" && u.mode !== "node" && u.mode !== "gateway");
    const userCount = onlineUsers.length;
    const userNames = onlineUsers
      .map((u) => u.host || u.displayName || "")
      .filter((n) => n)
      .join(", ");

    // Determine status dot class: if connected and busy, show as busy (yellow)
    const dotClass = status === "connected" && busy ? "busy" : status;

    const item = document.createElement("div");
    item.className = `connection-item${isActive ? " active" : ""}`;
    item.dataset.id = conn.id;
    item.innerHTML = `
      <span class="status-dot ${dotClass}"></span>
      <div class="connection-info">
        <span class="connection-name">${escapeHtml(conn.name)}</span>
        ${status === "connected" && userCount > 0 ? `<span class="connection-users">${userCount} ${t("status.online_users")}${userNames ? ": " + escapeHtml(userNames) : ""}</span>` : ""}
      </div>
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
    connList.innerHTML = `<div style="padding:12px;color:var(--text-muted);font-size:13px">${t("sidebar.no_connections")}</div>`;
  }

  // Navigation items
  const nav = sidebarEl.querySelector("#sidebar-nav");
  const pages = [
    { id: "connections", labelKey: "nav.connections", icon: "🔗" },
    { id: "org-chart", labelKey: "nav.org_chart", icon: "🏢" },
    { id: "chat", labelKey: "nav.chat", icon: "💬" },
    { id: "cron", labelKey: "nav.cron", icon: "⏰" },
  ];

  for (const page of pages) {
    const item = document.createElement("div");
    item.className = `nav-item${state.activePage === page.id ? " active" : ""}`;
    item.innerHTML = `<span style="font-size:16px">${page.icon}</span> ${t(page.labelKey)}`;
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
