// Cron jobs dashboard

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { showToast } from "../components/sidebar.js";
import { t } from "../i18n.js";

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
        <h3>${t("cron.no_connection")}</h3>
        <p>${t("cron.no_connection_desc")}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>${t("cron.title")} - ${escapeHtml(conn.name)}</h1>
      <button class="btn btn-sm" id="refresh-cron">${t("cron.refresh")}</button>
    </div>
    <div class="page-body">
      <div id="cron-status-section" style="margin-bottom:20px">
        <div class="status-card" style="display:inline-block">
          <h3>${t("cron.service")}</h3>
          <div id="cron-service-status" class="status-value">${t("status.loading")}</div>
        </div>
      </div>
      <div id="cron-table-container">
        <p style="color:var(--text-muted)">${t("cron.loading")}</p>
      </div>
      <div id="cron-detail-container" style="margin-top:24px;display:none">
        <h3 style="font-size:14px;margin-bottom:12px">${t("cron.detail_title")} <button class="btn btn-sm" id="close-detail">${t("cron.close")}</button></h3>
        <div id="cron-detail-content"></div>
      </div>
      <div id="cron-runs-container" style="margin-top:24px;display:none">
        <h3 style="font-size:14px;margin-bottom:12px">${t("cron.recent_runs")} <button class="btn btn-sm" id="close-runs">${t("cron.close")}</button></h3>
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
      el.textContent = status?.enabled !== false ? t("cron.active") : t("cron.disabled");
      el.className = `status-value ${status?.enabled !== false ? "idle" : "busy"}`;
    }
  } catch {
    const el = document.getElementById("cron-service-status");
    if (el) el.textContent = t("cron.unknown");
  }

  // Load cron jobs
  try {
    const result = await client.getCronJobs();
    const jobs = result?.jobs || result?.items || [];
    renderCronTable(jobs, client);
  } catch (err) {
    const container = document.getElementById("cron-table-container");
    if (container) {
      container.innerHTML = `<p style="color:var(--error)">${t("cron.load_fail")}${escapeHtml(err.message)}</p>`;
    }
  }
}

function renderCronTable(jobs, client) {
  const container = document.getElementById("cron-table-container");
  if (!container) return;

  if (jobs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>${t("cron.no_jobs")}</h3>
        <p>${t("cron.no_jobs_desc")}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="cron-table">
      <thead>
        <tr>
          <th>${t("cron.col_name")}</th>
          <th>${t("cron.col_schedule")}</th>
          <th>${t("cron.col_status")}</th>
          <th>${t("cron.col_last_run")}</th>
          <th>${t("cron.col_next_run")}</th>
          <th>${t("cron.col_actions")}</th>
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
      <td><span class="cron-status-badge ${job.enabled !== false ? "enabled" : "disabled"}">${job.enabled !== false ? t("cron.enabled") : t("cron.disabled")}</span></td>
      <td style="font-size:12px">${lastRun}</td>
      <td style="font-size:12px">${nextRun}</td>
      <td>
        <button class="btn btn-sm detail-job-btn" data-id="${escapeHtml(job.id)}">${t("cron.detail")}</button>
        <button class="btn btn-sm run-job-btn" data-id="${escapeHtml(job.id)}">${t("cron.run_now")}</button>
        <button class="btn btn-sm view-runs-btn" data-id="${escapeHtml(job.id)}">${t("cron.runs")}</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Build job lookup map
  const jobMap = new Map();
  for (const job of jobs) {
    jobMap.set(job.id, job);
  }

  // Event delegation
  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const jobId = btn.dataset.id;

    if (btn.classList.contains("detail-job-btn")) {
      showJobDetail(jobMap.get(jobId));
    } else if (btn.classList.contains("run-job-btn")) {
      btn.disabled = true;
      btn.textContent = t("cron.running");
      try {
        await client.runCronJob(jobId);
        showToast(t("cron.job_triggered"), "success");
      } catch (err) {
        showToast(t("cron.job_fail") + err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = t("cron.run_now");
      }
    } else if (btn.classList.contains("view-runs-btn")) {
      loadRuns(client, jobId);
    }
  });
}

