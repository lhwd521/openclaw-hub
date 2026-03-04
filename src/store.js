// State management with localStorage persistence

const KEYS = {
  username: "openclaw-hub.username",
  connections: "openclaw-hub.connections",
  orgStructure: "openclaw-hub.org-structure",
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Reactive state with subscriber pattern
class Store {
  constructor() {
    this.state = {
      username: localStorage.getItem(KEYS.username) || "",
      connections: loadJSON(KEYS.connections, []),
      orgStructure: loadJSON(KEYS.orgStructure, { nodes: {}, roots: [] }),
      activeConnectionId: null,
      activePage: "connections", // connections | org-chart | chat | status | cron
      connectionStatuses: {}, // { [id]: "connected" | "disconnected" | "connecting" | "error" }
      onlineUsers: {}, // { [connectionId]: PresenceEntry[] }
      isBusy: {}, // { [connectionId]: boolean }
      activeRunId: {}, // { [connectionId]: string | null }
    };
    this.subscribers = new Set();
  }

  getState() {
    return this.state;
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  update(partial) {
    Object.assign(this.state, partial);
    this._persist();
    this._notify();
  }

  _persist() {
    if (this.state.username) {
      localStorage.setItem(KEYS.username, this.state.username);
    }
    saveJSON(KEYS.connections, this.state.connections);
    saveJSON(KEYS.orgStructure, this.state.orgStructure);
  }

  _notify() {
    for (const fn of this.subscribers) {
      try {
        fn(this.state);
      } catch (e) {
        console.error("Store subscriber error:", e);
      }
    }
  }

  // --- Username ---

  setUsername(name) {
    this.update({ username: name });
  }

  logout() {
    localStorage.removeItem(KEYS.username);
    this.update({ username: "", activeConnectionId: null, activePage: "connections" });
  }

  // --- Connections ---

  addConnection(conn) {
    const entry = {
      id: crypto.randomUUID(),
      name: conn.name,
      url: conn.url.replace(/\/$/, ""),
      token: conn.token,
      addedAt: Date.now(),
    };
    this.update({
      connections: [...this.state.connections, entry],
    });
    return entry;
  }

  updateConnection(id, patch) {
    this.update({
      connections: this.state.connections.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    });
  }

  removeConnection(id) {
    this.update({
      connections: this.state.connections.filter((c) => c.id !== id),
      activeConnectionId:
        this.state.activeConnectionId === id
          ? null
          : this.state.activeConnectionId,
    });
  }

  getConnection(id) {
    return this.state.connections.find((c) => c.id === id) || null;
  }

  getConnections() {
    return this.state.connections;
  }

  setActiveConnection(id) {
    this.update({ activeConnectionId: id });
  }

  setActivePage(page) {
    this.update({ activePage: page });
  }

  // --- Organization Structure ---

  setState(partial) {
    this.update(partial);
  }

  // --- Connection Status ---

  setConnectionStatus(id, status) {
    this.update({
      connectionStatuses: {
        ...this.state.connectionStatuses,
        [id]: status,
      },
    });
  }

  // --- Presence ---

  setOnlineUsers(connectionId, users) {
    this.update({
      onlineUsers: {
        ...this.state.onlineUsers,
        [connectionId]: users,
      },
    });
  }

  // --- Busy ---

  setBusy(connectionId, busy, runId = null) {
    this.update({
      isBusy: { ...this.state.isBusy, [connectionId]: busy },
      activeRunId: { ...this.state.activeRunId, [connectionId]: runId },
    });
  }
}

export const store = new Store();
