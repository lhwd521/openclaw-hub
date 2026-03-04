// Chat message component

import { t } from "../i18n.js";

export function renderMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;

  const roleLabel = document.createElement("div");
  roleLabel.className = "message-role";
  roleLabel.textContent = role === "user" ? t("chat.you") : role === "assistant" ? t("chat.assistant") : t("chat.system");

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;

  wrapper.appendChild(roleLabel);
  wrapper.appendChild(bubble);

  return wrapper;
}