function showJobDetail(job) {
  const detailContainer = document.getElementById("cron-detail-container");
  const detailContent = document.getElementById("cron-detail-content");
  if (!detailContainer || !detailContent || !job) return;

  detailContainer.style.display = "block";

  // Build readable detail
  const rows = [];
  if (job.id) rows.push(["ID", job.id]);
  if (job.name) rows.push(["名称 / Name", job.name]);
  if (job.enabled !== undefined) rows.push(["状态 / Status", job.enabled !== false ? "✓ Enabled" : "✗ Disabled"]);

  // Schedule detail
  if (job.schedule) {
    if (job.schedule.kind === "cron") {
      rows.push(["计划类型 / Type", "Cron"]);
      const expr = job.schedule.expr || "-";
      const desc = describeCron(expr);
      rows.push(["Cron 表达式 / Expr", desc ? `${desc}  (${expr})` : expr]);
      if (job.schedule.timezone) rows.push(["时区 / Timezone", job.schedule.timezone]);
    } else if (job.schedule.kind === "every") {
      rows.push(["计划类型 / Type", "Interval"]);
      rows.push(["间隔 / Interval", formatInterval(job.schedule.everyMs)]);
    } else if (job.schedule.kind === "at") {
      rows.push(["计划类型 / Type", "Once"]);
      rows.push(["执行时间 / At", new Date(job.schedule.at).toLocaleString()]);
    } else {
      rows.push(["计划 / Schedule", JSON.stringify(job.schedule, null, 2)]);
    }
  }

  if (job.lastRunAtMs) rows.push(["上次执行 / Last Run", formatTime(job.lastRunAtMs)]);
  if (job.nextRunAtMs) rows.push(["下次执行 / Next Run", formatTime(job.nextRunAtMs)]);
  if (job.prompt) rows.push(["Prompt", job.prompt]);
  if (job.message) rows.push(["Message", job.message]);
  if (job.sessionKey) rows.push(["Session", job.sessionKey]);

  // Render as table
  detailContent.innerHTML = `
    <table class="cron-table" style="max-width:600px">
      <tbody>
        ${rows.map(([label, value]) => {
          const isLong = typeof value === "string" && (value.length > 80 || value.includes("\n"));
          return `<tr>
            <td style="font-size:12px;color:var(--text-secondary);white-space:nowrap;vertical-align:top;width:140px"><strong>${escapeHtml(label)}</strong></td>
            <td style="font-size:13px;${isLong ? "white-space:pre-wrap;" : ""}">${escapeHtml(String(value))}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    <details style="margin-top:12px">
      <summary style="font-size:12px;color:var(--text-muted);cursor:pointer">JSON</summary>
      <pre style="background:var(--bg-tertiary);padding:12px;border-radius:4px;overflow-x:auto;margin-top:8px;font-size:12px"><code>${escapeHtml(JSON.stringify(job, null, 2))}</code></pre>
    </details>
  `;

  document.getElementById("close-detail")?.addEventListener("click", () => {
    detailContainer.style.display = "none";
  });

  detailContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatInterval(ms) {
  if (!ms) return "-";
  if (ms >= 86400000) return `${(ms / 86400000).toFixed(1)} 天 / days`;
  if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)} 小时 / hours`;
  if (ms >= 60000) return `${(ms / 60000).toFixed(0)} 分钟 / minutes`;
  return `${(ms / 1000).toFixed(0)} 秒 / seconds`;
}

