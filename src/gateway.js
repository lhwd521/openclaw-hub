// OpenClaw Gateway WebSocket Client
// Implements protocol v3 compatible with OpenClaw Gateway

const PROTOCOL_VERSION = 3;

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
    this.connId = null;
    this.snapshot = null;
    this.features = null;
    this.instanceId = crypto.randomUUID();
  }

  // --- Connection Management ---

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.disconnect();
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
                id: "openclaw-control-ui",
                version: "1.0.0",
                platform: "web",
                mode: "webchat",
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
              this.connId = payload.server?.connId;
              this.snapshot = payload.snapshot;
              this.features = payload.features;
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
        const wasConnected = this.connected;
        this.connected = false;
        this.connId = null;

        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error("Connection closed"));
        }
        this.pendingRequests.clear();

        if (wasConnected) {
          this._emit("disconnected", { code: event.code, reason: event.reason });
        } else if (!challengeReceived) {
          reject(new Error("Connection closed before handshake"));
        }
      };
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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

      this.ws.send(JSON.stringify(frame));
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
