// Organization Chart - Visual hierarchy editor for OpenClaw connections
// Drag and drop to build team structure with managers and subordinates

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { showToast } from "../components/sidebar.js";
import { t } from "../i18n.js";

export function renderOrgChart(container) {
  const state = store.getState();
  const connections = store.getConnections();
  const orgStructure = state.orgStructure || buildDefaultStructure(connections);

  container.innerHTML = `
    <div class="org-chart-container">
      <div class="page-header">
        <h1>${state.lang === "zh" ? "团队组织架构" : "Team Organization"}</h1>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="reset-org-btn">
            ${state.lang === "zh" ? "重置" : "Reset"}
          </button>
          <button class="btn btn-primary" id="save-org-btn">
            ${state.lang === "zh" ? "保存架构" : "Save Structure"}
          </button>
        </div>
      </div>

      <div class="page-body">
        <div class="org-intro">
          <p>${state.lang === "zh"
            ? "📋 拖拽连接卡片来构建团队层级关系。上级可以将任务分配给下级，支持多层级管理。"
            : "📋 Drag connection cards to build team hierarchy. Managers can delegate tasks to subordinates, supports multi-level management."
          }</p>
        </div>

        ${connections.length === 0 ? `
          <div class="empty-state">
            <h3>${state.lang === "zh" ? "暂无连接" : "No Connections"}</h3>
            <p>${state.lang === "zh" ? "请先添加 OpenClaw 连接" : "Please add OpenClaw connections first"}</p>
          </div>
        ` : `
          <div class="org-workspace">
            <!-- Left panel: Available connections -->
            <div class="org-panel org-available">
              <h3>${state.lang === "zh" ? "可用连接" : "Available Connections"}</h3>
              <div class="org-connections-pool" id="connections-pool">
                ${renderConnectionsPool(connections, orgStructure)}
              </div>
            </div>

            <!-- Right panel: Organization chart -->
            <div class="org-panel org-chart-canvas">
              <h3>${state.lang === "zh" ? "组织架构图" : "Organization Chart"}</h3>
              <div class="org-chart-view" id="org-chart-view">
                ${renderOrgTree(orgStructure, connections, state)}
              </div>
            </div>
          </div>

          <!-- Instructions -->
          <div class="org-instructions">
            <h3>${state.lang === "zh" ? "使用说明" : "Instructions"}</h3>
            <ul>
              <li>${state.lang === "zh"
                ? "从左侧拖拽连接到右侧画布，创建根节点（最高层级）"
                : "Drag connections from left to right canvas to create root nodes (top level)"
              }</li>
              <li>${state.lang === "zh"
                ? "拖拽连接到已有节点上，建立上下级关系"
                : "Drag connections onto existing nodes to establish manager-subordinate relationships"
              }</li>
              <li>${state.lang === "zh"
                ? "点击节点可以编辑职责描述"
                : "Click nodes to edit responsibility descriptions"
              }</li>
              <li>${state.lang === "zh"
                ? "支持多层级：CEO → 经理 → 员工 → ..."
                : "Supports multi-level: CEO → Manager → Employee → ..."
              }</li>
            </ul>
          </div>
        `}
      </div>
    </div>
  `;

  if (connections.length > 0) {
    setupOrgChartInteractions(container, orgStructure);
  }
}

function buildDefaultStructure(connections) {
  // Default: all connections are independent (no hierarchy)
  return {
    nodes: {},
    roots: [] // IDs of root-level nodes
  };
}

function renderConnectionsPool(connections, orgStructure) {
  const usedIds = new Set(Object.keys(orgStructure.nodes));
  const available = connections.filter(c => !usedIds.has(c.id));

  if (available.length === 0) {
    return `<div class="pool-empty">所有连接已使用</div>`;
  }

  return available.map(conn => `
    <div class="org-connection-card"
         data-conn-id="${conn.id}"
         draggable="true">
      <div class="conn-card-header">
        <span class="status-dot ${store.getState().connectionStatuses[conn.id] === "connected" ? "connected" : "disconnected"}"></span>
        <strong>${escapeHtml(conn.name)}</strong>
      </div>
      <div class="conn-card-url">${escapeHtml(conn.address)}</div>
    </div>
  `).join("");
}

