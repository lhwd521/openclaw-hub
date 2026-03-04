// Chat page

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { renderMessage } from "../components/message.js";
import { createFileUpload } from "../components/file-upload.js";
import { showToast } from "../components/sidebar.js";
import { t } from "../i18n.js";

let chatUnsubs = [];
let pendingAttachments = [];

export function renderChat(container) {
  cleanupChat();

  const state = store.getState();
  const connId = state.activeConnectionId;
  const client = connId ? connectionManager.getClient(connId) : null;
  const conn = connId ? store.getConnection(connId) : null;
  const isConnected = state.connectionStatuses[connId] === "connected";
  const busy = state.isBusy[connId] || false;

  if (!connId || !conn) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>${t("chat.no_connection")}</h3>
        <p>${t("chat.no_connection_desc")}</p>
      </div>
    `;
    return;
  }

  // Online users for this connection (filter out disconnected and system entries)
  const onlineUsers = filterOnlineUsers(state.onlineUsers[connId] || []);
  const onlineNames = onlineUsers
    .map((u) => u.host || u.displayName || u.instanceId || "")
    .filter((n) => n);

  container.innerHTML = `
    <div class="chat-container">
      <div class="page-header">
        <h1>${escapeHtml(conn.name)}</h1>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="status-dot ${isConnected ? "connected" : "disconnected"}" style="display:inline-block"></span>
          <span style="font-size:13px;color:var(--text-secondary)">${isConnected ? t("chat.connected") : t("chat.disconnected")}</span>
          ${busy ? `<button class="btn btn-sm btn-danger" id="abort-btn">${t("chat.abort")}</button>` : ""}
        </div>
      </div>
      ${onlineNames.length > 0 ? `<div class="online-users-bar" id="online-users-bar">${t("status.online_users")}: ${onlineNames.map((n) => `<span class="online-user-tag">${escapeHtml(n)}</span>`).join("")}</div>` : ""}
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-area">
        <div class="file-preview" id="file-preview"></div>
        <div class="chat-input-row">
          <div class="file-upload-btn" id="file-upload-trigger" title="Attach image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
          </div>
          <textarea id="chat-input" placeholder="${isConnected ? t("chat.placeholder") : t("chat.placeholder_disabled")}" rows="1" ${isConnected ? "" : "disabled"}></textarea>
          <button class="btn btn-primary" id="send-btn" ${isConnected ? "" : "disabled"}>${t("chat.send")}</button>
        </div>
        <div class="chat-status" id="chat-status"></div>
      </div>
    </div>
  `;

  const messagesEl = container.querySelector("#chat-messages");
  const inputEl = container.querySelector("#chat-input");
  const sendBtn = container.querySelector("#send-btn");
  const abortBtn = container.querySelector("#abort-btn");
  const statusEl = container.querySelector("#chat-status");

  // File upload
  const fileUpload = createFileUpload(
    container.querySelector("#file-upload-trigger"),
    container.querySelector("#file-preview"),
    (files) => {
      pendingAttachments = files;
    }
  );

  // Auto-resize textarea
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
  });

  // Send on Enter (Shift+Enter for newline)
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);

  if (abortBtn) {
    abortBtn.addEventListener("click", async () => {
      if (client) {
        try {
          await client.abortRun("main");
          showToast(t("chat.abort_success"), "success");
        } catch (err) {
          showToast(t("chat.abort_fail") + err.message, "error");
        }
      }
    });
  }

  // Load history
  if (client && isConnected) {
    loadHistory(client, messagesEl);
  }

  // Stream events — follows OpenClaw's own chat event handling pattern
  if (client) {
    let streamContent = "";
    let streamEl = null;
    let busyTimer = null;

    function resetBusyTimer() {
      if (busyTimer) clearTimeout(busyTimer);
      busyTimer = setTimeout(() => {
        if (streamEl) {
          streamEl = null;
          streamContent = "";
        }
        statusEl.innerHTML = "";
        store.setBusy(connId, false);
      }, 120000);
    }

    const chatUnsub = client.onChat((payload) => {
      if (payload.state === "delta") {
        if (!streamEl) {
          streamEl = appendStreamMessage(messagesEl);
          statusEl.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div> ${t("chat.generating")}`;
        }
        resetBusyTimer();
        if (payload.message?.content) {
          // Delta contains FULL accumulated text (replacement, not increment)
          // This matches OpenClaw's own implementation
          const next = extractMessageText(payload.message);
          if (next && next.length >= streamContent.length) {
            streamContent = next;
          }
          updateStreamMessage(streamEl, streamContent);
          scrollToBottom(messagesEl);
        }
      } else if (payload.state === "final" || payload.state === "aborted" || payload.state === "error") {
        if (busyTimer) { clearTimeout(busyTimer); busyTimer = null; }
        if (payload.state === "error") {
          if (streamEl) {
            updateStreamMessage(streamEl, streamContent + "\n\n[Error: " + (payload.errorMessage || "unknown error") + "]");
          }
        } else if (payload.state === "final" || payload.state === "aborted") {
          // Use final message if available; fallback to accumulated stream
          const finalText = payload.message ? extractMessageText(payload.message) : "";
          if (streamEl) {
            updateStreamMessage(streamEl, finalText || streamContent);
            scrollToBottom(messagesEl);
          } else if (finalText) {
            appendMessage(messagesEl, "assistant", finalText);
            scrollToBottom(messagesEl);
          }
        }
        streamEl = null;
        streamContent = "";
        statusEl.innerHTML = "";
        store.setBusy(connId, false);
        // Reload full history on final/aborted to pick up messages from other users
        // (their sent messages aren't broadcast, only visible in history)
        if (client && (payload.state === "final" || payload.state === "aborted")) {
          loadHistory(client, messagesEl);
        }
      }
    });

    // On reconnect, clear orphaned stream state (same as OpenClaw's onHello handler)
    const reconnectUnsub = client.on("connected", () => {
      if (streamEl) {
        // Save partial stream as a message if there's content
        if (streamContent.trim()) {
          updateStreamMessage(streamEl, streamContent);
        }
        streamEl = null;
        streamContent = "";
      }
      statusEl.innerHTML = "";
    });

    chatUnsubs.push(chatUnsub);
    chatUnsubs.push(reconnectUnsub);

    // Update online users bar when presence changes
    const presenceUnsub = client.onPresence((payload) => {
      const bar = container.querySelector("#online-users-bar");
      if (payload?.presence) {
        const names = filterOnlineUsers(payload.presence)
          .map((u) => u.host || u.displayName || "")
          .filter((n) => n);
        if (names.length > 0) {
          const html = `${t("status.online_users")}: ${names.map((n) => `<span class="online-user-tag">${escapeHtml(n)}</span>`).join("")}`;
          if (bar) {
            bar.innerHTML = html;
          } else {
            const newBar = document.createElement("div");
            newBar.className = "online-users-bar";
            newBar.id = "online-users-bar";
            newBar.innerHTML = html;
            const header = container.querySelector(".page-header");
            if (header) header.after(newBar);
          }
        } else if (bar) {
          bar.remove();
        }
      }
    });
    chatUnsubs.push(presenceUnsub);
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (!client || !isConnected) return;

    const displayText = text || t("chat.attachment");

    const attachments = [...pendingAttachments];
    pendingAttachments = [];
    if (fileUpload.clear) fileUpload.clear();

    appendMessage(messagesEl, "user", displayText, attachments.length > 0 ? attachments : undefined);
    scrollToBottom(messagesEl);

    inputEl.value = "";
    inputEl.style.height = "auto";

    try {
      store.setBusy(connId, true);
      await client.sendMessage("main", text, attachments);
    } catch (err) {
      showToast(t("chat.send_fail") + err.message, "error");
      store.setBusy(connId, false);
      // Restore message to input if send failed so user can retry
      if (text) {
        inputEl.value = text;
        inputEl.style.height = "auto";
        inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
      }
    }
  }
}

