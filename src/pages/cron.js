// Cron jobs dashboard

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { showToast } from "../components/sidebar.js";

let cronInterval = null;

export function renderCron(container) {
  clearInterval(cronInterval);

  const state = store.getState();
  const connId = state.activeConnectionId;
  const conn = connId ? store.getConnection(connId) : null;
  const client = connId ? connectionManager.getClient(connId) : null;
  const isConnected = state.connectionStatuses[connId] === "connected";

  if (!connId || !conn) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No connection selected</h3>
        <p>Select a VPS from the sidebar to view cron jobs.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>Cron Jobs - ${escapeHtml(conn.name)}</h1>
      <button class="btn btn-sm" id="refresh-cron">Refresh</button>
    </div>
    <div class="page-body">
      <div id="cron-status-section" style="margin-bottom:20px">
        <div class="status-card" style="display:inline-block">
          <h3>Cron Service</h3>
          <div id="cron-service-status" class="status-value">Loading...</div>
        </div>
      </div>
      <div id="cron-table-container">
        <p style="color:var(--text-muted)">Loading cron jobs...</p>
      </div>
      <div id="cron-runs-container" style="margin-top:24px;display:none">
        <h3 style="font-size:14px;margin-bottom:12px">Recent Runs <button class="btn btn-sm" id="close-runs">Close</button></h3>
        <div id="cron-runs-list"></div>
      </div>
    </div>
  `;

  container.querySelector("#refresh-cron").addEventListener("click", () => {
    loadCronData(client);
  });

  if (isConnected && client) {
    loadCronData(client);
    cronInterval = setInterval(() => loadCronData(client), 60000);
  }
}

export function cleanupCron() {
  clearInterval(cronInterval);
  cronInterval = null;
}

async function loadCronData(client) {
  if (!client) return;

  // Load cron status
  try {
    const status = await client.getCronStatus();
    const el = document.getElementById("cron-service-status");
    if (el) {
      el.textContent = status?.enabled !== false ? "Active" : "Disabled";
      el.className = `status-value ${status?.enabled !== false ? "idle" : "busy"}`;
    }
  } catch {
    const el = document.getElementById("cron-service-status");
    if (el) el.textContent = "Unknown";
  }

  // Load cron jobs
  try {
    const result = await client.getCronJobs();
    const jobs = result?.jobs || result?.items || [];
    renderCronTable(jobs, client);
  } catch (err) {
    const container = document.getElementById("cron-table-container");
    if (container) {
      container.innerHTML = `<p style="color:var(--error)">Failed to load cron jobs: ${escapeHtml(err.message)}</p>`;
    }
  }
}

function renderCronTable(jobs, client) {
  const container = document.getElementById("cron-table-container");
  if (!container) return;

  if (jobs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No cron jobs</h3>
        <p>No scheduled tasks configured on this VPS.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="cron-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Schedule</th>
          <th>Status</th>
          <th>Last Run</th>
          <th>Next Run</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="cron-tbody"></tbody>
    </table>
  `;

  const tbody = container.querySelector("#cron-tbody");

  for (const job of jobs) {
    const tr = document.createElement("tr");
    const scheduleText = formatSchedule(job.schedule);
    const lastRun = job.lastRunAtMs ? formatTime(job.lastRunAtMs) : "-";
    const nextRun = job.nextRunAtMs ? formatTime(job.nextRunAtMs) : "-";

    tr.innerHTML = `
      <td><strong>${escapeHtml(job.name || job.id)}</strong></td>
      <td style="font-family:var(--font-mono);font-size:12px">${escapeHtml(scheduleText)}</td>
      <td><span class="cron-status-badge ${job.enabled !== false ? "enabled" : "disabled"}">${job.enabled !== false ? "Enabled" : "Disabled"}</span></td>
      <td style="font-size:12px">${lastRun}</td>
      <td style="font-size:12px">${nextRun}</td>
      <td>
        <button class="btn btn-sm run-job-btn" data-id="${escapeHtml(job.id)}">Run Now</button>
        <button class="btn btn-sm view-runs-btn" data-id="${escapeHtml(job.id)}">Runs</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Event delegation
  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const jobId = btn.dataset.id;

    if (btn.classList.contains("run-job-btn")) {
      btn.disabled = true;
      btn.textContent = "Running...";
      try {
        await client.runCronJob(jobId);
        showToast("Job triggered", "success");
      } catch (err) {
        showToast(`Failed: ${err.message}`, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Run Now";
      }
    } else if (btn.classList.contains("view-runs-btn")) {
      loadRuns(client, jobId);
    }
  });
}

async function loadRuns(client, jobId) {
  const runsContainer = document.getElementById("cron-runs-container");
  const runsList = document.getElementById("cron-runs-list");
  if (!runsContainer || !runsList) return;

  runsContainer.style.display = "block";
  runsList.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  document.getElementById("close-runs")?.addEventListener("click", () => {
    runsContainer.style.display = "none";
  });

  try {
    const result = await client.getCronRuns(jobId, { limit: 20 });
    const runs = result?.runs || result?.items || [];

    if (runs.length === 0) {
      runsList.innerHTML = '<p style="color:var(--text-muted)">No runs recorded.</p>';
      return;
    }

    runsList.innerHTML = `
      <table class="cron-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${runs
            .map(
              (run) => `
            <tr>
              <td style="font-size:12px">${formatTime(run.startedAtMs || run.ts)}</td>
              <td><span class="cron-status-badge ${run.status === "ok" ? "enabled" : "disabled"}">${escapeHtml(run.status || "unknown")}</span></td>
              <td style="font-size:12px">${run.durationMs ? (run.durationMs / 1000).toFixed(1) + "s" : "-"}</td>
              <td style="font-size:12px;color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(run.errorMessage || run.summary || "-")}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    runsList.innerHTML = `<p style="color:var(--error)">Failed: ${escapeHtml(err.message)}</p>`;
  }
}

function formatSchedule(schedule) {
  if (!schedule) return "Unknown";
  if (schedule.kind === "cron") return schedule.expr || "cron";
  if (schedule.kind === "every") {
    const ms = schedule.everyMs || 0;
    if (ms >= 3600000) return `Every ${(ms / 3600000).toFixed(1)}h`;
    if (ms >= 60000) return `Every ${(ms / 60000).toFixed(0)}m`;
    return `Every ${(ms / 1000).toFixed(0)}s`;
  }
  if (schedule.kind === "at") return `Once at ${new Date(schedule.at).toLocaleString()}`;
  return JSON.stringify(schedule);
}

function formatTime(ms) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