async function loadRuns(client, jobId) {
  const runsContainer = document.getElementById("cron-runs-container");
  const runsList = document.getElementById("cron-runs-list");
  if (!runsContainer || !runsList) return;

  runsContainer.style.display = "block";
  runsList.innerHTML = `<p style="color:var(--text-muted)">${t("status.loading")}</p>`;

  document.getElementById("close-runs")?.addEventListener("click", () => {
    runsContainer.style.display = "none";
  });

  try {
    const result = await client.getCronRuns(jobId);
    const runs = result?.runs || result?.items || [];

    if (runs.length === 0) {
      runsList.innerHTML = `<p style="color:var(--text-muted)">${t("cron.no_runs")}</p>`;
      return;
    }

    runsList.innerHTML = `
      <table class="cron-table">
        <thead>
          <tr>
            <th>${t("cron.col_time")}</th>
            <th>${t("cron.col_status")}</th>
            <th>${t("cron.col_duration")}</th>
            <th>${t("cron.col_details")}</th>
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
    runsList.innerHTML = `<p style="color:var(--error)">${t("cron.runs_fail")}${escapeHtml(err.message)}</p>`;
  }
}

function formatSchedule(schedule) {
  if (!schedule) return "Unknown";
  if (schedule.kind === "cron") {
    const expr = schedule.expr || "cron";
    const desc = describeCron(expr);
    return desc ? `${desc}  (${expr})` : expr;
  }
  if (schedule.kind === "every") {
    const ms = schedule.everyMs || 0;
    if (ms >= 86400000) return `每 ${(ms / 86400000).toFixed(1)} 天`;
    if (ms >= 3600000) return `每 ${(ms / 3600000).toFixed(1)} 小时`;
    if (ms >= 60000) return `每 ${(ms / 60000).toFixed(0)} 分钟`;
    return `每 ${(ms / 1000).toFixed(0)} 秒`;
  }
  if (schedule.kind === "at") return `一次性  ${new Date(schedule.at).toLocaleString()}`;
  return JSON.stringify(schedule);
}

// Parse standard 5-field cron expression into human-readable Chinese
function describeCron(expr) {
  if (!expr || typeof expr !== "string") return "";
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return "";

  const [min, hour, dom, mon, dow] = parts;

  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const monNames = ["", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

  // Helper: pad time
  const pad = (v) => v.padStart(2, "0");

  // "every minute" — * * * * *
  if (min === "*" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return "每分钟";
  }

  // Every N minutes — */N * * * *
  const everyMin = min.match(/^\*\/(\d+)$/);
  if (everyMin && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `每 ${everyMin[1]} 分钟`;
  }

  // Every N hours — 0 */N * * *
  const everyHour = hour.match(/^\*\/(\d+)$/);
  if (everyHour && dom === "*" && mon === "*" && dow === "*") {
    return `每 ${everyHour[1]} 小时 (${pad(min)} 分)`;
  }

  // Build time string for fixed hour:min
  let timeStr = "";
  if (hour !== "*" && min !== "*" && !hour.includes("/") && !min.includes("/")) {
    // Could be comma-separated hours
    const hours = hour.split(",");
    const mins = min.split(",");
    if (hours.length === 1 && mins.length === 1) {
      timeStr = `${pad(hours[0])}:${pad(mins[0])}`;
    } else if (mins.length === 1) {
      timeStr = hours.map((h) => `${pad(h)}:${pad(mins[0])}`).join(", ");
    } else {
      timeStr = `${hour}:${min}`;
    }
  }

  // Daily — M H * * *
  if (dom === "*" && mon === "*" && dow === "*" && timeStr) {
    return `每天 ${timeStr}`;
  }

  // Weekly — M H * * D
  if (dom === "*" && mon === "*" && dow !== "*" && timeStr) {
    const days = dow.split(",").map((d) => {
      const n = parseInt(d, 10);
      return isNaN(n) ? d : (dayNames[n] || d);
    });
    return `每周${days.join("、")} ${timeStr}`;
  }

  // Monthly — M H D * *
  if (dom !== "*" && mon === "*" && dow === "*" && timeStr) {
    const days = dom.split(",").join("、");
    return `每月 ${days} 日 ${timeStr}`;
  }

  // Yearly — M H D Mo *
  if (dom !== "*" && mon !== "*" && dow === "*" && timeStr) {
    const months = mon.split(",").map((m) => {
      const n = parseInt(m, 10);
      return isNaN(n) ? m : (monNames[n] || `${m}月`);
    });
    return `每年 ${months.join("、")} ${dom}日 ${timeStr}`;
  }

  return "";
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
