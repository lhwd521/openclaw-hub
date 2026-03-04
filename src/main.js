// OpenClaw Hub - Main Entry Point

import { store } from "./store.js";
import { OpenClawClient } from "./gateway.js";
import { renderLogin } from "./pages/login.js";
import { renderConnections } from "./pages/connections.js";
import { renderChat, cleanupChat } from "./pages/chat.js";
import { renderStatus, cleanupStatus } from "./pages/status.js";
import { renderCron, cleanupCron } from "./pages/cron.js";
import { renderSidebar, showToast } from "./components/sidebar.js";
import { t } from "./i18n.js";

// --- Connection Manager ---
// Manages OpenClawClient instances for each VPS connection

class ConnectionManager {
  constructor() {
    this.clients = new Map(); // connectionId -> OpenClawClient
  }

  getClient(connectionId) {
    return this.clients.get(connectionId) || null;
  }

  async connect(connectionId) {
    const conn = store.getConnection(connectionId);
    if (!conn) return;

    // Disconnect existing if any
    this.disconnect(connectionId);

    const username = store.getState().username;
    const client = new OpenClawClient(conn.url, conn.token, username);
    this.clients.set(connectionId, client);

    store.setConnectionStatus(connectionId, "connecting");

    // Listen for presence events
    client.on("presence", (payload) => {
      if (payload?.presence) {
        store.setOnlineUsers(connectionId, payload.presence);
      }
    });

    // Listen for chat events to track busy state
    client.on("chat", (payload) => {
      if (payload.state === "delta") {
        store.setBusy(connectionId, true, payload.runId);
      } else if (
        payload.state === "final" ||
        payload.state === "aborted" ||
        payload.state === "error"
      ) {
        store.setBusy(connectionId, false);
      }
    });

    // Listen for disconnection
    client.on("disconnected", () => {
      store.setConnectionStatus(connectionId, "disconnected");
      store.setBusy(connectionId, false);
      store.setOnlineUsers(connectionId, []);
    });

    client.on("error", () => {
      store.setConnectionStatus(connectionId, "error");
    });

    try {
      const helloPayload = await client.connect();

      store.setConnectionStatus(connectionId, "connected");

      // Extract initial presence from snapshot
      if (helloPayload?.snapshot?.presence) {
        store.setOnlineUsers(connectionId, helloPayload.snapshot.presence);
      }

      showToast(`${t("conn.connected_to")} ${conn.name}`, "success");
    } catch (err) {
      store.setConnectionStatus(connectionId, "error");
      this.clients.delete(connectionId);
      showToast(`Failed to connect: ${err.message}`, "error");
    }
  }

  disconnect(connectionId) {
    const client = this.clients.get(connectionId);
    if (client) {
      client.disconnect();
      this.clients.delete(connectionId);
    }
    store.setConnectionStatus(connectionId, "disconnected");
    store.setBusy(connectionId, false);
    store.setOnlineUsers(connectionId, []);
  }

  disconnectAll() {
    for (const [id] of this.clients) {
      this.disconnect(id);
    }
  }
}

export const connectionManager = new ConnectionManager();

// --- Render Engine ---

let lastRenderedPage = null;
let lastActiveConnId = null;
let lastConnStatusSnapshot = null;

function render() {
  const state = store.getState();
  const app = document.getElementById("app");

  // Not logged in → show login
  if (!state.username) {
    app.innerHTML = "";
    renderLogin();
    lastRenderedPage = null;
    lastActiveConnId = null;
    lastConnStatusSnapshot = null;
    return;
  }

  // Logged in → show sidebar + main content
  // Ensure layout structure exists
  let sidebar = app.querySelector(".sidebar");
  let main = app.querySelector(".main-content");

  if (!sidebar || !main) {
    app.innerHTML = `
      <div class="sidebar"></div>
      <div class="main-content"></div>
    `;
    sidebar = app.querySelector(".sidebar");
    main = app.querySelector(".main-content");
  }

  // Always re-render sidebar (lightweight)
  renderSidebar(sidebar);

  // Determine if page or active connection changed
  const page = state.activePage;
  const connId = state.activeConnectionId;
  const pageChanged = page !== lastRenderedPage;
  const connChanged = connId !== lastActiveConnId;

  // For connections page, also track status changes to re-render cards
  const connStatusKey = JSON.stringify(state.connectionStatuses);
  const connStatusChanged = connStatusKey !== lastConnStatusSnapshot;

  if (pageChanged) {
    // Cleanup previous page
    cleanupChat();
    cleanupStatus();
    cleanupCron();
    main.innerHTML = "";
  }

  lastRenderedPage = page;
  lastActiveConnId = connId;
  lastConnStatusSnapshot = connStatusKey;

  switch (page) {
    case "connections":
      // Re-render when page just opened or connection statuses changed
      if (pageChanged || connStatusChanged) {
        main.innerHTML = "";
        renderConnections(main);
      }
      break;
    case "chat":
      // Only re-render chat when page opened or active connection changed
      if (pageChanged || connChanged) {
        cleanupChat();
        main.innerHTML = "";
        renderChat(main);
      }
      break;
    case "status":
      if (pageChanged || connChanged) {
        cleanupStatus();
        main.innerHTML = "";
        renderStatus(main);
      }
      break;
    case "cron":
      if (pageChanged || connChanged) {
        cleanupCron();
        main.innerHTML = "";
        renderCron(main);
      }
      break;
    default:
      if (pageChanged) {
        main.innerHTML = "";
        renderConnections(main);
      }
  }
}

// Subscribe to state changes and render
store.subscribe(() => render());

// Initial render
render();
