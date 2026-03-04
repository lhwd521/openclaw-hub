// Chat page

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { renderMessage, renderMarkdown } from "../components/message.js";
import { createFileUpload } from "../components/file-upload.js";
import { showToast } from "../components/sidebar.js";
import { t } from "../i18n.js";
import { getSubordinates, getNodeRole } from "./org-chart.js";

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

  // Check if this connection has subordinates (is a manager)
  const subordinates = connId ? getSubordinates(connId) : [];
  const isManager = subordinates.length > 0;
  const teamRoutingEnabled = localStorage.getItem("openclaw-hub.team-routing") === "true";

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
          ${isManager ? `
            <label class="routing-toggle" style="margin-left:12px">
              <input type="checkbox" id="team-routing-toggle" ${teamRoutingEnabled ? "checked" : ""}>
              <span>🤖 ${state.lang === "zh" ? "团队协作" : "Team Mode"}</span>
            </label>
          ` : ""}
          ${busy ? `<button class="btn btn-sm btn-danger" id="abort-btn">${t("chat.abort")}</button>` : ""}
        </div>
      </div>
      ${isManager && subordinates.length > 0 ? `
        <div class="team-info-bar">
          👥 ${state.lang === "zh" ? "管理" : "Managing"} ${subordinates.length} ${state.lang === "zh" ? "个下属" : "subordinates"}
        </div>
      ` : ""}
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
  const teamRoutingToggle = container.querySelector("#team-routing-toggle");

  // Team routing toggle
  if (teamRoutingToggle) {
    teamRoutingToggle.addEventListener("change", (e) => {
      localStorage.setItem("openclaw-hub.team-routing", e.target.checked);
      showToast(
        e.target.checked
          ? (state.lang === "zh" ? "已启用团队协作模式" : "Team mode enabled")
          : (state.lang === "zh" ? "已禁用团队协作模式" : "Team mode disabled"),
        "success"
      );
    });
  }

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

    // Check if should use team routing
    const useTeamRouting = isManager && teamRoutingEnabled && !pendingAttachments.length;

    // Separate images and text-based files
    const imageAttachments = pendingAttachments.filter(f => f.type === "image");
    const textFiles = pendingAttachments.filter(f => f.type === "text");

    // Build message text: original text + extracted text from documents
    let messageText = text;
    for (const file of textFiles) {
      if (file.text) {
        messageText += `\n\n[文件: ${file.fileName}]\n${file.text}`;
      }
    }

    const displayText = messageText || t("chat.attachment");

    const attachments = [...pendingAttachments];
    pendingAttachments = [];
    if (fileUpload.clear) fileUpload.clear();

    appendMessage(messagesEl, "user", displayText, imageAttachments.length > 0 ? imageAttachments : undefined);
    scrollToBottom(messagesEl);

    inputEl.value = "";
    inputEl.style.height = "auto";

    try {
      store.setBusy(connId, true);

      if (useTeamRouting) {
        // Use team routing
        await sendWithTeamRouting(messageText, messagesEl, statusEl);
      } else {
        // Send only images as attachments, text content is in messageText
        await client.sendMessage("main", messageText, imageAttachments);
      }
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

  async function sendWithTeamRouting(userMessage, messagesEl, statusEl) {
    // Build team context
    const teamContext = buildTeamContext(connId, subordinates);
    const fullPrompt = `${teamContext}\n\n用户任务：${userMessage}`;

    // Send to manager
    await client.sendMessage("main", fullPrompt);
  }

  function buildTeamContext(managerId, subordinateIds) {
    const state = store.getState();
    const lang = state.lang || "zh";

    const teamMembers = subordinateIds
      .map(subId => {
        const conn = store.getConnection(subId);
        const role = getNodeRole(subId);
        const status = state.connectionStatuses[subId];
        if (!conn) return null;
        return {
          name: conn.name,
          role: role || (lang === "zh" ? "未设置职责" : "No role set"),
          online: status === "connected"
        };
      })
      .filter(m => m !== null);

    if (teamMembers.length === 0) {
      return lang === "zh"
        ? "[系统信息] 你是管理者，但当前没有可用的团队成员。"
        : "[System] You are a manager, but no team members are currently available.";
    }

    const header = lang === "zh"
      ? "[系统信息] 你是团队管理者，可以协调以下团队成员完成任务："
      : "[System] You are a team manager. You can coordinate the following team members:";

    const memberList = teamMembers
      .map((m, i) => `${i + 1}. ${m.name} (${m.online ? (lang === "zh" ? "在线" : "online") : (lang === "zh" ? "离线" : "offline")})\n   ${lang === "zh" ? "职责" : "Role"}: ${m.role}`)
      .join("\n\n");

    const instructions = lang === "zh"
      ? `\n\n如果需要团队协作，请返回 JSON 格式：\n{\n  "delegate": true,\n  "tasks": [\n    {"member": "成员名称", "task": "具体任务描述"}\n  ],\n  "reason": "分配理由"\n}\n\n如果你自己能完成，直接回答即可。`
      : `\n\nIf team collaboration is needed, return JSON format:\n{\n  "delegate": true,\n  "tasks": [\n    {"member": "member name", "task": "specific task description"}\n  ],\n  "reason": "delegation reason"\n}\n\nIf you can complete it yourself, answer directly.`;

    return `${header}\n\n${memberList}${instructions}`;
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
  if (bubble) {
    // Clear existing content and render with markdown
    bubble.innerHTML = "";
    const div = document.createElement("div");
    div.className = "message-text";
    div.innerHTML = renderMarkdown(text);
    bubble.appendChild(div);
  }
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
