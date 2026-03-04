// Roles management page - assign roles to OpenClaw connections
// Enables intelligent task routing based on connection capabilities

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { showToast } from "../components/sidebar.js";
import { t } from "../i18n.js";

// Predefined role templates
const ROLE_TEMPLATES = {
  zh: [
    { id: "data-analyst", name: "数据分析师", icon: "📊", description: "数据分析、网络爬虫、数据可视化" },
    { id: "finance-advisor", name: "财务顾问", icon: "💰", description: "个人财务分析、投资建议、预算规划" },
    { id: "scriptwriter", name: "编剧助手", icon: "🎬", description: "剧本创作、故事构思、角色设计" },
    { id: "project-manager", name: "项目经理", icon: "👔", description: "任务协调、团队管理、进度跟踪" },
    { id: "developer", name: "开发工程师", icon: "💻", description: "代码编写、调试、技术方案设计" },
    { id: "designer", name: "设计师", icon: "🎨", description: "UI/UX 设计、视觉创意、原型制作" },
    { id: "researcher", name: "研究员", icon: "🔬", description: "学术研究、文献综述、实验设计" },
    { id: "translator", name: "翻译", icon: "🌐", description: "多语言翻译、本地化、文化适配" },
    { id: "custom", name: "自定义角色", icon: "⚙️", description: "自定义专业领域" }
  ],
  en: [
    { id: "data-analyst", name: "Data Analyst", icon: "📊", description: "Data analysis, web scraping, visualization" },
    { id: "finance-advisor", name: "Finance Advisor", icon: "💰", description: "Personal finance, investment advice, budgeting" },
    { id: "scriptwriter", name: "Scriptwriter", icon: "🎬", description: "Script writing, story development, character design" },
    { id: "project-manager", name: "Project Manager", icon: "👔", description: "Task coordination, team management, progress tracking" },
    { id: "developer", name: "Developer", icon: "💻", description: "Coding, debugging, technical design" },
    { id: "designer", name: "Designer", icon: "🎨", description: "UI/UX design, visual creativity, prototyping" },
    { id: "researcher", name: "Researcher", icon: "🔬", description: "Academic research, literature review, experiment design" },
    { id: "translator", name: "Translator", icon: "🌐", description: "Multi-language translation, localization" },
    { id: "custom", name: "Custom Role", icon: "⚙️", description: "Custom expertise area" }
  ]
};

