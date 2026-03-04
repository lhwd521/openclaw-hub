// Login page component

import { store } from "../store.js";
import { t, toggleLang } from "../i18n.js";

export function renderLogin() {
  const container = document.getElementById("app");
  container.innerHTML = "";

  const page = document.createElement("div");
  page.className = "login-page";
  page.innerHTML = `
    <div class="login-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h1>${t("login.title")}</h1>
        <button class="btn btn-sm" id="lang-toggle">${t("lang.toggle")}</button>
      </div>
      <p>${t("login.subtitle")}</p>
      <form id="login-form">
        <div class="form-group">
          <label for="username">${t("login.username")}</label>
          <input type="text" id="username" placeholder="${t("login.username.placeholder")}" autofocus />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">
          ${t("login.submit")}
        </button>
      </form>
    </div>
  `;

  container.appendChild(page);

  page.querySelector("#lang-toggle").addEventListener("click", () => {
    toggleLang();
    renderLogin();
  });

  const form = page.querySelector("#login-form");
  const input = page.querySelector("#username");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    store.setUsername(name);
  });
}
