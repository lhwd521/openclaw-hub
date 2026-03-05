// Chat message component — supports text + image + markdown

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
        renderTextBlock(bubble, block.text, role);
      } else if (block.type === "image") {
        const img = createImageEl(block);
        if (img) bubble.appendChild(img);
      }
    }
  } else if (typeof content === "string") {
    renderTextBlock(bubble, content, role);
  }

  // Render inline attachments (from user upload)
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.type === "image") {
        const img = document.createElement("img");
        img.className = "message-image";
        img.src = `data:${att.mimeType};base64,${att.content}`;
        img.alt = att.fileName || "image";
        bubble.appendChild(img);
      } else if (att.type === "text") {
        // Document attachment - show file name badge
        const badge = document.createElement("div");
        badge.className = "message-file-badge";
        const ext = att.fileName.split(".").pop().toUpperCase();
        badge.textContent = `📄 ${ext}: ${att.fileName}`;
        bubble.appendChild(badge);
      }
    }
  }

  wrapper.appendChild(roleLabel);
  wrapper.appendChild(bubble);

  return wrapper;
}

// Render text with markdown for assistant, JSON detection for system, plain for user
function renderTextBlock(bubble, text, role) {
  if (role === "system" && looksLikeJson(text)) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    try {
      code.textContent = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      code.textContent = text;
    }
    pre.appendChild(code);
    bubble.appendChild(pre);
  } else if (role === "assistant") {
    const div = document.createElement("div");
    div.className = "message-text";
    div.innerHTML = renderMarkdown(text);
    bubble.appendChild(div);
  } else {
    const div = document.createElement("div");
    div.className = "message-text";
    div.textContent = text;
    bubble.appendChild(div);
  }
}

function looksLikeJson(text) {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
         (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

// Simple markdown renderer — handles common patterns safely
export function renderMarkdown(text) {
  // Escape HTML first
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks: ```lang\n...\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // URLs: convert plain text URLs to clickable links
  // Match http/https URLs, avoiding trailing punctuation
  html = html.replace(
    /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>'
  );

  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_ (but not inside words)
  html = html.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, "<em>$1</em>");
  html = html.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, "<em>$1</em>");

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

// Create image element from API content block
function createImageEl(block) {
  const img = document.createElement("img");
  img.className = "message-image";
  if (block.source) {
    if (block.source.type === "base64") {
      img.src = `data:${block.source.media_type};base64,${block.source.data}`;
    } else if (block.source.type === "url") {
      img.src = block.source.url;
    } else {
      return null;
    }
  } else if (block.data && block.mimeType) {
    img.src = `data:${block.mimeType};base64,${block.data}`;
  } else {
    return null;
  }
  img.alt = "image";
  return img;
}