export function renderRoles(container) {
  const state = store.getState();
  const connections = store.getConnections();
  const lang = state.lang || "zh";
  const templates = ROLE_TEMPLATES[lang];

  container.innerHTML = `
    <div class="roles-container">
      <div class="page-header">
        <h1>${lang === "zh" ? "角色管理" : "Role Management"}</h1>
        <button class="btn btn-primary" id="save-roles-btn">
          ${lang === "zh" ? "保存配置" : "Save Configuration"}
        </button>
      </div>

      <div class="page-body">
        <div class="roles-intro">
          <p>${lang === "zh"
            ? "为每个 OpenClaw 连接分配专业角色，实现智能任务路由。项目经理角色可以自动将任务分配给合适的专家。"
            : "Assign professional roles to each OpenClaw connection for intelligent task routing. Project Manager role can automatically delegate tasks to appropriate experts."
          }</p>
        </div>

        ${connections.length === 0 ? `
          <div class="empty-state">
            <h3>${lang === "zh" ? "暂无连接" : "No Connections"}</h3>
            <p>${lang === "zh" ? "请先添加 OpenClaw 连接" : "Please add OpenClaw connections first"}</p>
          </div>
        ` : `
          <div class="roles-grid">
            ${connections.map(conn => renderConnectionRole(conn, state, templates, lang)).join("")}
          </div>

          <div class="role-templates">
            <h3>${lang === "zh" ? "可用角色模板" : "Available Role Templates"}</h3>
            <div class="templates-grid">
              ${templates.map(tpl => `
                <div class="template-card" data-role-id="${tpl.id}">
                  <div class="template-icon">${tpl.icon}</div>
                  <div class="template-name">${tpl.name}</div>
                  <div class="template-desc">${tpl.description}</div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="workflow-section">
            <h3>${lang === "zh" ? "工作流程示例" : "Workflow Example"}</h3>
            <div class="workflow-example">
              <div class="workflow-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <strong>${lang === "zh" ? "用户向项目经理提问" : "User asks Project Manager"}</strong>
                  <p>${lang === "zh" ? "\"帮我分析一下最近的股票走势，并写一个投资报告\"" : "\"Analyze recent stock trends and write an investment report\""}</p>
                </div>
              </div>
              <div class="workflow-arrow">↓</div>
              <div class="workflow-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <strong>${lang === "zh" ? "项目经理分解任务" : "PM breaks down task"}</strong>
                  <p>${lang === "zh" ? "识别需要：数据分析师（抓取数据）+ 财务顾问（分析建议）" : "Identifies need: Data Analyst (fetch data) + Finance Advisor (analysis)"}</p>
                </div>
              </div>
              <div class="workflow-arrow">↓</div>
              <div class="workflow-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <strong>${lang === "zh" ? "并行执行" : "Parallel execution"}</strong>
                  <p>${lang === "zh" ? "数据分析师抓取股票数据 || 财务顾问准备分析框架" : "Data Analyst fetches stock data || Finance Advisor prepares analysis framework"}</p>
                </div>
              </div>
              <div class="workflow-arrow">↓</div>
              <div class="workflow-step">
                <div class="step-number">4</div>
                <div class="step-content">
                  <strong>${lang === "zh" ? "项目经理汇总" : "PM summarizes"}</strong>
                  <p>${lang === "zh" ? "整合数据和分析，生成最终报告" : "Integrates data and analysis, generates final report"}</p>
                </div>
              </div>
            </div>
          </div>
        `}
      </div>
    </div>
  `;

  // Drag and drop functionality
  setupDragAndDrop(container, connections);

  // Save button
  const saveBtn = container.querySelector("#save-roles-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveRolesConfiguration);
  }
}

function renderConnectionRole(conn, state, templates, lang) {
  const roleData = state.connectionRoles?.[conn.id] || {};
  const isConnected = state.connectionStatuses[conn.id] === "connected";

  return `
    <div class="connection-role-card ${isConnected ? 'connected' : ''}" data-conn-id="${conn.id}">
      <div class="role-card-header">
        <div class="connection-info">
          <span class="status-dot ${isConnected ? 'connected' : 'disconnected'}"></span>
          <strong>${escapeHtml(conn.name)}</strong>
        </div>
        <div class="role-badge" data-role="${roleData.roleId || 'none'}">
          ${roleData.icon || "❓"} ${roleData.roleName || (lang === "zh" ? "未分配" : "Unassigned")}
        </div>
      </div>

      <div class="role-card-body">
        <div class="role-dropzone" data-conn-id="${conn.id}">
          ${roleData.roleId ? `
            <div class="assigned-role">
              <div class="role-icon">${roleData.icon}</div>
              <div class="role-details">
                <div class="role-name">${roleData.roleName}</div>
                <div class="role-description">${roleData.description || ""}</div>
                ${roleData.customPrompt ? `
                  <div class="custom-prompt">
                    <strong>${lang === "zh" ? "自定义提示词：" : "Custom Prompt:"}</strong>
                    <p>${escapeHtml(roleData.customPrompt)}</p>
                  </div>
                ` : ""}
              </div>
              <button class="btn btn-sm remove-role" data-conn-id="${conn.id}">
                ${lang === "zh" ? "移除" : "Remove"}
              </button>
            </div>
          ` : `
            <div class="empty-dropzone">
              ${lang === "zh" ? "拖拽角色模板到这里" : "Drag role template here"}
            </div>
          `}
        </div>

        ${roleData.roleId === "custom" ? `
          <div class="custom-role-input">
            <input type="text"
                   class="custom-role-name"
                   placeholder="${lang === "zh" ? "角色名称" : "Role name"}"
                   value="${roleData.customName || ""}"
                   data-conn-id="${conn.id}">
            <textarea class="custom-role-prompt"
                      placeholder="${lang === "zh" ? "输入角色的专业领域和能力描述..." : "Enter role expertise and capabilities..."}"
                      data-conn-id="${conn.id}">${roleData.customPrompt || ""}</textarea>
          </div>
        ` : ""}
      </div>

      <div class="role-card-footer">
        <small>${conn.address}</small>
      </div>
    </div>
  `;
}

function setupDragAndDrop(container, connections) {
  // Make template cards draggable
  const templateCards = container.querySelectorAll(".template-card");
  templateCards.forEach(card => {
    card.draggable = true;
    card.addEventListener("dragstart", (e) => {
      const roleId = card.dataset.roleId;
      const roleData = {
        id: roleId,
        icon: card.querySelector(".template-icon").textContent,
        name: card.querySelector(".template-name").textContent,
        description: card.querySelector(".template-desc").textContent
      };
      e.dataTransfer.setData("application/json", JSON.stringify(roleData));
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });
  });

  // Make dropzones accept drops
  const dropzones = container.querySelectorAll(".role-dropzone");
  dropzones.forEach(zone => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => {
      zone.classList.remove("drag-over");
    });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");

      const roleData = JSON.parse(e.dataTransfer.getData("application/json"));
      const connId = zone.dataset.connId;

      assignRoleToConnection(connId, roleData);

      // Re-render the page
      renderRoles(container);
    });
  });

  // Remove role buttons
  const removeButtons = container.querySelectorAll(".remove-role");
  removeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const connId = btn.dataset.connId;
      removeRoleFromConnection(connId);
      renderRoles(container);
    });
  });

  // Custom role inputs
  const customInputs = container.querySelectorAll(".custom-role-name, .custom-role-prompt");
  customInputs.forEach(input => {
    input.addEventListener("change", () => {
      const connId = input.dataset.connId;
      updateCustomRole(connId);
    });
  });
}

function assignRoleToConnection(connId, roleData) {
  const state = store.getState();
  const roles = state.connectionRoles || {};

  roles[connId] = {
    roleId: roleData.id,
    roleName: roleData.name,
    icon: roleData.icon,
    description: roleData.description,
    assignedAt: new Date().toISOString()
  };

  store.setState({ connectionRoles: roles });
  localStorage.setItem("openclaw-hub.roles", JSON.stringify(roles));
}

function removeRoleFromConnection(connId) {
  const state = store.getState();
  const roles = state.connectionRoles || {};
  delete roles[connId];

  store.setState({ connectionRoles: roles });
  localStorage.setItem("openclaw-hub.roles", JSON.stringify(roles));
}

function updateCustomRole(connId) {
  const nameInput = document.querySelector(`.custom-role-name[data-conn-id="${connId}"]`);
  const promptInput = document.querySelector(`.custom-role-prompt[data-conn-id="${connId}"]`);

  const state = store.getState();
  const roles = state.connectionRoles || {};

  if (roles[connId]) {
    roles[connId].customName = nameInput?.value || "";
    roles[connId].customPrompt = promptInput?.value || "";

    store.setState({ connectionRoles: roles });
    localStorage.setItem("openclaw-hub.roles", JSON.stringify(roles));
  }
}

function saveRolesConfiguration() {
  const state = store.getState();
  const roles = state.connectionRoles || {};

  // Validate that at least one PM exists
  const hasPM = Object.values(roles).some(r => r.roleId === "project-manager");

  if (!hasPM) {
    const lang = state.lang || "zh";
    showToast(
      lang === "zh"
        ? "建议至少分配一个项目经理角色用于任务协调"
        : "Recommend assigning at least one Project Manager role for task coordination",
      "warning"
    );
  }

  showToast(
    state.lang === "zh" ? "角色配置已保存" : "Role configuration saved",
    "success"
  );
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Export role utilities for use in chat
export function getConnectionRole(connId) {
  const state = store.getState();
  return state.connectionRoles?.[connId];
}

export function getConnectionsByRole(roleId) {
  const state = store.getState();
  const roles = state.connectionRoles || {};
  const connections = store.getConnections();

  return connections.filter(conn => roles[conn.id]?.roleId === roleId);
}

export function getProjectManagers() {
  return getConnectionsByRole("project-manager");
}
