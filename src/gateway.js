// OpenClaw Gateway WebSocket Client
// Implements protocol v3 compatible with OpenClaw Gateway

const PROTOCOL_VERSION = 3;
const HEARTBEAT_INTERVAL = 25000; // 25s ping to keep connection alive
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 15000]; // escalating delays

// Stable instanceId per URL+username within a browser tab.
// Prevents duplicate presence entries on reconnect.
function getStableInstanceId(url, username) {
  const key = `openclaw-hub.instanceId.${url}.${username}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export class OpenClawClient {
  constructor(url, token, username) {
    this.url = url;
    this.token = token;
    this.username = username;
    this.ws = null;
    this.connected = false;
    this.pendingRequests = new Map();
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.connId = null;
    this.snapshot = null;
    this.features = null;
    this.instanceId = getStableInstanceId(url, username);
    this._autoReconnect = true;
    this._reconnectAttempt = 0;
    this._manualDisconnect = false;
  }

  // --- Connection Management ---

  connect() {
    this._manualDisconnect = false;
    this._autoReconnect = true;
    this._reconnectAttempt = 0;
    return this._doConnect();
  }

  _doConnect() {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this._cleanupWs();
      }

      const wsUrl = this.url.replace(/^http/, "ws").replace(/\/$/, "");
      this.ws = new WebSocket(wsUrl);

      let challengeReceived = false;
      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.ws.close();
          reject(new Error("Connection timeout"));
        }
      }, 15000);

      this.ws.onopen = () => {
        // Wait for challenge event from server
      };

      this.ws.onmessage = (event) => {
        let frame;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }

        // Handle challenge → send connect
        if (
          frame.type === "event" &&
          frame.event === "connect.challenge" &&
          !challengeReceived
        ) {
          challengeReceived = true;
          const connectId = crypto.randomUUID();

          const connectReq = {
            type: "req",
            id: connectId,
            method: "connect",
            params: {
              minProtocol: PROTOCOL_VERSION,
              maxProtocol: PROTOCOL_VERSION,
              client: {
                id: "gateway-client",
                version: "1.0.0",
                platform: "web",
                mode: "ui",
                displayName: this.username || "Hub User",
                deviceFamily: "desktop",
                instanceId: this.instanceId,
              },
              caps: ["tool-events"],
              role: "operator",
              scopes: [
                "operator.admin",
                "operator.read",
                "operator.write",
                "operator.approvals",
              ],
              auth: {
                token: this.token,
              },
            },
          };

          // Store pending request to resolve on hello-ok
          this.pendingRequests.set(connectId, {
            resolve: (payload) => {
              clearTimeout(timeout);
              this.connected = true;
              this._reconnectAttempt = 0;
              this.connId = payload.server?.connId;
              this.snapshot = payload.snapshot;
              this.features = payload.features;
              this._startHeartbeat();
              this._emit("connected", payload);
              resolve(payload);
            },
            reject: (err) => {
              clearTimeout(timeout);
              reject(err);
            },
          });

          this.ws.send(JSON.stringify(connectReq));
          return;
        }

        // Handle response frames
        if (frame.type === "res") {
          const pending = this.pendingRequests.get(frame.id);
          if (pending) {
            this.pendingRequests.delete(frame.id);
            if (frame.ok) {
              pending.resolve(frame.payload);
            } else {
              pending.reject(
                new Error(frame.error?.message || "Request failed")
              );
            }
          }
          return;
        }

        // Handle event frames
        if (frame.type === "event") {
          this._emit(frame.event, frame.payload);
          this._emit("*", { event: frame.event, payload: frame.payload });
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        if (!this.connected) {
          reject(new Error("WebSocket connection error"));
        }
        this._emit("error", new Error("WebSocket error"));
      };

      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        this._stopHeartbeat();
        const wasConnected = this.connected;
        this.connected = false;
        this.connId = null;

        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error("Connection closed"));
        }
        this.pendingRequests.clear();

        if (wasConnected) {
          this._emit("disconnected", {
            code: event.code,
            reason: event.reason,
          });
          // Auto reconnect if not manually disconnected
          if (this._autoReconnect && !this._manualDisconnect) {
            this._scheduleReconnect();
          }
        } else if (!challengeReceived) {
          reject(new Error("Connection closed before handshake"));
        }
      };
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay =
      RECONNECT_DELAYS[
        Math.min(this._reconnectAttempt, RECONNECT_DELAYS.length - 1)
      ];
    this._reconnectAttempt++;
    this._emit("reconnecting", { attempt: this._reconnectAttempt, delay });
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this._doConnect();
      } catch {
        // _doConnect's onclose will trigger another reconnect
      }
    }, delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send a lightweight ping request; if it fails, force reconnect
        this.request("health", {}).catch(() => {
          console.warn("[gateway] heartbeat failed, forcing reconnect");
          this._cleanupWs();
          this.connected = false;
          this.connId = null;
          this._emit("disconnected", { code: 4000, reason: "heartbeat failed" });
          if (this._autoReconnect && !this._manualDisconnect) {
            this._scheduleReconnect();
          }
        });
      }
    }, HEARTBEAT_INTERVAL);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _cleanupWs() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  disconnect() {
    this._manualDisconnect = true;
    this._autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._stopHeartbeat();
    this._cleanupWs();
    this.connected = false;
    this.connId = null;
  }

  // --- Request Helper ---

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws) {
        reject(new Error("Not connected"));
        return;
      }

      const id = crypto.randomUUID();
      const frame = { type: "req", id, method, params };

      this.pendingRequests.set(id, { resolve, reject });

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);

      try {
        this.ws.send(JSON.stringify(frame));
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(new Error("Failed to send: " + err.message));
      }
    });
  }

  // --- Chat Methods ---

  sendMessage(sessionKey, text, attachments = []) {
    const idempotencyKey = crypto.randomUUID();
    return this.request("chat.send", {
      sessionKey: sessionKey || "main",
      message: text,
      attachments,
      idempotencyKey,
      deliver: true,
    });
  }

  getHistory(sessionKey, limit = 200) {
    return this.request("chat.history", {
      sessionKey: sessionKey || "main",
      limit,
    });
  }

  abortRun(sessionKey, runId) {
    const params = { sessionKey: sessionKey || "main" };
    if (runId) params.runId = runId;
    return this.request("chat.abort", params);
  }

  // --- Health/Status ---

  getHealth(probe = false) {
    return this.request("health", { probe });
  }

  getStatus() {
    return this.request("status", {});
  }

  // --- Cron Methods ---

  getCronJobs(opts = {}) {
    return this.request("cron.list", {
      limit: opts.limit || 50,
      offset: opts.offset || 0,
      enabled: opts.enabled || "all",
      sortBy: opts.sortBy || "nextRunAtMs",
      sortDir: opts.sortDir || "asc",
    });
  }

  getCronStatus() {
    return this.request("cron.status", {});
  }

  runCronJob(id) {
    return this.request("cron.run", { id, mode: "force" });
  }

  getCronRuns(jobId, opts = {}) {
    const params = {
      limit: opts.limit || 50,
      offset: opts.offset || 0,
      sortDir: opts.sortDir || "desc",
    };
    if (jobId) {
      params.scope = "job";
      params.id = jobId;
    }
    return this.request("cron.runs", params);
  }

  // --- Sessions ---

  getSessions() {
    return this.request("sessions.list", {});
  }

  // --- Event Listeners ---

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) set.delete(callback);
  }

  _emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (e) {
          console.error(`Event listener error [${event}]:`, e);
        }
      }
    }
  }

  // Convenience event methods
  onChat(callback) {
    return this.on("chat", callback);
  }

  onAgent(callback) {
    return this.on("agent", callback);
  }

  onPresence(callback) {
    return this.on("presence", callback);
  }

  onCron(callback) {
    return this.on("cron", callback);
  }

  onTick(callback) {
    return this.on("tick", callback);
  }
}
