// Chat enhancements for intelligent task routing
// Add this to chat.js to enable PM-based task delegation

import { shouldUseTaskRouting, routeTask } from "../components/task-router.js";
import { getConnectionRole } from "./roles.js";

/**
 * Enhanced sendMessage with intelligent routing support
 * Insert this into chat.js sendMessage function
 */
export async function sendMessageWithRouting(connId, text, attachments, messagesEl, statusEl) {
  const role = getConnectionRole(connId);
  const isPM = role?.roleId === "project-manager";
  const routingEnabled = localStorage.getItem("openclaw-hub.routing-enabled") === "true";

  // Check if should use intelligent routing
  if (isPM && routingEnabled && !attachments?.length) {
    return await sendWithTaskRouting(connId, text, messagesEl, statusEl);
  } else {
    return await sendDirectMessage(connId, text, attachments, messagesEl, statusEl);
  }
}

async function sendWithTaskRouting(connId, text, messagesEl, statusEl) {
  // Show routing progress
  const progressEl = document.createElement("div");
  progressEl.className = "routing-progress";
  progressEl.innerHTML = `
    <div class="routing-stage">
      <div class="stage-icon">🤔</div>
      <div class="stage-text">项目经理正在分析任务...</div>
    </div>
  `;
  messagesEl.appendChild(progressEl);
  scrollToBottom(messagesEl);

  const result = await routeTask(connId, text, (progress) => {
    updateRoutingProgress(progressEl, progress);
    scrollToBottom(messagesEl);
  });

  if (!result) {
    // Fallback to direct execution
    progressEl.remove();
    return await sendDirectMessage(connId, text, [], messagesEl, statusEl);
  }

  // Show final result
  progressEl.remove();

  // Show routing plan
  if (result.routing) {
    const planEl = createRoutingPlanElement(result.routing);
    messagesEl.appendChild(planEl);
  }

  // Show specialist results
  if (result.execution?.results) {
    for (const r of result.execution.results) {
      const resultEl = createSpecialistResultElement(r);
      messagesEl.appendChild(resultEl);
    }
  }

  // Show PM summary
  if (result.summary) {
    const summaryEl = renderMessage("assistant", result.summary);
    summaryEl.classList.add("pm-summary");
    messagesEl.appendChild(summaryEl);
  }

  scrollToBottom(messagesEl);
}

function updateRoutingProgress(progressEl, progress) {
  const icons = {
    analyzing: "🤔",
    planning: "📋",
    executing: "⚙️",
    summarizing: "📊",
    error: "❌"
  };

  progressEl.innerHTML = `
    <div class="routing-stage">
      <div class="stage-icon">${icons[progress.stage] || "⏳"}</div>
      <div class="stage-text">${progress.message}</div>
    </div>
    ${progress.routing ? `
      <div class="routing-plan-preview">
        <strong>策略：</strong>${progress.routing.strategy === "parallel" ? "并行执行" : progress.routing.strategy === "sequential" ? "顺序执行" : "单人执行"}
        <br>
        <strong>分配：</strong>${progress.routing.assignments?.length || 0} 个专家
      </div>
    ` : ""}
  `;
}

function createRoutingPlanElement(routing) {
  const el = document.createElement("div");
  el.className = "routing-plan";
  el.innerHTML = `
    <div class="plan-header">
      <span class="plan-icon">📋</span>
      <strong>任务分配方案</strong>
    </div>
    <div class="plan-body">
      <div class="plan-strategy">
        <strong>执行策略：</strong>
        ${routing.strategy === "parallel" ? "🔀 并行执行" : routing.strategy === "sequential" ? "➡️ 顺序执行" : "👤 单人执行"}
      </div>
      ${routing.reasoning ? `
        <div class="plan-reasoning">
          <strong>分配理由：</strong>${routing.reasoning}
        </div>
      ` : ""}
      <div class="plan-assignments">
        ${routing.assignments.map((a, i) => `
          <div class="assignment-item">
            <div class="assignment-number">${i + 1}</div>
            <div class="assignment-details">
              <div class="assignment-role">${a.specialistRole}</div>
              <div class="assignment-task">${a.subtask}</div>
              ${a.estimatedTime ? `<div class="assignment-time">预计：${a.estimatedTime}</div>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  return el;
}

function createSpecialistResultElement(result) {
  const el = document.createElement("div");
  el.className = `specialist-result ${result.status}`;
  el.innerHTML = `
    <div class="result-header">
      <span class="result-icon">${result.status === "success" ? "✅" : "❌"}</span>
      <strong>${result.specialistRole}</strong>
      ${result.duration ? `<span class="result-duration">${Math.round(result.duration / 1000)}s</span>` : ""}
    </div>
    <div class="result-task">${result.subtask}</div>
    ${result.status === "success" ? `
      <div class="result-output">${result.output}</div>
    ` : `
      <div class="result-error">错误：${result.error}</div>
    `}
  `;
  return el;
}

async function sendDirectMessage(connId, text, attachments, messagesEl, statusEl) {
  // Original sendMessage logic
  const client = connectionManager.getClient(connId);
  if (!client) return;

  // Separate images and text files
  const imageAttachments = attachments?.filter(f => f.type === "image") || [];
  const textFiles = attachments?.filter(f => f.type === "text") || [];

  // Build message text
  let messageText = text;
  for (const file of textFiles) {
    if (file.text) {
      messageText += `\n\n[文件: ${file.fileName}]\n${file.text}`;
    }
  }

  const displayText = messageText || t("chat.attachment");

  appendMessage(messagesEl, "user", displayText, imageAttachments.length > 0 ? imageAttachments : undefined);
  scrollToBottom(messagesEl);

  try {
    store.setBusy(connId, true);
    await client.sendMessage("main", messageText, imageAttachments);
  } catch (err) {
    showToast(t("chat.send_fail") + err.message, "error");
    store.setBusy(connId, false);
  }
}

/**
 * Add routing toggle to chat header
 */
export function addRoutingToggle(headerEl, connId) {
  const role = getConnectionRole(connId);
  if (role?.roleId !== "project-manager") return;

  const routingEnabled = localStorage.getItem("openclaw-hub.routing-enabled") === "true";

  const toggle = document.createElement("label");
  toggle.className = "routing-toggle";
  toggle.innerHTML = `
    <input type="checkbox" id="routing-toggle" ${routingEnabled ? "checked" : ""}>
    <span>🤖 智能路由</span>
  `;

  toggle.querySelector("input").addEventListener("change", (e) => {
    localStorage.setItem("openclaw-hub.routing-enabled", e.target.checked);
    showToast(
      e.target.checked ? "已启用智能任务路由" : "已禁用智能任务路由",
      "success"
    );
  });

  headerEl.appendChild(toggle);
}
