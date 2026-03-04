// Login page component

import { store } from "../store.js";

export function renderLogin() {
  const container = document.getElementById("app");
  container.innerHTML = "";

  const page = document.createElement("div");
  page.className = "login-page";
  page.innerHTML = `
    <div class="login-card">
      <h1>OpenClaw Hub</h1>
      <p>Multi-instance web frontend for OpenClaw. Enter a username to get started.</p>
      <form id="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" placeholder="Enter your name" autofocus />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">
          Continue
        </button>
      </form>
    </div>
  `;

  container.appendChild(page);

  const form = page.querySelector("#login-form");
  const input = page.querySelector("#username");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    store.setUsername(name);
  });
}