function renderOrgTree(orgStructure, connections, state) {
  if (orgStructure.roots.length === 0) {
    return `
      <div class="org-empty-canvas">
        <div class="empty-canvas-icon">🏢</div>
        <p>${state.lang === "zh"
          ? "拖拽左侧的连接到这里开始构建组织架构"
          : "Drag connections from left to start building organization"
        }</p>
      </div>
    `;
  }

  return `
    <div class="org-tree">
      ${orgStructure.roots.map(rootId =>
        renderOrgNode(rootId, orgStructure, connections, 0)
      ).join("")}
    </div>
  `;
}

function renderOrgNode(nodeId, orgStructure, connections, level) {
  const node = orgStructure.nodes[nodeId];
  if (!node) return "";

  const conn = connections.find(c => c.id === nodeId);
  if (!conn) return "";

  const isConnected = store.getState().connectionStatuses[nodeId] === "connected";
  const hasSubordinates = node.subordinates && node.subordinates.length > 0;

  return `
    <div class="org-node-wrapper" data-level="${level}">
      <div class="org-node ${hasSubordinates ? 'has-children' : ''}"
           data-node-id="${nodeId}"
           data-droppable="true">
        <div class="node-header">
          <span class="status-dot ${isConnected ? 'connected' : 'disconnected'}"></span>
          <strong>${escapeHtml(conn.name)}</strong>
          <button class="node-remove" data-node-id="${nodeId}" title="移除">×</button>
        </div>
        <div class="node-role">${escapeHtml(node.role || "未设置职责")}</div>
        <div class="node-actions">
          <button class="btn-icon" data-action="edit-role" data-node-id="${nodeId}" title="编辑职责">✏️</button>
          <button class="btn-icon" data-action="add-subordinate" data-node-id="${nodeId}" title="添加下级">➕</button>
        </div>
      </div>

      ${hasSubordinates ? `
        <div class="org-children">
          ${node.subordinates.map(subId =>
            renderOrgNode(subId, orgStructure, connections, level + 1)
          ).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function setupOrgChartInteractions(container, orgStructure) {
  let draggedConnId = null;
  let draggedFromPool = false;

  // Drag from pool
  const poolCards = container.querySelectorAll(".org-connection-card");
  poolCards.forEach(card => {
    card.addEventListener("dragstart", (e) => {
      draggedConnId = card.dataset.connId;
      draggedFromPool = true;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedConnId = null;
      draggedFromPool = false;
    });
  });

  // Drop on canvas (create root)
  const canvas = container.querySelector(".org-chart-view");
  if (canvas) {
    canvas.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      if (draggedConnId && draggedFromPool) {
        addRootNode(draggedConnId, orgStructure);
        renderOrgChart(container);
      }
    });
  }

  // Drop on existing nodes (create subordinate)
  const nodes = container.querySelectorAll(".org-node[data-droppable='true']");
  nodes.forEach(node => {
    node.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.add("drop-target");
      e.dataTransfer.dropEffect = "move";
    });

    node.addEventListener("dragleave", (e) => {
      if (e.target === node) {
        node.classList.remove("drop-target");
      }
    });

    node.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove("drop-target");

      if (draggedConnId && draggedFromPool) {
        const managerId = node.dataset.nodeId;
        addSubordinate(managerId, draggedConnId, orgStructure);
        renderOrgChart(container);
      }
    });
  });

  // Edit role button
  const editButtons = container.querySelectorAll("[data-action='edit-role']");
  editButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const nodeId = btn.dataset.nodeId;
      editNodeRole(nodeId, orgStructure, container);
    });
  });

  // Remove node button
  const removeButtons = container.querySelectorAll(".node-remove");
  removeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const nodeId = btn.dataset.nodeId;
      if (confirm("确定移除此节点？下级节点也会被移除。")) {
        removeNode(nodeId, orgStructure);
        renderOrgChart(container);
      }
    });
  });

  // Save button
  const saveBtn = container.querySelector("#save-org-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveOrgStructure(orgStructure);
    });
  }

  // Reset button
  const resetBtn = container.querySelector("#reset-org-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("确定重置组织架构？")) {
        const connections = store.getConnections();
        const newStructure = buildDefaultStructure(connections);
        store.setState({ orgStructure: newStructure });
        renderOrgChart(container);
      }
    });
  }
}

