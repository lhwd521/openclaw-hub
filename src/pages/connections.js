// Connections management page

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { showToast } from "../components/sidebar.js";
import { t } from "../i18n.js";

export function renderConnections(container) {
  const state = store.getState();

  container.innerHTML = `
    <div class="page-header">
      <h1>${t("conn.title")}</h1>
      <button class="btn btn-primary" id="add-conn-btn">${t("conn.add")}</button>
    </div>
    <div class="page-body">
      <div class="connections-grid" id="conn-grid"></div>
    </div>
  `;

  const grid = container.querySelector("#conn-grid");
  renderConnectionCards(grid, state);

  container.querySelector("#add-conn-btn").addEventListener("click", () => {
    showAddModal();
  });
}

function renderConnectionCards(grid, state) {
  grid.innerHTML = "";

  if (state.connections.length === 0) {
    grid.innerHTML = `
      <div class="add-connection-card" id="add-card-empty">
        ${t("conn.add_first")}
      </div>
    `;
    grid.querySelector("#add-card-empty").addEventListener("click", showAddModal);
    return;
  }

  for (const conn of state.connections) {
    const status = state.connectionStatuses[conn.id] || "disconnected";
    const card = document.createElement("div");
    card.className = "connection-card";
    card.innerHTML = `
      <div class="connection-card-header">
        <h3>
          <span class="status-dot ${status}"></span>
          ${escapeHtml(conn.name)}
        </h3>
        <div class="connection-card-actions">
          <button class="btn btn-sm edit-btn" data-id="${conn.id}">${t("conn.edit")}</button>
          <button class="btn btn-sm btn-danger delete-btn" data-id="${conn.id}">${t("conn.delete")}</button>
        </div>
      </div>
      <div class="connection-card-url">${escapeHtml(conn.url)}</div>
      <div class="connection-card-footer">
        ${
          status === "connected"
            ? `<button class="btn btn-sm disconnect-btn" data-id="${conn.id}">${t("conn.disconnect")}</button>
               <button class="btn btn-sm btn-primary select-btn" data-id="${conn.id}">${t("conn.open")}</button>`
            : status === "connecting"
            ? `<button class="btn btn-sm" disabled>${t("conn.connecting")}</button>`
            : `<button class="btn btn-sm btn-primary connect-btn" data-id="${conn.id}">${t("conn.connect")}</button>`
        }
      </div>
    `;
    grid.appendChild(card);
  }

  // Event delegation
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains("connect-btn")) {
      connectionManager.connect(id);
    } else if (btn.classList.contains("disconnect-btn")) {
      connectionManager.disconnect(id);
    } else if (btn.classList.contains("select-btn")) {
      store.setActiveConnection(id);
      store.setActivePage("chat");
    } else if (btn.classList.contains("edit-btn")) {
      showEditModal(id);
    } else if (btn.classList.contains("delete-btn")) {
      if (confirm(t("conn.remove_confirm"))) {
        connectionManager.disconnect(id);
        store.removeConnection(id);
      }
    }
  });
}

function showAddModal(prefill = null) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>${prefill ? t("conn.edit_title") : t("conn.add_title")}</h2>
      <form id="conn-form">
        <div class="form-group">
          <label>${t("conn.name")}</label>
          <input type="text" id="conn-name" placeholder='${t("conn.name.placeholder")}' value="${escapeHtml(prefill?.name || "")}" />
        </div>
        <div class="form-group">
          <label>${t("conn.address")}</label>
          <input type="url" id="conn-url" placeholder="${t("conn.address.placeholder")}" value="${escapeHtml(prefill?.url || "")}" />
        </div>
        <div class="form-group">
          <label>${t("conn.token")}</label>
          <input type="password" id="conn-token" placeholder="${t("conn.token.placeholder")}" value="${escapeHtml(prefill?.token || "")}" />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn cancel-btn">${t("conn.cancel")}</button>
          <button type="button" class="btn btn-primary test-btn">${t("conn.test")}</button>
          <button type="submit" class="btn btn-primary">${prefill ? t("conn.save") : t("conn.add")}</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector(".cancel-btn").addEventListener("click", () => {
    overlay.remove();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.querySelector(".test-btn").addEventListener("click", async () => {
    const url = overlay.querySelector("#conn-url").value.trim();
    const token = overlay.querySelector("#conn-token").value.trim();
    if (!url || !token) {
      showToast(t("conn.fill_url_token"), "error");
      return;
    }
    const testBtn = overlay.querySelector(".test-btn");
    testBtn.disabled = true;
    testBtn.textContent = t("conn.testing");
    try {
      const { OpenClawClient } = await import("../gateway.js");
      const client = new OpenClawClient(url, token, store.getState().username);
      await client.connect();
      client.disconnect();
      showToast(t("conn.test_success"), "success");
    } catch (err) {
      showToast(t("conn.test_fail") + err.message, "error");
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = t("conn.test");
    }
  });

  overlay.querySelector("#conn-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = overlay.querySelector("#conn-name").value.trim();
    const url = overlay.querySelector("#conn-url").value.trim();
    const token = overlay.querySelector("#conn-token").value.trim();

    if (!name || !url || !token) {
      showToast(t("conn.fill_all"), "error");
      return;
    }

    if (prefill?.id) {
      store.updateConnection(prefill.id, { name, url: url.replace(/\/$/, ""), token });
    } else {
      store.addConnection({ name, url, token });
    }
    overlay.remove();
  });
}

function showEditModal(id) {
  const conn = store.getConnection(id);
  if (conn) showAddModal(conn);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
