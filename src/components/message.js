// Chat message component — supports text + image content

import { t } from "../i18n.js";

/**
 * Render a chat message bubble.
 * @param {string} role - "user" | "assistant" | "system"
 * @param {string|Array} content - plain text string, or content array from API
 * @param {Array} [attachments] - optional image attachments [{mimeType, content}]
 */
export function renderMessage(role, content, attachments) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;

  const roleLabel = document.createElement("div");
  roleLabel.className = "message-role";
  roleLabel.textContent =
    role === "user"
      ? t("chat.you")
      : role === "assistant"
        ? t("chat.assistant")
        : t("chat.system");

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  // Handle content array (from API history) or plain string
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && block.text) {
        const p = document.createElement("div");
        p.className = "message-text";
        p.textContent = block.text;
        bubble.appendChild(p);
      } else if (block.type === "image") {
        const img = createImageEl(block);
        if (img) bubble.appendChild(img);
      }
    }
  } else if (typeof content === "string") {
    const p = document.createElement("div");
    p.className = "message-text";
    p.textContent = content;
    bubble.appendChild(p);
  }

  // Render inline attachments (from user upload)
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      const img = document.createElement("img");
      img.className = "message-image";
      img.src = `data:${att.mimeType};base64,${att.content}`;
      img.alt = att.fileName || "image";
      bubble.appendChild(img);
    }
  }

  wrapper.appendChild(roleLabel);
  wrapper.appendChild(bubble);

  return wrapper;
}

// Create image element from API content block
function createImageEl(block) {
  const img = document.createElement("img");
  img.className = "message-image";
  if (block.source) {
    // API format: { source: { type: "base64", media_type, data } }
    if (block.source.type === "base64") {
      img.src = `data:${block.source.media_type};base64,${block.source.data}`;
    } else if (block.source.type === "url") {
      img.src = block.source.url;
    } else {
      return null;
    }
  } else if (block.data && block.mimeType) {
    // Simplified format: { data, mimeType }
    img.src = `data:${block.mimeType};base64,${block.data}`;
  } else {
    return null;
  }
  img.alt = "image";
  return img;
}