export function cleanupChat() {
  for (const unsub of chatUnsubs) unsub();
  chatUnsubs = [];
  pendingAttachments = [];
}

async function loadHistory(client, messagesEl) {
  try {
    const result = await client.getHistory("main", 100);
    if (result?.messages) {
      messagesEl.innerHTML = "";
      for (const msg of result.messages) {
        // Pass raw content array to renderMessage so images are displayed
        if (Array.isArray(msg.content) && msg.content.length > 0) {
          appendMessage(messagesEl, msg.role, msg.content);
        } else {
          const text = extractMessageText(msg);
          if (text) {
            appendMessage(messagesEl, msg.role, text);
          }
        }
      }
      scrollToBottom(messagesEl);
    }
  } catch (err) {
    console.warn("Failed to load history:", err);
  }
}

function appendMessage(container, role, content, attachments) {
  const el = renderMessage(role, content, attachments);
  container.appendChild(el);
}

function appendStreamMessage(container) {
  const el = renderMessage("assistant", "");
  el.classList.add("streaming");
  container.appendChild(el);
  return el;
}

function updateStreamMessage(el, text) {
  const bubble = el.querySelector(".message-bubble");
  if (bubble) bubble.textContent = text;
}

function extractMessageText(msg) {
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
  }
  return "";
}

function scrollToBottom(el) {
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Filter presence list: remove disconnected users and system entries
function filterOnlineUsers(users) {
  if (!Array.isArray(users)) return [];
  return users.filter((u) => {
    if (u.reason === "disconnect") return false;
    if (u.reason === "self") return false;
    if (u.mode === "node" || u.mode === "gateway") return false;
    return true;
  });
}