function addRootNode(connId, orgStructure) {
  if (!orgStructure.nodes[connId]) {
    orgStructure.nodes[connId] = {
      id: connId,
      role: "请设置职责描述",
      subordinates: []
    };
    orgStructure.roots.push(connId);
  }
}

function addSubordinate(managerId, subordinateId, orgStructure) {
  // Create subordinate node if not exists
  if (!orgStructure.nodes[subordinateId]) {
    orgStructure.nodes[subordinateId] = {
      id: subordinateId,
      role: "请设置职责描述",
      subordinates: [],
      manager: managerId
    };
  }

  // Add to manager's subordinates
  const manager = orgStructure.nodes[managerId];
  if (manager && !manager.subordinates.includes(subordinateId)) {
    manager.subordinates.push(subordinateId);
  }

  // Update subordinate's manager
  orgStructure.nodes[subordinateId].manager = managerId;
}

function removeNode(nodeId, orgStructure) {
  const node = orgStructure.nodes[nodeId];
  if (!node) return;

  // Remove from manager's subordinates
  if (node.manager) {
    const manager = orgStructure.nodes[node.manager];
    if (manager) {
      manager.subordinates = manager.subordinates.filter(id => id !== nodeId);
    }
  } else {
    // Remove from roots
    orgStructure.roots = orgStructure.roots.filter(id => id !== nodeId);
  }

  // Recursively remove subordinates
  if (node.subordinates) {
    node.subordinates.forEach(subId => removeNode(subId, orgStructure));
  }

  // Delete node
  delete orgStructure.nodes[nodeId];
}

function editNodeRole(nodeId, orgStructure, container) {
  const node = orgStructure.nodes[nodeId];
  if (!node) return;

  const currentRole = node.role || "";
  const newRole = prompt("设置职责描述：", currentRole);

  if (newRole !== null) {
    node.role = newRole.trim() || "未设置职责";
    renderOrgChart(container);
  }
}

function saveOrgStructure(orgStructure) {
  store.setState({ orgStructure });
  localStorage.setItem("openclaw-hub.org-structure", JSON.stringify(orgStructure));
  showToast("组织架构已保存", "success");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Export utilities for task routing
export function getSubordinates(managerId) {
  const state = store.getState();
  const orgStructure = state.orgStructure;
  if (!orgStructure || !orgStructure.nodes[managerId]) {
    return [];
  }
  return orgStructure.nodes[managerId].subordinates || [];
}

export function getNodeRole(nodeId) {
  const state = store.getState();
  const orgStructure = state.orgStructure;
  if (!orgStructure || !orgStructure.nodes[nodeId]) {
    return null;
  }
  return orgStructure.nodes[nodeId].role;
}

export function getAllSubordinatesRecursive(managerId) {
  const state = store.getState();
  const orgStructure = state.orgStructure;
  if (!orgStructure) return [];

  const result = [];
  const queue = [managerId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const node = orgStructure.nodes[currentId];

    if (node && node.subordinates) {
      for (const subId of node.subordinates) {
        result.push(subId);
        queue.push(subId);
      }
    }
  }

  return result;
}
