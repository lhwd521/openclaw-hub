// Connections management page

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { showToast } from "../components/sidebar.js";

export function renderConnections(container) {
  const state = store.getState();

  container.innerHTML = `
    <div class="page-header">
      <h1>Connections</h1>
      <button class="btn btn-primary" id="add-conn-btn">+ Add Connection</button>
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
        + Add your first VPS connection
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
          <button class="btn btn-sm edit-btn" data-id="${conn.id}">Edit</button>
          <button class="btn btn-sm btn-danger delete-btn" data-id="${conn.id}">Delete</button>
        </div>
      </div>
      <div class="connection-card-url">${escapeHtml(conn.url)}</div>
      <div class="connection-card-footer">
        ${
          status === "connected"
            ? `<button class="btn btn-sm disconnect-btn" data-id="${conn.id}">Disconnect</button>
               <button class="btn btn-sm btn-primary select-btn" data-id="${conn.id}">Open</button>`
            : status === "connecting"
            ? `<button class="btn btn-sm" disabled>Connecting...</button>`
            : `<button class="btn btn-sm btn-primary connect-btn" data-id="${conn.id}">Connect</button>`
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
      if (confirm("Remove this connection?")) {
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
      <h2>${prefill ? "Edit Connection" : "Add Connection"}</h2>
      <form id="conn-form">
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="conn-name" placeholder='e.g. "Work VPS"' value="${escapeHtml(prefill?.name || "")}" />
        </div>
        <div class="form-group">
          <label>Address</label>
          <input type="url" id="conn-url" placeholder="https://xxx.trycloudflare.com" value="${escapeHtml(prefill?.url || "")}" />
        </div>
        <div class="form-group">
          <label>Token</label>
          <input type="password" id="conn-token" placeholder="Gateway token" value="${escapeHtml(prefill?.token || "")}" />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary test-btn">Test</button>
          <button type="submit" class="btn btn-primary">${prefill ? "Save" : "Add"}</button>
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
      showToast("Please fill in address and token", "error");
      return;
    }
    const testBtn = overlay.querySelector(".test-btn");
    testBtn.disabled = true;
    testBtn.textContent = "Testing...";
    try {
      const { OpenClawClient } = await import("../gateway.js");
      const client = new OpenClawClient(url, token, store.getState().username);
      await client.connect();
      client.disconnect();
      showToast("Connection successful!", "success");
    } catch (err) {
      showToast(`Connection failed: ${err.message}`, "error");
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = "Test";
    }
  });

  overlay.querySelector("#conn-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = overlay.querySelector("#conn-name").value.trim();
    const url = overlay.querySelector("#conn-url").value.trim();
    const token = overlay.querySelector("#conn-token").value.trim();

    if (!name || !url || !token) {
      showToast("Please fill in all fields", "error");
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
